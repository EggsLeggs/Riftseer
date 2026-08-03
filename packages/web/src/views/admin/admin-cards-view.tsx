"use client";

import * as React from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PencilLine, Plus, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cardsQueryKeys } from "@/features/cards/api";
import { cardHref } from "@/features/cards/paths";
import { setsApi, setsQueryKeys, type SetInfo } from "@/features/sets/api";
import { listPrintingsAction } from "@/features/admin/actions";
import { usePrintingMutations } from "@/features/admin/hooks/use-admin-mutations";
import type {
  AdminPrintingListEntry,
  AdminPrintingState,
} from "@/features/admin/types";
import { AdminPageHeader } from "./admin-page-header";
import { AdminListState, AdminPager } from "./admin-list";
import { SelectField, TextField } from "./admin-form-field";
import { ConfirmDialog } from "./confirm-dialog";

const PAGE_SIZE = 40;

/**
 * Why the admin list is not public search: every state below is a fact about
 * the catalogue rather than about a card, and the search grammar deliberately
 * only speaks about cards. Soft-deleted rows in particular are invisible to
 * every ordinary reader, which is exactly what makes `deleted_at` a real
 * delete — and exactly why restoring one needs its own screen.
 */
const STATE_OPTIONS: Array<{ value: AdminPrintingState; label: string }> = [
  { value: "live", label: "Live" },
  { value: "deleted", label: "Deleted" },
  { value: "manual", label: "Manually created" },
  { value: "locked", label: "Has locked fields" },
  { value: "delta", label: "Has a printing delta" },
  { value: "no_image", label: "No hosted image" },
];

