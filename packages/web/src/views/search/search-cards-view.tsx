"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useConsentManager } from "@c15t/nextjs";
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
import { cardsApi, cardsQueryKeys, CardApiError } from "@/features/cards/api";
import { cardHref } from "@/features/cards/paths";
import {
  CardGrid,
  CardDetailsResults,
  CardTableResults,
  SearchSkeleton,
  buildPageRange,
  CARD_BROWSE_SELECT_CLASS,
  CARD_RESULTS_VIEWS,
  CardResultsViewToggle,
  type CardResultsView,
} from "@/features/cards/card-display";
import { parseMetaKeywords, sortCards } from "@/features/cards/meta-keywords";
import { useSitePreferences } from "@/features/site-preferences/site-preferences-provider";
import { cn } from "@/lib/utils";

function searchErrorInfo(err: unknown): { title: string; detail: string } {
  if (err instanceof CardApiError) {
    if (err.code === "timeout")
      return { title: "Search timed out", detail: "Please try again." };
    if (err.code === "network")
      return { title: "Couldn't connect", detail: "Check your connection and try again." };
    if (err.status === 400 && err.detail)
      return { title: "Invalid query", detail: err.detail };
    if (err.status != null && err.status >= 500)
      return { title: "Search unavailable", detail: "The search service is having issues. Try again shortly." };
  }
  return { title: "Something went wrong", detail: "Please try again." };
}

