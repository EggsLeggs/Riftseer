"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImageOffIcon, LayoutGrid, LayoutList, Table2 } from "lucide-react";
import { printingImageUrl } from "@riftseer/types";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CardTypeLine,
  DomainRunes,
  EnergyCost,
  MightStat,
  PowerStat,
} from "@/features/cards/card-icons";
import { CardTags } from "@/features/cards/card-tags";
import { CardText } from "@/features/cards/card-text";
import { cardHref } from "@/features/cards/paths";
import {
  cardIsLandscapeOriented,
  cardTypeLine,
  formatEur,
  formatUsd,
  meaningfulCardDomains,
  meaningfulRulesText,
  tcgplayerUsdPrice,
} from "@/features/cards/format";
import { cn } from "@/lib/utils";
import type { CardResult } from "./api";

// Re-exported so existing client views keep their single import site. Server
// components must import from ./format directly — this module is client-only.
export {
  cardIsLandscapeOriented,
  cardTypeLine,
  formatEur,
  formatUsd,
  meaningfulCardDomains,
  meaningfulRulesText,
  tcgplayerUsdPrice,
};

const CARD_GRID_INVISIBLE_LABEL =
  "pointer-events-none absolute inset-x-0 top-0 z-[1000] box-border w-full pt-[6.75%] pl-[8%] text-sm tracking-normal text-transparent select-text";

// ─── View types ───────────────────────────────────────────────────────────────

export const CARD_RESULTS_VIEWS = ["details", "images", "table"] as const;
export type CardResultsView = (typeof CARD_RESULTS_VIEWS)[number];

/** Native `<select>` styling shared with card browse toolbars. */
export const CARD_BROWSE_SELECT_CLASS =
  "border-input bg-background text-foreground h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const CARD_RESULTS_VIEW_TOGGLE_GROUP_CLASS = "h-9 items-stretch rounded-md";
const CARD_RESULTS_VIEW_TOGGLE_ITEM_CLASS =
  "h-full min-h-0 gap-1.5 rounded-none px-2.5 text-sm first:!rounded-l-md last:!rounded-r-md";

export function CardResultsViewToggle({
  value,
  onValueChange,
  "aria-label": ariaLabel = "Card layout",
}: {
  value: CardResultsView;
  onValueChange: (value: CardResultsView) => void;
  "aria-label"?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      spacing={0}
      variant="outline"
      size="lg"
      value={value}
      onValueChange={(v) => {
        if (!v) return;
        onValueChange(v as CardResultsView);
      }}
      aria-label={ariaLabel}
      className={CARD_RESULTS_VIEW_TOGGLE_GROUP_CLASS}
    >
      <ToggleGroupItem value="details" className={CARD_RESULTS_VIEW_TOGGLE_ITEM_CLASS}>
        <LayoutList data-icon="inline-start" className="size-3.5" />
        Full details
      </ToggleGroupItem>
      <ToggleGroupItem value="images" className={CARD_RESULTS_VIEW_TOGGLE_ITEM_CLASS}>
        <LayoutGrid data-icon="inline-start" className="size-3.5" />
        Images
      </ToggleGroupItem>
      <ToggleGroupItem value="table" className={CARD_RESULTS_VIEW_TOGGLE_ITEM_CLASS}>
        <Table2 data-icon="inline-start" className="size-3.5" />
        Table
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

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
              <Skeleton className="aspect-[5/7] w-28 shrink-0 rounded-lg sm:w-32" />
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
        <Skeleton key={i} className="aspect-[5/7] w-full rounded-lg" />
      ))}
    </div>
  );
}

// ─── CardDetailsResults ───────────────────────────────────────────────────────

