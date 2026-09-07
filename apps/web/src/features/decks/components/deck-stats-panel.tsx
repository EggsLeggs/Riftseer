"use client";

import * as React from "react";

import { NEUTRAL_DOMAIN_RGB, domainWashRgb, hasRuneGlyph } from "@riftseer/types/render";
import { cn } from "@/lib/utils";
import {
  deckStats,
  type DeckStatBucket,
  type DeckStatShare,
  type StattableCard,
} from "../deck-stats";

/**
 * What the deck is made of, under the list.
 *
 * Every figure is stated in text beside its bar, so colour is never the only
 * identifier — a domain still has its name and rune glyph. Domain bars use
 * the game's hues as decoration; type bars stay one neutral ink.
 */
export function DeckStatsPanel({ cards }: { cards: readonly StattableCard[] }) {
  const stats = React.useMemo(() => deckStats(cards), [cards]);

  if (stats.cards === 0) {
    return (
      <p className="text-muted-foreground text-sm">Add cards to the main deck to see its shape.</p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Capped: the panel runs the page width, and three tiles stretched
          across it read as three unrelated numbers rather than a summary. */}
      <dl className="bg-border grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-lg border">
        <StatTile label="Cards" value={String(stats.cards)} />
        <StatTile label="Avg energy" value={oneDecimal(stats.averageEnergy)} />
        <StatTile label="Avg power" value={oneDecimal(stats.averagePower)} />
      </dl>

      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
        <Curve title="Energy curve" unit="energy" buckets={stats.energyCurve} />
        <Curve title="Power curve" unit="power" buckets={stats.powerCurve} />
        <Shares
          title="Domains"
          shares={stats.domains}
          total={stats.cards}
          domainGlyphs
          domainColors
        />
        <Shares title="Card types" shares={stats.cardTypes} total={stats.cards} />
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background flex flex-col items-center gap-0.5 px-3 py-4">
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
      <dt className="text-muted-foreground text-xs tracking-wide uppercase">{label}</dt>
    </div>
  );
}

/**
 * Copies at each cost. Every bar is labelled with its own count, so there is no
 * y-axis to read against and no gridlines to ignore — with ten columns at most,
 * the number is shorter than the axis it would replace.
 */
function Curve({
  title,
  unit,
  buckets,
}: {
  title: string;
  unit: string;
  buckets: readonly DeckStatBucket[];
}) {
  if (buckets.length === 0) return null;
  const tallest = Math.max(...buckets.map((bucket) => bucket.count), 1);

  return (
    <section aria-label={title}>
      <h3 className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
        {title}
      </h3>
      <ul className="flex h-40 items-end gap-1.5">
        {buckets.map((bucket) => (
          <li
            key={bucket.value}
            className="flex h-full min-w-0 flex-1 flex-col gap-1"
            title={`${bucket.count} ${bucket.count === 1 ? "card" : "cards"} at ${bucket.value} ${unit}`}
          >
            <span className="text-center text-[11px] tabular-nums">
              {bucket.count > 0 ? bucket.count : ""}
            </span>
            {/* The bar scales against this track, not the column: the label
                above it is not plot area, and including it would push the
                tallest bar out of the box. */}
            <div className="flex min-h-0 flex-1 items-end">
              <div
                className="bg-foreground/70 w-full rounded-t-[4px]"
                style={{ height: `${(bucket.count / tallest) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <ul className="text-muted-foreground mt-1 flex gap-1.5 border-t pt-1 text-[11px]">
        {buckets.map((bucket) => (
          <li key={bucket.value} className="min-w-0 flex-1 text-center tabular-nums">
            {bucket.value}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One labelled bar per entry rather than one stacked bar.
 *
 * Separate rows mean no two fills ever touch, every row carries its own name
 * and count, and a domain's own rune glyph does the identifying — so nothing
 * here depends on telling two colours apart.
 */
function Shares({
  title,
  shares,
  total,
  domainGlyphs = false,
  domainColors = false,
}: {
  title: string;
  shares: readonly DeckStatShare[];
  /** Copies in the deck. Domains overlap, so a share can exceed it. */
  total: number;
  domainGlyphs?: boolean;
  domainColors?: boolean;
}) {
  if (shares.length === 0) return null;
  const widest = Math.max(...shares.map((share) => share.count), 1);

  return (
    <section aria-label={title}>
      <h3 className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
        {title}
      </h3>
      <ul className="flex flex-col gap-2">
        {shares.map((share) => (
          <li
            key={share.key}
            className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-2"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-sm">
              {domainGlyphs && (
                <span
                  className={cn("shrink-0", glyphClass(share.key))}
                  aria-hidden="true"
                  style={{ width: "1.1em", height: "1.1em" }}
                />
              )}
              <span className="truncate" title={share.label}>
                {share.label}
              </span>
            </span>
            <span className="bg-muted h-2 overflow-hidden rounded-full">
              <span
                className={cn("block h-full rounded-full", !domainColors && "bg-foreground/70")}
                style={{
                  width: `${(share.count / widest) * 100}%`,
                  ...(domainColors
                    ? {
                        backgroundColor: `rgb(${domainWashRgb(share.key) ?? NEUTRAL_DOMAIN_RGB} / 0.85)`,
                      }
                    : {}),
                }}
              />
            </span>
            <span className="text-muted-foreground w-14 text-right text-[11px] tabular-nums">
              {share.count} · {Math.round((share.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Domains with a printed rune. Anything else is named but not illustrated. */
function glyphClass(key: string): string | undefined {
  return hasRuneGlyph(key) ? `icon-rune-${key}-glyph` : undefined;
}

function oneDecimal(value: number | null): string {
  return value == null ? "—" : value.toFixed(1);
}
