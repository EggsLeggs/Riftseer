"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useConsentManager } from "@c15t/nextjs";
import { ImageOffIcon, LayoutGrid, LayoutList, Table2 } from "lucide-react";
import type { Card } from "@riftseer/types";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cardsApi, cardsQueryKeys } from "@/features/cards/api";
import { cardHref } from "@/features/cards/paths";
import { useSitePreferences } from "@/features/site-preferences/site-preferences-provider";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [20, 40, 60, 80, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

const DEFAULT_PAGE_SIZE: PageSize = 60;
const PAGE_SIZE_STORAGE_KEY = "riftseer.search.cardsPerPage";

const SEARCH_RESULTS_VIEWS = ["details", "images", "table"] as const;
type SearchResultsView = (typeof SEARCH_RESULTS_VIEWS)[number];

function parseSearchResultsView(raw: string | null): SearchResultsView {
  if (
    raw &&
    (SEARCH_RESULTS_VIEWS as readonly string[]).includes(raw)
  ) {
    return raw as SearchResultsView;
  }
  return "images";
}

const CARD_GRID_INVISIBLE_LABEL =
  "pointer-events-none absolute inset-x-0 top-0 z-[1000] box-border w-full pt-[6.75%] pl-[8%] text-sm tracking-normal text-transparent select-text";

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
  const { accessibility } = useSitePreferences();
  const showCardNamesBelowSearch = accessibility.showCardNamesBelowSearch;
  const rawQuery = searchParams.get("q") ?? "";
  const trimmed = rawQuery.trim();
  const rawPerPage = searchParams.get("perPage");
  const perPageParam = parseStoredPageSize(rawPerPage);
  const hasPerPageParam = perPageParam !== null;
  const perPage = perPageParam ?? DEFAULT_PAGE_SIZE;
  const canRememberPerPage = hasFetchedBanner && has("functionality");
  const pageParam = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const requestedPage =
    Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const offset = (requestedPage - 1) * perPage;
  const resultsView = parseSearchResultsView(searchParams.get("view"));

  const search = useQuery({
    queryKey: cardsQueryKeys.search(trimmed, perPage, offset, true),
    queryFn: () =>
      cardsApi.searchByName(trimmed, {
        limit: perPage,
        offset,
        includePrices: true,
      }),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const total = trimmed ? (search.data?.total ?? 0) : 0;
  const cardTotal = trimmed ? (search.data?.count ?? 0) : 0;
  const cards = trimmed ? (search.data?.cards ?? []) : [];
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
    if (sole) router.replace(cardHref(sole));
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
    (next: SearchResultsView) => {
      updateSearchParams((p) => {
        if (next === "images") p.delete("view");
        else p.set("view", next);
      });
    },
    [updateSearchParams],
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
          {trimmed && !search.isFetching && (
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
              <ToggleGroup
                type="single"
                spacing={0}
                variant="outline"
                size="sm"
                value={resultsView}
                onValueChange={(v: string) => {
                  if (!v) return;
                  setResultsView(v as SearchResultsView);
                }}
                aria-label="Search results layout"
              >
                <ToggleGroupItem value="details" className="gap-1.5 px-2.5">
                  <LayoutList data-icon="inline-start" className="size-3.5" />
                  Full details
                </ToggleGroupItem>
                <ToggleGroupItem value="images" className="gap-1.5 px-2.5">
                  <LayoutGrid data-icon="inline-start" className="size-3.5" />
                  Images
                </ToggleGroupItem>
                <ToggleGroupItem value="table" className="gap-1.5 px-2.5">
                  <Table2 data-icon="inline-start" className="size-3.5" />
                  Table
                </ToggleGroupItem>
              </ToggleGroup>
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
                className="border-input bg-background text-foreground h-9 w-22 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

      {trimmed && search.isPending && cards.length === 0 ? (
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

function SearchSkeleton({
  count,
  view,
}: {
  count: number;
  view: SearchResultsView;
}) {
  const n = Math.min(count, view === "details" ? 5 : view === "table" ? 8 : 12);

  if (view === "details") {
    return (
      <div className="flex flex-col" aria-hidden="true">
        {Array.from({ length: n }).map((_, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <Separator className="my-4" /> : null}
            <div className="flex gap-6">
              <Skeleton className="aspect-2/3 w-28 shrink-0 rounded-lg sm:w-32" />
              <div className="flex flex-1 flex-col gap-3 pt-1">
                <Skeleton className="h-6 w-2/3 max-w-xs" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-16 w-full max-w-xl" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
          </React.Fragment>
        ))}
      </div>
    );
  }

  if (view === "table") {
    return (
      <div className="rounded-lg border" aria-hidden="true">
        <div className="flex gap-2 border-b p-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-8 flex-1" />
          ))}
        </div>
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="flex gap-2 border-b p-2 last:border-0">
            {Array.from({ length: 10 }).map((_, j) => (
              <Skeleton key={j} className="h-6 flex-1" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6"
      aria-hidden="true"
    >
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="aspect-2/3 w-full rounded-lg" />
      ))}
    </div>
  );
}

function formatUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function formatEur(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `€${n.toFixed(2)}`;
}

function cardTypeLine(card: Card): string {
  const { type, supertype } = card.classification ?? {};
  return [type, supertype].filter(Boolean).join(" — ") || "—";
}

function cardIsLandscapeOriented(card: Card): boolean {
  const o = card.media?.orientation;
  return o === "landscape" || o === "horizontal";
}

function meaningfulCardDomains(card: Card): string[] {
  return (card.classification?.domains ?? []).filter(
    (d) => d.trim() !== "" && d.trim().toLowerCase() !== "colorless",
  );
}

function CardDetailsResults({ cards }: { cards: Card[] }) {
  return (
    <div className="flex flex-col">
      {cards.map((card, index) => {
        const domains = meaningfulCardDomains(card);
        return (
          <React.Fragment key={card.id}>
            {index > 0 ? <Separator className="my-8" /> : null}
            <article>
              <Link
                href={cardHref(card)}
                className="hover:bg-muted/35 -mx-3 flex items-start gap-6 rounded-xl px-3 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:gap-8"
              >
                <DetailsCardArt card={card} />
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="text-lg font-semibold tracking-tight text-primary sm:text-xl">
                      {card.name}
                    </h2>
                    {domains.length > 0 ? (
                      <span className="text-muted-foreground text-sm">
                        {domains.join(", ")}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {cardTypeLine(card)}
                  </p>
                  {card.text?.plain?.trim() ? (
                    <p className="text-foreground/90 max-w-prose text-sm leading-relaxed whitespace-pre-wrap">
                      {card.text.plain.trim()}
                    </p>
                  ) : null}
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                    <span className="tabular-nums">
                      USD {formatUsd(card.prices?.tcgplayer?.normal ?? undefined)}
                    </span>
                    <span className="tabular-nums">
                      EUR{" "}
                      {formatEur(card.prices?.cardmarket?.normal ?? undefined)}
                    </span>
                    {card.set?.set_code ? (
                      <span className="uppercase">{card.set.set_code}</span>
                    ) : null}
                    {card.collector_number ? (
                      <span className="tabular-nums">
                        #{card.collector_number}
                      </span>
                    ) : null}
                  </div>
                  <DetailTagRow card={card} />
                </div>
              </Link>
            </article>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function DetailTagRow({ card }: { card: Card }) {
  const chips: string[] = [...(card.classification?.tags ?? [])];
  const finishes = card.metadata?.finishes ?? [];
  if (finishes.includes("Foil")) chips.push("Foil");
  if (card.metadata?.alternate_art) chips.push("Alt art");
  if (card.related_printings?.length) chips.push("Reprint");

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((tag) => (
        <span
          key={tag}
          className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function DetailsCardArt({ card }: { card: Card }) {
  const imageUrl = card.media?.media_urls?.normal;
  const [failed, setFailed] = React.useState(false);
  const isLandscape = cardIsLandscapeOriented(card);

  React.useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-lg bg-muted",
        isLandscape
          ? "aspect-3/2 w-44 sm:w-52"
          : "aspect-2/3 w-28 sm:w-32",
      )}
    >
      {!imageUrl || failed ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 p-2">
          <ImageOffIcon
            className="size-5 text-muted-foreground/60"
            aria-hidden="true"
          />
          <span className="text-center text-[10px] text-muted-foreground">
            No image
          </span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function CardTableResults({ cards }: { cards: Card[] }) {
  const router = useRouter();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Set</TableHead>
          <TableHead className="tabular-nums">#</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="min-w-[140px] whitespace-normal">
            Tags
          </TableHead>
          <TableHead>Rarity</TableHead>
          <TableHead className="min-w-[120px] whitespace-normal">
            Artist
          </TableHead>
          <TableHead className="tabular-nums">USD</TableHead>
          <TableHead className="tabular-nums">EUR</TableHead>
          <TableHead className="min-w-[100px] whitespace-normal">
            Domains
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cards.map((card) => {
          const rowHref = cardHref(card);
          const usdText = formatUsd(card.prices?.tcgplayer?.normal ?? undefined);
          const eurText = formatEur(card.prices?.cardmarket?.normal ?? undefined);
          const usdMarketUrl = card.purchase_uris?.tcgplayer;
          const eurMarketUrl = card.purchase_uris?.cardmarket;

          return (
            <TableRow
              key={card.id}
              className="cursor-pointer"
              onClick={() => router.push(rowHref)}
            >
              <TableCell className="max-w-[120px] truncate font-medium uppercase">
                {card.set?.set_code ?? "—"}
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {card.collector_number ?? "—"}
              </TableCell>
              <TableCell className="max-w-[220px] whitespace-normal font-medium">
                <Link
                  href={rowHref}
                  className="text-primary no-underline hover:no-underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {card.name}
                </Link>
              </TableCell>
              <TableCell className="max-w-[180px] whitespace-normal">
                {cardTypeLine(card)}
              </TableCell>
              <TableCell className="max-w-[200px] whitespace-normal text-sm">
                {(card.classification?.tags ?? []).join(", ") || "—"}
              </TableCell>
              <TableCell>{card.classification?.rarity ?? "—"}</TableCell>
              <TableCell className="max-w-[160px] whitespace-normal text-sm">
                {card.artist ?? "—"}
              </TableCell>
              <TableCell className="tabular-nums">
                {usdMarketUrl ? (
                  <a
                    href={usdMarketUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary no-underline hover:no-underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {usdText}
                  </a>
                ) : (
                  usdText
                )}
              </TableCell>
              <TableCell className="tabular-nums">
                {eurMarketUrl ? (
                  <a
                    href={eurMarketUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary no-underline hover:no-underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {eurText}
                  </a>
                ) : (
                  eurText
                )}
              </TableCell>
              <TableCell className="max-w-[160px] whitespace-normal text-sm">
                {meaningfulCardDomains(card).join(", ") || "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function CardGrid({
  cards,
  cardNamePlacement,
}: {
  cards: Card[];
  cardNamePlacement: "overlay" | "below";
}) {
  const allLandscapeOriented =
    cards.length > 0 && cards.every(cardIsLandscapeOriented);

  return (
    <ul
      className={cn(
        "grid gap-4",
        allLandscapeOriented
          ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6",
      )}
    >
      {cards.map((card) => (
        <li key={card.id}>
          <CardGridLink
            card={card}
            naturalLandscapeLayout={allLandscapeOriented}
            cardNamePlacement={cardNamePlacement}
          />
        </li>
      ))}
    </ul>
  );
}

function CardGridLink({
  card,
  naturalLandscapeLayout,
  cardNamePlacement,
}: {
  card: Card;
  naturalLandscapeLayout: boolean;
  cardNamePlacement: "overlay" | "below";
}) {
  const href = cardHref(card);
  const isLandscape = cardIsLandscapeOriented(card);

  return (
    <Link
      href={href}
      title={card.name}
      aria-label={card.name}
      className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardThumbnail
        card={card}
        isLandscape={isLandscape}
        naturalLandscapeLayout={naturalLandscapeLayout}
        cardName={card.name}
        cardNamePlacement={cardNamePlacement}
      />
    </Link>
  );
}

function CardThumbnail({
  card,
  isLandscape,
  naturalLandscapeLayout,
  cardName,
  cardNamePlacement,
}: {
  card: Card;
  isLandscape: boolean;
  naturalLandscapeLayout: boolean;
  cardName?: string;
  cardNamePlacement: "overlay" | "below";
}) {
  const imageUrl = card.media?.media_urls?.normal;
  const [failed, setFailed] = React.useState(false);
  const aspectClass = naturalLandscapeLayout ? "aspect-3/2" : "aspect-2/3";
  const showOverlayName =
    cardNamePlacement === "overlay" && Boolean(cardName);
  const showBelowName =
    cardNamePlacement === "below" && Boolean(cardName);

  React.useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  const belowCaption = showBelowName ? (
    <span
      aria-hidden="true"
      className="line-clamp-2 px-0.5 text-center text-xs font-medium leading-snug text-foreground"
    >
      {cardName}
    </span>
  ) : null;

  if (!imageUrl || failed) {
    return (
      <div className="flex w-full flex-col gap-1.5">
        <div
          className={cn(
            "relative flex w-full flex-col items-center justify-center gap-1.5 rounded-lg bg-muted",
            aspectClass,
          )}
        >
          {showOverlayName ? (
            <span aria-hidden="true" className={CARD_GRID_INVISIBLE_LABEL}>
              {cardName}
            </span>
          ) : null}
          <ImageOffIcon
            className="size-6 text-muted-foreground/60"
            aria-hidden="true"
          />
          <span className="text-[10px] text-muted-foreground">Coming soon</span>
        </div>
        {belowCaption}
      </div>
    );
  }

  const showRotatedInPortraitSlot =
    isLandscape && !naturalLandscapeLayout;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-lg bg-muted",
          aspectClass,
        )}
      >
        {showOverlayName ? (
          <span aria-hidden="true" className={CARD_GRID_INVISIBLE_LABEL}>
            {cardName}
          </span>
        ) : null}
        {showRotatedInPortraitSlot ? (
          <div className="absolute left-1/2 top-1/2 h-2/3 w-[150%] -translate-x-1/2 -translate-y-1/2 origin-center -rotate-90">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() => setFailed(true)}
            />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      {belowCaption}
    </div>
  );
}

function buildPageRange(
  current: number,
  total: number,
): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const result: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) result.push("ellipsis");
  for (let i = start; i <= end; i++) result.push(i);
  if (end < total - 1) result.push("ellipsis");
  result.push(total);
  return result;
}