export function AdminCardsView() {
  const [term, setTerm] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [setCode, setSetCode] = React.useState("");
  const [state, setState] = React.useState<AdminPrintingState>("live");
  const [page, setPage] = React.useState(0);
  const [pendingDelete, setPendingDelete] =
    React.useState<AdminPrintingListEntry | null>(null);

  const { remove, restore, regenerateSlug } = usePrintingMutations();

  async function handleDelete(printingId: string, reason: string) {
    try {
      await remove.mutateAsync([printingId, reason || undefined]);
    } catch {
      // Already surfaced as a toast — leave the dialog open so it can be retried.
      return;
    }
    setPendingDelete(null);
  }

  const sets = useQuery({
    queryKey: setsQueryKeys.list(),
    queryFn: () => setsApi.getSets(),
    staleTime: 5 * 60_000,
  });

  const offset = page * PAGE_SIZE;
  const trimmed = query.trim();

  const results = useQuery({
    // `cardsQueryKeys.all` must lead: TanStack matches invalidation keys as a
    // prefix from the start, so with it trailing, the mutation hooks'
    // `invalidateQueries({ queryKey: cardsQueryKeys.all })` never matched and
    // this list silently kept showing pre-edit data.
    queryKey: [...cardsQueryKeys.all, "admin", state, trimmed, setCode, offset],
    queryFn: async () => {
      const result = await listPrintingsAction({
        limit: PAGE_SIZE,
        offset,
        state,
        q: trimmed || undefined,
        set: setCode || undefined,
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    placeholderData: keepPreviousData,
    retry: false,
  });

  // A narrower filter can leave the viewer past the end of the new result set.
  React.useEffect(() => {
    setPage(0);
  }, [trimmed, setCode, state]);

  const printings = results.data?.printings ?? [];
  const total = results.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setQuery(term);
  }

  return (
    <>
      <AdminPageHeader
        title="Cards"
        description="Find a printing to edit, re-slug, delete or restore. Deletions are soft and durable: the row stays, hidden from every other reader, and ingest will not resurrect it."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Cards" }]}
        actions={
          <Button asChild>
            <Link href="/admin/cards/new">
              <Plus aria-hidden="true" />
              New card
            </Link>
          </Button>
        }
      />

      <form onSubmit={submit} className="mb-6 flex flex-wrap items-end gap-3">
        <TextField
          id="admin-card-search"
          label="Search by name"
          className="min-w-60 flex-1"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="e.g. Sett, Brawler"
        />
        <SelectField
          id="admin-card-set"
          label="Set"
          value={setCode}
          onChange={(e) => setSetCode(e.target.value)}
          options={[
            { value: "", label: "All sets" },
            ...(sets.data?.sets ?? []).map((s: SetInfo) => ({
              value: s.setCode,
              label: `${s.setCode} · ${s.setName}`,
            })),
          ]}
        />
        <SelectField
          id="admin-card-state"
          label="State"
          value={state}
          onChange={(e) => setState(e.target.value as AdminPrintingState)}
          options={STATE_OPTIONS}
        />
        <Button type="submit">
          <Search aria-hidden="true" />
          Search
        </Button>
      </form>

      <AdminListState
        isError={results.isError}
        isPending={results.isPending}
        isEmpty={printings.length === 0}
        errorMessage="Couldn't load cards. Please try again."
        loadingMessage="Loading cards…"
        emptyMessage="No printings matched."
      >
        <p className="text-muted-foreground mb-3 text-sm">
          {total.toLocaleString()} {total === 1 ? "printing" : "printings"}
          {totalPages > 1 ? ` · page ${page + 1} of ${totalPages}` : ""}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Set</TableHead>
              <TableHead>Collector</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {printings.map((printing) => (
              <TableRow key={printing.id}>
                <TableCell className="font-medium">
                  {/* cardHref, not a hand-built path: a public_slug is
                      multi-segment (`unl/150/vex-apathetic`) and has to be
                      encoded per segment, or the whole thing collapses into one
                      escaped segment and the card route 404s. */}
                  <Link
                    href={cardHref(printing)}
                    className="underline-offset-4 hover:underline"
                  >
                    {printing.name}
                  </Link>
                  {printing.is_token && (
                    <span className="text-muted-foreground ml-1.5 text-xs">token</span>
                  )}
                </TableCell>
                <TableCell className="uppercase">{printing.set_code ?? "—"}</TableCell>
                <TableCell className="tabular-nums">
                  {printing.collector_number ?? "—"}
                </TableCell>
                <TableCell
                  className="text-muted-foreground max-w-56 truncate text-xs"
                  title={printing.public_slug}
                >
                  {printing.public_slug || "none"}
                </TableCell>
                <TableCell>
                  <PrintingFlags printing={printing} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {printing.deleted_at ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={restore.isPending}
                        onClick={() =>
                          restore.mutate([printing.id, printing.public_slug])
                        }
                      >
                        <RotateCcw aria-hidden="true" />
                        Restore
                      </Button>
                    ) : (
                      <>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/admin/cards/${encodeURIComponent(printing.id)}/edit`}>
                            <PencilLine aria-hidden="true" />
                            Edit
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={regenerateSlug.isPending}
                          onClick={() =>
                            regenerateSlug.mutate([printing.id, printing.public_slug])
                          }
                          title="Regenerate the public slug"
                        >
                          <RefreshCw aria-hidden="true" />
                          <span className="sr-only">Regenerate slug</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDelete(printing)}
                          title="Delete this card"
                        >
                          <Trash2 aria-hidden="true" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <AdminPager page={page} totalPages={totalPages} onPageChange={setPage} />
      </AdminListState>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete ${pendingDelete?.name ?? "printing"}?`}
        description="This soft-deletes this physical printing. The oracle and sibling printings remain available, and it can be restored from the Deleted filter."
        confirmLabel="Delete printing"
        destructive
        reasonLabel="Reason (optional)"
        pending={remove.isPending}
        onConfirm={(reason) => {
          if (pendingDelete) void handleDelete(pendingDelete.id, reason);
        }}
      />
    </>
  );
}

/**
 * The bookkeeping the public card page has no reason to show. `locked_fields`
 * is the mechanism that keeps an admin edit through the next ingest, so an
 * editor needs to see it before wondering why a value will not budge.
 */
function PrintingFlags({ printing }: { printing: AdminPrintingListEntry }) {
  const flags: React.ReactNode[] = [];
  if (printing.deleted_at) {
    flags.push(<Badge key="deleted" variant="destructive">deleted</Badge>);
  }
  if (printing.source === "manual") {
    flags.push(<Badge key="manual" variant="secondary">manual</Badge>);
  }
  if (printing.locked_fields.length > 0) {
    flags.push(
      <Badge key="locked" variant="outline" title={printing.locked_fields.join(", ")}>
        {printing.locked_fields.length} locked
      </Badge>,
    );
  }
  if (printing.delta_source) {
    flags.push(
      <Badge key="delta" variant="outline">{printing.delta_source} delta</Badge>,
    );
  }
  if (!printing.has_hosted_image) {
    flags.push(<Badge key="image" variant="outline">no image</Badge>);
  }

  if (flags.length === 0) return <span className="text-muted-foreground">—</span>;
  return <div className="flex flex-wrap gap-1">{flags}</div>;
}
