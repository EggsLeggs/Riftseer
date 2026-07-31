"use client";

import * as React from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2, PencilLine, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import type { Card } from "@riftseer/types";
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
import { cardsApi, cardsQueryKeys } from "@/features/cards/api";
import { cardHref } from "@/features/cards/paths";
import { CARD_BROWSE_SELECT_CLASS } from "@/features/cards/card-display";
import { setsApi, setsQueryKeys, type SetInfo } from "@/features/sets/api";
import { useCardMutations } from "@/features/admin/hooks/use-admin-mutations";
import { AdminPageHeader } from "./admin-page-header";
import { ConfirmDialog } from "./confirm-dialog";

const PAGE_SIZE = 40;

export function AdminCardsView() {
  const [term, setTerm] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [setCode, setSetCode] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pendingDelete, setPendingDelete] = React.useState<Card | null>(null);

  const { remove, regenerateSlug } = useCardMutations();

  async function handleDelete(cardId: string, reason: string) {
    try {
      await remove.mutateAsync([cardId, reason || undefined]);
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
    queryKey: [
      // `cardsQueryKeys.all` must lead: TanStack matches invalidation keys as a
      // prefix from the start, so with it trailing, the mutation hooks'
      // `invalidateQueries({ queryKey: cardsQueryKeys.all })` never matched and
      // this list silently kept showing pre-edit data.
      ...cardsQueryKeys.all,
      "admin",
      trimmed,
      setCode,
      offset,
    ],
    queryFn: () =>
      trimmed
        ? cardsApi.searchByName(trimmed, {
            limit: PAGE_SIZE,
            offset,
            set: setCode || undefined,
            unique: true,
          })
        : setCode
          ? cardsApi.getSetCards(setCode)
          : cardsApi.browseAll({ limit: PAGE_SIZE, offset }),
    placeholderData: keepPreviousData,
    retry: false,
  });

  // A narrower filter can leave the viewer past the end of the new result set.
  React.useEffect(() => {
    setPage(0);
  }, [trimmed, setCode]);

  const cards = results.data?.cards ?? [];
  const total = results.data?.total ?? 0;
  // getSetCards returns the whole set in one response, so paging does not apply.
  const paged = !(setCode && !trimmed);
  const totalPages = paged ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setQuery(term);
  }

  return (
    <>
      <AdminPageHeader
        title="Cards"
        description="Find a printing to edit, re-slug, or delete. Deletions are durable, so ingest will not restore them."
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
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <Label htmlFor="admin-card-search">Search by name</Label>
          <Input
            id="admin-card-search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="e.g. Sett, Brawler"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="admin-card-set">Set</Label>
          <select
            id="admin-card-set"
            value={setCode}
            onChange={(e) => setSetCode(e.target.value)}
            className={CARD_BROWSE_SELECT_CLASS}
          >
            <option value="">All sets</option>
            {(sets.data?.sets ?? []).map((s: SetInfo) => (
              <option key={s.setCode} value={s.setCode}>
                {s.setCode} · {s.setName}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">
          <Search aria-hidden="true" />
          Search
        </Button>
      </form>

      {results.isError ? (
        <p className="text-destructive text-sm">
          Couldn&apos;t load cards. Please try again.
        </p>
      ) : results.isPending ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading cards…
        </p>
      ) : cards.length === 0 ? (
        <p className="text-muted-foreground text-sm">No cards matched.</p>
      ) : (
        <>
          <p className="text-muted-foreground mb-3 text-sm">
            {total.toLocaleString()} {total === 1 ? "printing" : "printings"}
            {paged && totalPages > 1 ? ` · page ${page + 1} of ${totalPages}` : ""}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Set</TableHead>
                <TableHead>Collector</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cards.map((card) => (
                <TableRow key={card.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={cardHref(card)}
                      className="underline-offset-4 hover:underline"
                    >
                      {card.name}
                    </Link>
                    {card.is_token && (
                      <span className="text-muted-foreground ml-1.5 text-xs">
                        token
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="uppercase">
                    {card.set?.set_code ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {card.collector_number ?? "—"}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground max-w-56 truncate text-xs"
                    title={card.public_slug}
                  >
                    {card.public_slug ?? "none"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {card.source ?? "riftcodex"}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/cards/${encodeURIComponent(card.id)}/edit`}>
                          <PencilLine aria-hidden="true" />
                          Edit
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={regenerateSlug.isPending}
                        onClick={() =>
                          regenerateSlug.mutate([card.id, card.public_slug])
                        }
                        title="Regenerate the public slug"
                      >
                        <RefreshCw aria-hidden="true" />
                        <span className="sr-only">Regenerate slug</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(card)}
                        title="Delete this card"
                      >
                        <Trash2 aria-hidden="true" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {paged && totalPages > 1 && (
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

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete ${pendingDelete?.name ?? "card"}?`}
        description="This writes a durable deletion record, so the next ingest will not restore the card. Add a reason for the audit log."
        confirmLabel="Delete card"
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