const PAGE_SIZE_OPTIONS = [20, 40, 60, 80, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const DEFAULT_PAGE_SIZE: PageSize = 60;
const PAGE_SIZE_STORAGE_KEY = "riftseer.search.cardsPerPage";

function parseSearchResultsView(raw: string | null): CardResultsView | null {
  if (
    raw &&
    (CARD_RESULTS_VIEWS as readonly string[]).includes(raw)
  ) {
    return raw as CardResultsView;
  }
  return null;
}

function parseStoredPageSize(raw: string | null): PageSize | null {
  const n = Number.parseInt(raw ?? "", 10);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
    ? (n as PageSize)
    : null;
}

function readStoredPageSize(): PageSize | null {
  try {
    return parseStoredPageSize(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStoredPageSize(perPage: PageSize) {
  try {
    window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(perPage));
  } catch {
    // Ignore storage failures; the URL remains the source of truth.
  }
}

function forgetStoredPageSize() {
  try {
    window.localStorage.removeItem(PAGE_SIZE_STORAGE_KEY);
  } catch {
    // Ignore storage failures; consent should not block search controls.
  }
}

export function SearchCardsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { has, hasFetchedBanner } = useConsentManager();
  const { accessibility, patchAccessibility } = useSitePreferences();
  const showCardNamesBelowSearch = accessibility.showCardNamesBelowSearch;
  const rawQuery = searchParams.get("q") ?? "";
  const meta = parseMetaKeywords(rawQuery);
  const cleanQuery = meta.query;
  const trimmed = cleanQuery.trim();
  const rawPerPage = searchParams.get("perPage");
  const perPageParam = parseStoredPageSize(rawPerPage);
  const hasPerPageParam = perPageParam !== null;
  const perPage = perPageParam ?? DEFAULT_PAGE_SIZE;
  const canRememberPerPage = hasFetchedBanner && has("functionality");
  const pageParam = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const requestedPage =
    Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const offset = (requestedPage - 1) * perPage;
  const resultsView =
    parseSearchResultsView(searchParams.get("view")) ??
    accessibility.cardResultsView;

  const search = useQuery({
    queryKey: cardsQueryKeys.search(trimmed, perPage, offset, true, {
      set: meta.set,
      unique: meta.allPrintings || undefined,
    }),
    queryFn: () =>
      cardsApi.searchByName(trimmed, {
        limit: perPage,
        offset,
        includePrices: true,
        set: meta.set,
        unique: meta.allPrintings || undefined,
      }),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });

  const total = trimmed ? (search.data?.total ?? 0) : 0;
  const cardTotal = trimmed ? (search.data?.count ?? 0) : 0;
  const rawCards = trimmed ? (search.data?.cards ?? []) : [];
  const cards = meta.order ? sortCards(rawCards, meta.order, meta.direction) : rawCards;
  const errorInfo = search.isError ? searchErrorInfo(search.error) : null;
  const totalPages =
    total === 0 ? 0 : Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(requestedPage, Math.max(totalPages, 1));

  const updateSearchParams = React.useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(searchParams.toString());
      mutate(p);
      router.replace(`/search?${p.toString()}`, { scroll: false });
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    },
    [router, searchParams],
  );

  React.useEffect(() => {
    if (!hasFetchedBanner) return;
    if (!canRememberPerPage) {
      forgetStoredPageSize();
      return;
    }
    if (!trimmed || hasPerPageParam) return;

    const storedPerPage = readStoredPageSize();
    if (!storedPerPage || storedPerPage === perPage) return;

    updateSearchParams((p) => {
      p.set("perPage", String(storedPerPage));
      p.delete("page");
    });
  }, [
    canRememberPerPage,
    hasFetchedBanner,
    hasPerPageParam,
    perPage,
    trimmed,
    updateSearchParams,
  ]);

  React.useEffect(() => {
    if (!hasFetchedBanner) return;
    if (!canRememberPerPage) {
      forgetStoredPageSize();
      return;
    }
    if (hasPerPageParam) writeStoredPageSize(perPage);
  }, [canRememberPerPage, hasFetchedBanner, hasPerPageParam, perPage]);

  React.useEffect(() => {
    if (!trimmed || search.isFetching) return;
    if (total === 0) return;
    if (requestedPage > totalPages) {
      updateSearchParams((p) => {
        if (totalPages <= 1) p.delete("page");
        else p.set("page", String(totalPages));
      });
    }
  }, [
    trimmed,
    search.isFetching,
    total,
    totalPages,
    requestedPage,
    updateSearchParams,
  ]);

  React.useEffect(() => {
    if (!trimmed || search.isFetching) return;
    if (search.data?.total !== 1) return;
    const sole = search.data.cards[0];
    if (sole) router.replace(cardHref(sole.printing));
  }, [trimmed, search.isFetching, search.data, router]);

  const setPage = React.useCallback(
    (next: number) => {
      updateSearchParams((p) => {
        if (next <= 1) p.delete("page");
        else p.set("page", String(next));
      });
    },
    [updateSearchParams],
  );

  const setPerPage = React.useCallback(
    (next: PageSize) => {
      updateSearchParams((p) => {
        p.set("perPage", String(next));
        p.delete("page");
      });
    },
    [updateSearchParams],
  );

  const setResultsView = React.useCallback(
    (next: CardResultsView) => {
      patchAccessibility({ cardResultsView: next });
      // Always encode the choice: the default is per-user (accessibility
      // .cardResultsView), so an omitted param would resolve to the viewer's
      // own default and break shared links (e.g. an explicit "images" pick).
      updateSearchParams((p) => {
        p.set("view", next);
      });
    },
    [patchAccessibility, updateSearchParams],
  );

  const searchPageHref = React.useCallback(
    (targetPage: number) => {
      const p = new URLSearchParams(searchParams.toString());
      if (targetPage <= 1) p.delete("page");
      else p.set("page", String(targetPage));
      const qs = p.toString();
      return qs ? `/search?${qs}` : "/search";
    },
    [searchParams],
  );

  const pageNumbers = React.useMemo(
    () => (totalPages > 0 ? buildPageRange(page, totalPages) : []),
    [page, totalPages],
  );

  return (
    <div className="container py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {trimmed ? (
              <>
                Search results for{" "}
                <span className="text-muted-foreground">“{trimmed}”</span>
              </>
            ) : (
              "Search cards"
            )}
          </h1>
          {trimmed && !search.isFetching && !search.isError && (
            <p className="mt-1 text-sm text-muted-foreground">
              {total === 0
                ? "No cards found."
                : cardTotal === total
                  ? `${cardTotal} ${cardTotal === 1 ? "card" : "cards"} found.`
                  : `${cardTotal} ${cardTotal === 1 ? "card" : "cards"} found, ${total} ${total === 1 ? "printing" : "printings"}.`}
            </p>
          )}
          {!trimmed && (
            <p className="mt-1 text-sm text-muted-foreground">
              Use the search bar in the header (or press Cmd/Ctrl + K) to find
              cards.{" "}
              <Link
                href="/syntax"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Search syntax
              </Link>
            </p>
          )}
        </div>

        {trimmed ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-8">
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-sm font-medium">
                View
              </span>
              <CardResultsViewToggle
                value={resultsView}
                onValueChange={setResultsView}
                aria-label="Search results layout"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:items-end">
              <Label htmlFor="search-per-page" className="text-muted-foreground">
                Cards per page
              </Label>
              <select
                id="search-per-page"
                value={perPage}
                onChange={(e) =>
                  setPerPage(Number.parseInt(e.target.value, 10) as PageSize)
                }
                className={cn(CARD_BROWSE_SELECT_CLASS, "w-22")}
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </header>

      {errorInfo ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <img
            src="/lambsheep.png"
            alt=""
            aria-hidden="true"
            className="h-28 w-auto opacity-70"
          />
          <div className="flex flex-col gap-1.5">
            <p className="text-base font-semibold">{errorInfo.title}</p>
            <p className="text-sm text-muted-foreground">{errorInfo.detail}</p>
          </div>
        </div>
      ) : trimmed && search.isPending && cards.length === 0 ? (
        <SearchSkeleton count={perPage} view={resultsView} />
      ) : cards.length > 0 ? (
        resultsView === "images" ? (
          <CardGrid
            cards={cards}
            cardNamePlacement={
              showCardNamesBelowSearch ? "below" : "overlay"
            }
          />
        ) : resultsView === "details" ? (
          <CardDetailsResults cards={cards} />
        ) : (
          <CardTableResults cards={cards} />
        )
      ) : null}

      {trimmed && totalPages > 1 ? (
        <Pagination className="mt-10">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={searchPageHref(Math.max(1, page - 1))}
                size="default"
                className={cn(
                  page <= 1 && "pointer-events-none opacity-40",
                )}
                aria-disabled={page <= 1}
                tabIndex={page <= 1 ? -1 : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  if (page > 1) setPage(page - 1);
                }}
              />
            </PaginationItem>
            {pageNumbers.map((entry, i) =>
              entry === "ellipsis" ? (
                <PaginationItem key={`ellipsis-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={entry}>
                  <PaginationLink
                    href={searchPageHref(entry)}
                    size="default"
                    isActive={entry === page}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
                        return;
                      e.preventDefault();
                      setPage(entry);
                    }}
                  >
                    {entry}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href={searchPageHref(Math.min(totalPages, page + 1))}
                size="default"
                className={cn(
                  page >= totalPages && "pointer-events-none opacity-40",
                )}
                aria-disabled={page >= totalPages}
                tabIndex={page >= totalPages ? -1 : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  if (page < totalPages) setPage(page + 1);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      ) : null}
    </div>
  );
}
