"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
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
import { cardsApi, cardsQueryKeys, CardApiError } from "@/features/cards/api";
import { parseMetaKeywords, sortCards } from "@/features/cards/meta-keywords";
import { useSitePreferences } from "@/features/site-preferences/site-preferences-provider";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [20, 40, 60, 80, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSize = 60;

function parseStoredPageSize(raw: string | null): PageSize | null {
  const n = Number.parseInt(raw ?? "", 10);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
    ? (n as PageSize)
    : null;
}

function parseViewParam(raw: string | null): CardResultsView | null {
  if (raw && (CARD_RESULTS_VIEWS as readonly string[]).includes(raw)) {
    return raw as CardResultsView;
  }
  return null;
}

function galleryErrorInfo(err: unknown): { title: string; detail: string } {
  if (err instanceof CardApiError) {
    if (err.code === "timeout") return { title: "Request timed out", detail: "Please try again." };
    if (err.code === "network") return { title: "Couldn't connect", detail: "Check your connection and try again." };
    if (err.status === 400 && err.detail) return { title: "Invalid query", detail: err.detail };
    if (err.status != null && err.status >= 500) return { title: "Service unavailable", detail: "Try again shortly." };
  }
  return { title: "Something went wrong", detail: "Please try again." };
}

export function CardGalleryView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessibility, patchAccessibility } = useSitePreferences();
  const showCardNamesBelowSearch = accessibility.showCardNamesBelowSearch;

  const rawQuery = searchParams.get("q") ?? "";
  const meta = parseMetaKeywords(rawQuery);
  const trimmed = meta.query.trim();

  const rawPerPage = searchParams.get("perPage");
  const perPage = parseStoredPageSize(rawPerPage) ?? DEFAULT_PAGE_SIZE;
  const pageParam = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const requestedPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const offset = (requestedPage - 1) * perPage;
  const resultsView =
    parseViewParam(searchParams.get("view")) ?? accessibility.cardResultsView;

  const isBrowse = trimmed.length === 0 && !meta.set;

  const searchQuery = useQuery({
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
    enabled: !isBrowse,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });

  const browseQuery = useQuery({
    queryKey: cardsQueryKeys.browse(perPage, offset, true),
    queryFn: () => cardsApi.browseAll({ limit: perPage, offset, includePrices: true }),
    enabled: isBrowse,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });

  const activeQuery = isBrowse ? browseQuery : searchQuery;
  const total = activeQuery.data?.total ?? 0;
  const cardTotal = activeQuery.data?.count ?? 0;
  const rawCards = activeQuery.data?.cards ?? [];
  const cards = meta.order ? sortCards(rawCards, meta.order, meta.direction) : rawCards;

  const errorInfo = activeQuery.isError ? galleryErrorInfo(activeQuery.error) : null;
  const totalPages = total === 0 ? 0 : Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(requestedPage, Math.max(totalPages, 1));

  const updateSearchParams = React.useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(searchParams.toString());
      mutate(p);
      router.replace(`/cards?${p.toString()}`, { scroll: false });
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    },
    [router, searchParams],
  );

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
      updateSearchParams((p) => {
        p.set("view", next);
      });
    },
    [patchAccessibility, updateSearchParams],
  );

  const pageHref = React.useCallback(
    (targetPage: number) => {
      const p = new URLSearchParams(searchParams.toString());
      if (targetPage <= 1) p.delete("page");
      else p.set("page", String(targetPage));
      const qs = p.toString();
      return qs ? `/cards?${qs}` : "/cards";
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
                Results for{" "}
                <span className="text-muted-foreground">"{trimmed}"</span>
              </>
            ) : (
              "All Cards"
            )}
          </h1>
          {!activeQuery.isFetching && !activeQuery.isError && (total > 0) && (
            <p className="mt-1 text-sm text-muted-foreground">
              {cardTotal === total
                ? `${total} ${total === 1 ? "card" : "cards"}`
                : `${cardTotal} of ${total} cards`}
            </p>
          )}
          {!trimmed && !meta.set && (
            <p className="mt-1 text-sm text-muted-foreground">
              Use the search bar (⌘K) to filter.{" "}
              <Link href="/syntax" className="text-foreground underline-offset-4 hover:underline">
                Search syntax
              </Link>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-8">
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-sm font-medium">View</span>
            <CardResultsViewToggle value={resultsView} onValueChange={setResultsView} />
          </div>
          <div className="flex flex-col gap-1.5 sm:items-end">
            <Label htmlFor="gallery-per-page" className="text-muted-foreground">
              Cards per page
            </Label>
            <select
              id="gallery-per-page"
              value={perPage}
              onChange={(e) => setPerPage(Number.parseInt(e.target.value, 10) as PageSize)}
              className={cn(CARD_BROWSE_SELECT_CLASS, "w-22")}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {errorInfo ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <img src="/lambsheep.png" alt="" aria-hidden="true" className="h-28 w-auto opacity-70" />
          <div className="flex flex-col gap-1.5">
            <p className="text-base font-semibold">{errorInfo.title}</p>
            <p className="text-sm text-muted-foreground">{errorInfo.detail}</p>
          </div>
        </div>
      ) : activeQuery.isPending && cards.length === 0 ? (
        <SearchSkeleton count={perPage} view={resultsView} />
      ) : cards.length > 0 ? (
        resultsView === "images" ? (
          <CardGrid cards={cards} cardNamePlacement={showCardNamesBelowSearch ? "below" : "overlay"} />
        ) : resultsView === "details" ? (
          <CardDetailsResults cards={cards} />
        ) : (
          <CardTableResults cards={cards} />
        )
      ) : null}

      {totalPages > 1 ? (
        <Pagination className="mt-10">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href={pageHref(Math.max(1, page - 1))}
                size="default"
                className={cn(page <= 1 && "pointer-events-none opacity-40")}
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
                    href={pageHref(entry)}
                    size="default"
                    isActive={entry === page}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
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
                href={pageHref(Math.min(totalPages, page + 1))}
                size="default"
                className={cn(page >= totalPages && "pointer-events-none opacity-40")}
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
