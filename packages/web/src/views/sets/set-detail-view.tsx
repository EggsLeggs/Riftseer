"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, LayoutList, Table2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CardGrid,
  CardDetailsResults,
  CardTableResults,
  SearchSkeleton,
  CARD_RESULTS_VIEWS,
  type CardResultsView,
} from "@/features/cards/card-display";
import { cardsApi, cardsQueryKeys } from "@/features/cards/api";
import { setsApi, setsQueryKeys } from "@/features/sets/api";
import { sortCards, type OrderField } from "@/features/cards/meta-keywords";
import { formatUsd, formatEur } from "@/features/cards/card-display";
import { useSitePreferences } from "@/features/site-preferences/site-preferences-provider";
import { cn } from "@/lib/utils";

function formatDate(iso: string | null): string {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function parseViewParam(raw: string | null): CardResultsView | null {
  if (raw && (CARD_RESULTS_VIEWS as readonly string[]).includes(raw)) {
    return raw as CardResultsView;
  }
  return null;
}

const VALID_ORDERS: OrderField[] = [
  "collector", "artist", "energy", "power", "might",
  "rarity", "usd", "eur", "domain",
];

function parseOrder(raw: string | null): OrderField | undefined {
  if (raw && (VALID_ORDERS as string[]).includes(raw)) return raw as OrderField;
  return undefined;
}

export function SetDetailView({ code }: { code: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessibility, patchAccessibility } = useSitePreferences();
  const showCardNamesBelowSearch = accessibility.showCardNamesBelowSearch;

  const resultsView =
    parseViewParam(searchParams.get("view")) ?? accessibility.cardResultsView;
  const order = parseOrder(searchParams.get("order"));
  const direction = searchParams.get("direction") === "desc" ? "desc" : "asc";

  const setsQuery = useQuery({
    queryKey: setsQueryKeys.list(),
    queryFn: setsApi.getSets,
    staleTime: 5 * 60_000,
  });

  const cardsQuery = useQuery({
    queryKey: cardsQueryKeys.setCards(code, true),
    queryFn: () => cardsApi.getSetCards(code, { includePrices: true }),
    staleTime: 5 * 60_000,
  });

  const setInfo = setsQuery.data?.sets.find((s) => s.setCode === code);
  const rawCards = cardsQuery.data?.cards ?? [];
  const cards = order ? sortCards(rawCards, order, direction) : rawCards;

  const totalUsd = rawCards.reduce(
    (sum, c) => sum + (c.prices?.tcgplayer?.normal ?? 0),
    0,
  );
  const totalEur = rawCards.reduce(
    (sum, c) => sum + (c.prices?.cardmarket?.normal ?? 0),
    0,
  );

  const updateParam = React.useCallback(
    (key: string, value: string | null) => {
      const p = new URLSearchParams(searchParams.toString());
      if (value == null) p.delete(key);
      else p.set(key, value);
      router.replace(`/sets/${code.toLowerCase()}?${p.toString()}`, { scroll: false });
    },
    [router, searchParams, code],
  );

  const setResultsView = (next: CardResultsView) => {
    patchAccessibility({ cardResultsView: next });
    updateParam("view", next === "images" ? null : next);
  };

  const isLoading = cardsQuery.isPending;
  const isError = cardsQuery.isError;

  return (
    <div className="container py-8">
      {/* Header */}
      <header className="mb-8">
        {setsQuery.isPending ? (
          <div className="flex flex-col gap-2">
            <div className="h-8 w-48 animate-pulse rounded bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded bg-muted" />
          </div>
        ) : setInfo ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{setInfo.setName}</h1>
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-sm font-medium uppercase text-muted-foreground">
                {setInfo.setCode}
              </span>
              {setInfo.isPromo && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Promo
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span>Released {formatDate(setInfo.publishedOn)}</span>
              {rawCards.length > 0 && (
                <>
                  <span>{rawCards.length} cards (incl. printings)</span>
                  {totalUsd > 0 && (
                    <span>Total USD: <span className="tabular-nums text-foreground">{formatUsd(totalUsd)}</span></span>
                  )}
                  {totalEur > 0 && (
                    <span>Total EUR: <span className="tabular-nums text-foreground">{formatEur(totalEur)}</span></span>
                  )}
                </>
              )}
            </div>
          </>
        ) : !setsQuery.isError ? (
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{code}</h1>
          </div>
        ) : (
          <h1 className="text-2xl font-bold tracking-tight">{code}</h1>
        )}
      </header>

      {/* Controls */}
      {!isError && (
        <div className="mb-6 flex flex-wrap items-end gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-sm font-medium">View</span>
            <ToggleGroup
              type="single"
              spacing={0}
              variant="outline"
              size="sm"
              value={resultsView}
              onValueChange={(v: string) => {
                if (!v) return;
                setResultsView(v as CardResultsView);
              }}
              aria-label="Card layout"
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="set-order" className="text-muted-foreground">Sort by</Label>
            <select
              id="set-order"
              value={order ?? "collector"}
              onChange={(e) => {
                const val = e.target.value;
                updateParam("order", val === "collector" ? null : val);
              }}
              className="border-input bg-background text-foreground h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="collector">Collector #</option>
              <option value="energy">Energy</option>
              <option value="power">Power</option>
              <option value="might">Might</option>
              <option value="rarity">Rarity</option>
              <option value="artist">Artist</option>
              <option value="usd">USD</option>
              <option value="eur">EUR</option>
              <option value="domain">Domain</option>
            </select>
          </div>
          {order && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="set-direction" className="text-muted-foreground">Direction</Label>
              <select
                id="set-direction"
                value={direction}
                onChange={(e) => updateParam("direction", e.target.value === "asc" ? null : "desc")}
                className="border-input bg-background text-foreground h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Card display */}
      {isError ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <p className="text-base font-semibold">Failed to load cards</p>
          <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
        </div>
      ) : isLoading ? (
        <SearchSkeleton count={60} view={resultsView} />
      ) : cards.length > 0 ? (
        resultsView === "images" ? (
          <CardGrid
            cards={cards}
            cardNamePlacement={showCardNamesBelowSearch ? "below" : "overlay"}
          />
        ) : resultsView === "details" ? (
          <CardDetailsResults cards={cards} />
        ) : (
          <CardTableResults cards={cards} />
        )
      ) : (
        <p className={cn("py-20 text-center text-sm text-muted-foreground", !setInfo && "hidden")}>
          No cards found for this set.
        </p>
      )}
    </div>
  );
}
