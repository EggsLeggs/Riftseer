"use client";

import * as React from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listAuditLogAction } from "@/features/admin/actions";
import type { AdminAuditEntry, AdminAuditPage } from "@/features/admin/types";
import { ADMIN_AUDIT_ACTIONS } from "@riftseer/types/admin-actions";
import { AdminPageHeader } from "./admin-page-header";
import { SelectField, TextField } from "./admin-form-field";
import { AdminListState, AdminPager } from "./admin-list";

const PAGE_SIZE = 50;

// The database decides these; a copy beside the filter silently returns
// nothing when it drifts. `admin-actions.test.ts` holds the two together.
const ACTIONS = ADMIN_AUDIT_ACTIONS;

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value || "unknown";
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function AdminAuditLogView() {
  const [action, setAction] = React.useState("");
  const [targetId, setTargetId] = React.useState("");
  const [targetIdInput, setTargetIdInput] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [expanded, setExpanded] = React.useState<number | null>(null);

  const log = useQuery({
    queryKey: ["admin", "audit-log", action, targetId, page],
    queryFn: async (): Promise<AdminAuditPage> => {
      const result = await listAuditLogAction({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        action: action || undefined,
        target_id: targetId || undefined,
      });
      // Server actions resolve rather than throw, so surface the API's message
      // through TanStack Query's error state instead of rendering an empty log.
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    placeholderData: keepPreviousData,
    retry: false,
  });

  React.useEffect(() => {
    setPage(0);
  }, [action, targetId]);

  const entries = log.data?.entries ?? [];
  const total = log.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <AdminPageHeader
        title="Audit log"
        description="Every admin change, newest first. Expand a row to see the exact payload that was submitted."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Audit log" }]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void log.refetch()}
            disabled={log.isFetching}
          >
            <RotateCw aria-hidden="true" />
            {log.isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setTargetId(targetIdInput.trim());
        }}
        className="mb-6 flex flex-wrap items-end gap-3"
      >
        <SelectField
          id="audit-action"
          label="Action"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          options={[
            { value: "", label: "All actions" },
            ...ACTIONS.map((value) => ({ value, label: value })),
          ]}
        />
        <TextField
          id="audit-target"
          label="Printing or oracle ID, set or format code"
          className="min-w-56 flex-1"
          value={targetIdInput}
          onChange={(e) => setTargetIdInput(e.target.value)}
          placeholder="67f4064886be8495f7165dd7"
        />
        <Button type="submit" variant="outline">
          Filter
        </Button>
        {(action || targetId) && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setAction("");
              setTargetId("");
              setTargetIdInput("");
            }}
          >
            Clear
          </Button>
        )}
      </form>

      <AdminListState
        isError={log.isError}
        isPending={log.isPending}
        isEmpty={entries.length === 0}
        errorMessage={
          log.error instanceof Error
            ? log.error.message
            : "Couldn't load the audit log."
        }
        loadingMessage="Loading audit log…"
        emptyMessage="No admin changes recorded yet."
      >
          <p className="text-muted-foreground mb-3 text-sm">
            {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
            {totalPages > 1 ? ` · page ${page + 1} of ${totalPages}` : ""}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <AuditRow
                  key={entry.id}
                  entry={entry}
                  expanded={expanded === entry.id}
                  onToggle={() =>
                    setExpanded((current) =>
                      current === entry.id ? null : entry.id,
                    )
                  }
                />
              ))}
            </TableBody>
          </Table>

          <AdminPager page={page} totalPages={totalPages} onPageChange={setPage} />
      </AdminListState>
    </>
  );
}

function AuditRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: AdminAuditEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  // `printing` specifically, not any card-ish target: the editor route resolves
  // its id as a printing, so an `oracle` target_id — a UUID — would 404 there.
  const linksToEditor = entry.target_type === "printing" && entry.target_id;

  return (
    <>
      <TableRow>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? "Hide payload" : "Show payload"}
          >
            {expanded ? (
              <ChevronDown aria-hidden="true" />
            ) : (
              <ChevronRight aria-hidden="true" />
            )}
          </Button>
        </TableCell>
        <TableCell className="whitespace-nowrap">
          {formatTimestamp(entry.created_at)}
        </TableCell>
        <TableCell className="font-medium">{entry.action}</TableCell>
        <TableCell className="max-w-56 truncate font-mono text-xs">
          {linksToEditor ? (
            <Link
              href={`/admin/cards/${encodeURIComponent(entry.target_id!)}/edit`}
              className="underline-offset-4 hover:underline"
            >
              {entry.target_id}
            </Link>
          ) : (
            (entry.target_id ?? entry.target_type)
          )}
        </TableCell>
        <TableCell
          className="text-muted-foreground max-w-40 truncate font-mono text-xs"
          title={entry.actor_id}
        >
          {entry.actor_id}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={5} className="bg-muted/40">
            <pre className="overflow-x-auto p-2 text-xs">
              {JSON.stringify(entry.detail, null, 2)}
            </pre>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