export function CardDetailsResults({ cards }: { cards: CardResult[] }) {
  return (
    <div className="flex flex-col">
      {cards.map(({ oracle, printing }, index) => {
        const domains = meaningfulCardDomains(oracle);
        const rulesText = meaningfulRulesText(oracle.text?.plain);
        return (
          <React.Fragment key={printing.id}>
            {index > 0 ? <Separator className="my-8" /> : null}
            <article>
              <Link
                href={cardHref(printing)}
                className="hover:bg-muted/35 -mx-3 flex items-start gap-6 rounded-xl px-3 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:gap-8"
              >
                <DetailsCardArt printing={printing} />
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <h2 className="text-lg font-semibold tracking-tight text-primary sm:text-xl">
                      {oracle.name}
                    </h2>
                    <span className="inline-flex shrink-0 items-center gap-2">
                      {oracle.energy != null ? (
                        <EnergyCost
                          energy={oracle.energy}
                          oracle={oracle}
                        />
                      ) : null}
                      {oracle.power != null ? (
                        <PowerStat power={oracle.power} />
                      ) : null}
                      {oracle.might != null ? (
                        <MightStat might={oracle.might} />
                      ) : null}
                    </span>
                  </div>
                  <div className="text-muted-foreground inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <CardTypeLine oracle={oracle} rarity={printing.rarity} />
                    {domains.length > 0 ? (
                      <DomainRunes domains={domains} />
                    ) : null}
                  </div>
                  {oracle.tags.length > 0 ? <CardTags tags={oracle.tags} /> : null}
                  {rulesText ? (
                    <CardText
                      text={rulesText}
                      rich={oracle.text?.rich}
                      className="text-foreground/90 max-w-prose"
                    />
                  ) : null}
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                    <span className="tabular-nums">
                      USD {formatUsd(tcgplayerUsdPrice(printing.prices?.tcgplayer))}
                    </span>
                    <span className="tabular-nums">
                      EUR{" "}
                      {formatEur(printing.prices?.cardmarket?.normal ?? undefined)}
                    </span>
                    {printing.set?.set_code ? (
                      <span className="uppercase">{printing.set.set_code}</span>
                    ) : null}
                    {printing.collector_number ? (
                      <span className="tabular-nums">
                        #{printing.collector_number}
                      </span>
                    ) : null}
                  </div>
                  <DetailMetaChips printing={printing} />
                </div>
              </Link>
            </article>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** Foil / variant chips (classification tags use CardTags rhombuses). */
function DetailMetaChips({ printing }: { printing: CardResult["printing"] }) {
  const chips: string[] = [];
  const finishes = printing.finishes;
  if (finishes.includes("Foil")) chips.push("Foil");
  if (printing.alternate_art) chips.push("Alt art");
  if (printing.signature) chips.push("Signature");
  if (printing.overnumbered) chips.push("Overnumbered");
  if (printing.special_collection) chips.push("Special collection");
  if (printing.differs_from_oracle) chips.push("Printing variant");

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

function DetailsCardArt({ printing }: { printing: CardResult["printing"] }) {
  const imageUrl = printingImageUrl(printing, "normal");
  const [failed, setFailed] = React.useState(false);
  const isLandscape = cardIsLandscapeOriented(printing);

  React.useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-lg bg-muted",
        isLandscape
          ? "aspect-[7/5] w-44 sm:w-52"
          : "aspect-[5/7] w-28 sm:w-32",
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

export function CardTableResults({ cards }: { cards: CardResult[] }) {
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
        {cards.map(({ oracle, printing }) => {
          const rowHref = cardHref(printing);
          const usdText = formatUsd(tcgplayerUsdPrice(printing.prices?.tcgplayer));
          const eurText = formatEur(printing.prices?.cardmarket?.normal ?? undefined);
          const usdMarketUrl = printing.purchase_uris?.tcgplayer;
          const eurMarketUrl = printing.purchase_uris?.cardmarket;

          return (
            <TableRow
              key={printing.id}
              className="cursor-pointer"
              onClick={() => router.push(rowHref)}
            >
              <TableCell className="max-w-[120px] truncate font-medium uppercase">
                {printing.set?.set_code ?? "—"}
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {printing.collector_number ?? "—"}
              </TableCell>
              <TableCell className="max-w-[220px] whitespace-normal font-medium">
                <Link
                  href={rowHref}
                  className="text-primary no-underline hover:no-underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {oracle.name}
                </Link>
              </TableCell>
              <TableCell className="max-w-[180px] whitespace-normal">
                <CardTypeLine oracle={oracle} rarity={printing.rarity} />
              </TableCell>
              <TableCell className="max-w-[200px] whitespace-normal text-sm">
                {oracle.tags.join(", ") || "—"}
              </TableCell>
              <TableCell>{printing.rarity ?? "—"}</TableCell>
              <TableCell className="max-w-[160px] whitespace-normal text-sm">
                {printing.artist ?? "—"}
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
                {meaningfulCardDomains(oracle).join(", ") || "—"}
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
  cards: CardResult[];
  cardNamePlacement: "overlay" | "below";
}) {
  const allLandscapeOriented =
    cards.length > 0 && cards.every(({ printing }) => cardIsLandscapeOriented(printing));

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
        <li key={card.printing.id}>
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
  card: CardResult;
  naturalLandscapeLayout: boolean;
  cardNamePlacement: "overlay" | "below";
}) {
  const href = cardHref(card.printing);
  const isLandscape = cardIsLandscapeOriented(card.printing);

  return (
    <Link
      href={href}
      title={card.oracle.name}
      aria-label={card.oracle.name}
      className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardThumbnail
        card={card}
        isLandscape={isLandscape}
        naturalLandscapeLayout={naturalLandscapeLayout}
        cardName={card.oracle.name}
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
  card: CardResult;
  isLandscape: boolean;
  naturalLandscapeLayout: boolean;
  cardName?: string;
  cardNamePlacement: "overlay" | "below";
}) {
  const imageUrl = printingImageUrl(card.printing, "normal");
  const [failed, setFailed] = React.useState(false);
  const aspectClass = naturalLandscapeLayout ? "aspect-[7/5]" : "aspect-[5/7]";
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
            "relative flex w-full flex-col items-center justify-center gap-1.5 rounded-lg bg-muted transition-transform duration-200 group-hover:z-10 group-hover:scale-[1.03]",
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
          "relative w-full overflow-hidden rounded-lg bg-muted transition-transform duration-200 group-hover:z-10 group-hover:scale-[1.03]",
          aspectClass,
        )}
      >
        {showOverlayName ? (
          <span aria-hidden="true" className={CARD_GRID_INVISIBLE_LABEL}>
            {cardName}
          </span>
        ) : null}
        {showRotatedInPortraitSlot ? (
          <div className="absolute left-1/2 top-1/2 h-[calc(100%*5/7)] w-[140%] -translate-x-1/2 -translate-y-1/2 origin-center -rotate-90">
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
            className="h-full w-full object-cover"
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
