"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImageOffIcon } from "lucide-react";
import type { Card } from "@riftseer/types";
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
import { cardHref } from "@/features/cards/paths";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

export function formatEur(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `€${n.toFixed(2)}`;
}

export function cardTypeLine(card: Card): string {
  const { type, supertype } = card.classification ?? {};
  return [type, supertype].filter(Boolean).join(" — ") || "—";
}

export function cardIsLandscapeOriented(card: Card): boolean {
  const o = card.media?.orientation;
  return o === "landscape" || o === "horizontal";
}

export function meaningfulCardDomains(card: Card): string[] {
  return (card.classification?.domains ?? []).filter(
    (d) => d.trim() !== "" && d.trim().toLowerCase() !== "colorless",
  );
}

const CARD_GRID_INVISIBLE_LABEL =
  "pointer-events-none absolute inset-x-0 top-0 z-[1000] box-border w-full pt-[6.75%] pl-[8%] text-sm tracking-normal text-transparent select-text";

// ─── View types ───────────────────────────────────────────────────────────────

export const CARD_RESULTS_VIEWS = ["details", "images", "table"] as const;
export type CardResultsView = (typeof CARD_RESULTS_VIEWS)[number];

// ─── SearchSkeleton ───────────────────────────────────────────────────────────

export function SearchSkeleton({
  count,
  view,
}: {
  count: number;
  view: CardResultsView;
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

// ─── CardDetailsResults ───────────────────────────────────────────────────────

export function CardDetailsResults({ cards }: { cards: Card[] }) {
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

// ─── CardTableResults ─────────────────────────────────────────────────────────

export function CardTableResults({ cards }: { cards: Card[] }) {
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

// ─── CardGrid ─────────────────────────────────────────────────────────────────

export function CardGrid({
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

// ─── Pagination helper ────────────────────────────────────────────────────────

export function buildPageRange(
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
