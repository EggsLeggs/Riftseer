"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { buildPageRange, CARD_BROWSE_SELECT_CLASS } from "@/features/cards/card-display";
import { listMyDecksAction } from "@/features/decks/actions";
import { deckQueryKeys } from "@/features/decks/api";
import { DeckSummaryCard } from "@/features/decks/components/deck-summary-card";
import {
  DECK_LIST_OWNERSHIP,
  DECK_LIST_OWNERSHIP_LABELS,
  deckListFormats,
  filterDeckSummaries,
  pageDeckSummaries,
  type DeckListOwnership,
} from "@/features/decks/deck-list-filter";
import { importDeckHref, newDeckHref } from "@/features/decks/paths";
import { cn } from "@/lib/utils";

/**
 * `/decks` — the signed-in user's decks and the decks shared with them.
 *
 * Client-fetched, and filtered in the browser: `GET /decks` returns the whole
 * list because a person's deck count is small, so paging it server-side would
 * be a round trip per page for no benefit. The URL still carries the filter, so
 * a filtered list is a link somebody can send.
 */

const PER_PAGE = 24;

function parseOwnership(raw: string | null): DeckListOwnership {
  return (DECK_LIST_OWNERSHIP as readonly string[]).includes(raw ?? "")
    ? (raw as DeckListOwnership)
    : "all";
}

export function DecksBrowseView({ isSignedIn }: { isSignedIn: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const query = searchParams.get("q") ?? "";
  const format = searchParams.get("format") ?? "";
  const ownership = parseOwnership(searchParams.get("owner"));
  const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10) || 1;

  const decks = useQuery({
    queryKey: deckQueryKeys.mine(),
    queryFn: async () => {
      const result = await listMyDecksAction();
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: isSignedIn,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });

  const items = decks.data?.items ?? [];
  const formats = React.useMemo(() => deckListFormats(items), [items]);
  const filtered = React.useMemo(
    () => filterDeckSummaries(items, { query, format: format || undefined, ownership }),
    [items, query, format, ownership],
  );
  const page = pageDeckSummaries(filtered, requestedPage, PER_PAGE);

  const updateParams = React.useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `/decks?${qs}` : "/decks", { scroll: false });
    },
    [router, searchParams],
  );

  const pageHref = React.useCallback(
    (target: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (target <= 1) params.delete("page");
      else params.set("page", String(target));
      const qs = params.toString();
      return qs ? `/decks?${qs}` : "/decks";
    },
    [searchParams],
  );

  const pageNumbers = React.useMemo(
    () => buildPageRange(page.page, page.totalPages),
    [page.page, page.totalPages],
  );

  return (
    <div className="container py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Decks</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Your decks and the decks people have shared with you.
          </p>
        </div>
        <div className="flex gap-2">
          {isSignedIn && (
            <Button variant="outline" size="sm" asChild>
              <Link href={importDeckHref()}>Import</Link>
            </Button>
          )}
          <Button size="sm" asChild>
            <Link href={newDeckHref()}>New deck</Link>
          </Button>
        </div>
      </header>

      {!isSignedIn ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="text-base font-semibold">Sign in to see your decks</p>
          <p className="text-muted-foreground text-sm">
            Decks are private by default. Sign in to see yours, or open a deck
            somebody shared with you by its link. You do not need an account to
            start building — sign in when you want to keep it.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/auth/login?next=/decks">Sign in</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={newDeckHref()}>Build one without an account</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deck-filter-query">Search</Label>
              <Input
                id="deck-filter-query"
                value={query}
                placeholder="Deck name"
                className="w-56"
                onChange={(event) =>
                  updateParams((params) => {
                    const next = event.target.value;
                    if (next) params.set("q", next);
                    else params.delete("q");
                    params.delete("page");
                  })
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deck-filter-owner">Show</Label>
              <select
                id="deck-filter-owner"
                className={CARD_BROWSE_SELECT_CLASS}
                value={ownership}
                onChange={(event) =>
                  updateParams((params) => {
                    if (event.target.value === "all") params.delete("owner");
                    else params.set("owner", event.target.value);
                    params.delete("page");
                  })
                }
              >
                {DECK_LIST_OWNERSHIP.map((value) => (
                  <option key={value} value={value}>
                    {DECK_LIST_OWNERSHIP_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            {formats.length > 1 && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="deck-filter-format">Format</Label>
                <select
                  id="deck-filter-format"
                  className={CARD_BROWSE_SELECT_CLASS}
                  value={format}
                  onChange={(event) =>
                    updateParams((params) => {
                      if (event.target.value) params.set("format", event.target.value);
                      else params.delete("format");
                      params.delete("page");
                    })
                  }
                >
                  <option value="">All formats</option>
                  {formats.map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {decks.isPending ? (
            <p className="text-muted-foreground text-sm">Loading decks…</p>
          ) : decks.isError ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-base font-semibold">Couldn't load your decks</p>
              <p className="text-muted-foreground text-sm">
                {(decks.error as Error).message}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-base font-semibold">
                {items.length === 0 ? "No decks yet" : "No decks match those filters"}
              </p>
              {items.length === 0 && (
                <Button asChild>
                  <Link href={newDeckHref()}>Build your first deck</Link>
                </Button>
              )}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {page.items.map((deck) => (
                <DeckSummaryCard key={deck.id} deck={deck} />
              ))}
            </ul>
          )}

          {page.totalPages > 1 && (
            <Pagination className="mt-8">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href={pageHref(Math.max(1, page.page - 1))}
                    size="default"
                    className={cn(page.page <= 1 && "pointer-events-none opacity-40")}
                    aria-disabled={page.page <= 1}
                  />
                </PaginationItem>
                {pageNumbers.map((entry, index) =>
                  entry === "ellipsis" ? (
                    <PaginationItem key={`ellipsis-${index}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={entry}>
                      <PaginationLink
                        href={pageHref(entry)}
                        size="default"
                        isActive={entry === page.page}
                      >
                        {entry}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    href={pageHref(Math.min(page.totalPages, page.page + 1))}
                    size="default"
                    className={cn(
                      page.page >= page.totalPages && "pointer-events-none opacity-40",
                    )}
                    aria-disabled={page.page >= page.totalPages}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </>
      )}
    </div>
  );
}
