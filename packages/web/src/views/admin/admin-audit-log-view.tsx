"use client";

import * as React from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CARD_BROWSE_SELECT_CLASS } from "@/features/cards/card-display";
import { listAuditLogAction } from "@/features/admin/actions";
import type { AdminAuditEntry, AdminAuditPage } from "@/features/admin/types";
import { AdminPageHeader } from "./admin-page-header";

const PAGE_SIZE = 50;

/**
 * The exact `action` values the admin RPCs write (see the Phase 3 migration
 * `20260730120000_phase3_admin_api.sql`, the Phase 5 migration
 * `20260731000000_phase5_rulings_legalities_formats.sql`, and the Phase 6
 * migration `20260801000000_phase6_reconciliation_queue.sql`). Keep in sync when
 * an admin RPC is added — a stale entry here silently filters to nothing.
 */
const ACTIONS = [
  "card.create_manual",
  "card.patch",
  "card.delete",
  "card.restore",
  "card.move",
  "card.regenerate_slug",
  "card.image",
  "card.relationships",
  "card.legality",
  "card.ruling.create",
  "card.ruling.patch",
  "card.ruling.delete",
  // Detaching a shared ruling from one card, rather than deleting it outright.
  "card.ruling.detach",
  // The card-independent Rulings tab.
  "ruling.create",
  "ruling.patch",
  "ruling.delete",
  "set.create",
  "set.patch",
  "set.delete",
  "format.create",
  "format.patch",
  "format.delete",
  "format.reorder",
  "reconciliation.confirm",
  // The card patch a confirmation applies is logged separately, against the card.
  "reconciliation.confirm.patch",
  "reconciliation.dismiss",
] as const;

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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-action">Action</Label>
          <select
            id="audit-action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className={CARD_BROWSE_SELECT_CLASS}
          >
            <option value="">All actions</option>
            {ACTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Label htmlFor="audit-target">Card ID or set code</Label>
          <Input
            id="audit-target"
            value={targetIdInput}
            onChange={(e) => setTargetIdInput(e.target.value)}
            placeholder="67f4064886be8495f7165dd7"
            className="font-mono text-xs"
          />
        </div>
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

      {log.isError ? (
        <p className="text-destructive text-sm">
          {log.error instanceof Error
            ? log.error.message
            : "Couldn't load the audit log."}
        </p>
      ) : log.isPending ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading audit log…
        </p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No admin changes recorded yet.
        </p>
      ) : (
        <>
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

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
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
  const isCard = entry.target_type === "card" && entry.target_id;

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
          {isCard ? (
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

