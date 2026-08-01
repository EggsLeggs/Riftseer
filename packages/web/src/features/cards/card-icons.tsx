"use client";

import type * as React from "react";
import Link from "next/link";
import type { Card } from "@riftseer/types";

import { cardIsGear, cardTypeIconKey, cardTypeLine, typeBadgeStyle } from "@/features/cards/format";
import {
  cardTypeLineSearchQuery,
  domainSearchQuery,
  searchHref,
} from "@/features/cards/search-links";
import { useSitePreferences } from "@/features/site-preferences/site-preferences-provider";
import { cn } from "@/lib/utils";

/** Rarities we ship artwork for; anything else renders as text only. */
const RARITIES_WITH_ICONS = new Set([
  "common",
  "showcase",
  "uncommon",
  "rare",
  "epic",
]);

const DOMAINS_WITH_GLYPHS = new Set([
  "fury",
  "calm",
  "mind",
  "body",
  "chaos",
  "order",
  "rainbow",
]);

/** Energy cost bubble. Gear cards show a diamond instead of a circle. */
export function EnergyCost({
  energy,
  card,
  className,
}: {
  energy: number;
  card: Pick<Card, "classification">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "icon-energy-value",
        cardIsGear(card) && "icon-energy-gear",
        className,
      )}
      data-value={energy}
      aria-label={`${energy} energy`}
    />
  );
}

export function PowerStat({ power }: { power: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="icon-power" aria-hidden="true" />
      <span className="font-semibold tabular-nums">{power}</span>
      <span className="sr-only">power</span>
    </span>
  );
}

/**
 * `signed` renders an equipment's Might *bonus* (`+2`, and `+0` where the card
 * prints one), which reads as a modifier rather than a stat.
 */
export function MightStat({
  might,
  signed = false,
}: {
  might: number;
  signed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="icon-might" aria-hidden="true" />
      <span className="tabular-nums">
        {signed && might >= 0 ? `+${might}` : might}
      </span>
      <span className="sr-only">{signed ? "might bonus" : "might"}</span>
    </span>
  );
}

export function RarityIcon({ rarity }: { rarity: string }) {
  if (!RARITIES_WITH_ICONS.has(rarity.toLowerCase())) return null;
  return (
    <span
      className={cn("icon-rarity", `icon-rarity-${rarity.toLowerCase()}`)}
      aria-hidden="true"
    />
  );
}

/** Domain runes with icon + name; multiple domains each get their own icon. */
export function DomainRunes({
  domains,
  className,
  linked = false,
}: {
  domains: string[];
  className?: string;
  /** Link each domain to a `d:` search. Card detail only. */
  linked?: boolean;
}) {
  if (domains.length === 0) return null;

  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-x-3 gap-y-1", className)}
    >
      {domains.map((domain) => {
        const key = domain.toLowerCase();
        const hasGlyph = DOMAINS_WITH_GLYPHS.has(key);
        const content = (
          <>
            {hasGlyph ? (
              <span
                className={`icon-rune-${key}-glyph`}
                aria-hidden="true"
                style={{ width: "1.25em", height: "1.25em" }}
              />
            ) : null}
            <span>{domain}</span>
          </>
        );

        if (!linked) {
          return (
            <span key={domain} className="inline-flex items-center gap-1.5">
              {content}
            </span>
          );
        }

        return (
          <Link
            key={domain}
            href={searchHref(domainSearchQuery(domain))}
            aria-label={`Search for ${domain} cards`}
            title={`Search for ${domain} cards`}
            className="inline-flex items-center gap-1.5 rounded-sm transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {content}
          </Link>
        );
      })}
    </span>
  );
}

const TYPE_ICON_KEYS = new Set([
  "battlefield",
  "champion",
  "gear",
  "legend",
  "rune",
  "spell",
  "unit",
]);

/**
 * Type chrome: vertical capsule with the type glyph, joined to a rhombus-like
 * label that only slants on the right (see keywords.css `.card-type-badge`).
 * Falls back to plain text when text-over-symbols is on.
 */
export function CardTypeLine({
  card,
  badge = false,
  linked = false,
}: {
  card: Card;
  /** Capsule + rhombus chrome (simple card detail). Plain icon+text otherwise. */
  badge?: boolean;
  /**
   * Link the whole line to the search matching it — a Signature Unit goes to
   * `st:signature t:unit`, not to a single unusable filter. Opt-in because the
   * browse table and grid render this inside their own click targets.
   */
  linked?: boolean;
}) {
  const { accessibility } = useSitePreferences();
  const label = cardTypeLine(card);
  if (label === "—") return <span>—</span>;

  const query = linked ? cardTypeLineSearchQuery(card) : null;
  // Wrap whatever the chrome turned out to be, so the link never changes layout.
  const withLink = (content: React.ReactNode) =>
    query ? (
      <Link
        href={searchHref(query)}
        aria-label={`Search for ${label} cards`}
        title={`Search for ${label} cards`}
        className="inline-flex rounded-sm transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {content}
      </Link>
    ) : (
      content
    );

  if (accessibility.preferTextOverSymbols) {
    return withLink(<span className="font-medium">{label}</span>);
  }

  const iconKey = cardTypeIconKey(card);
  const showIcon = iconKey != null && TYPE_ICON_KEYS.has(iconKey);
  const style = typeBadgeStyle(card);

  if (!badge) {
    return withLink(
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {showIcon ? (
          <span
            className={`icon-${iconKey} shrink-0`}
            aria-hidden="true"
            style={{ width: "1.1em", height: "1.1em" }}
          />
        ) : null}
        <span>{label}</span>
      </span>,
    );
  }

  return withLink(
    <span
      className={cn(
        "card-type-badge",
        !showIcon && "card-type-badge--plain",
        style.variant === "rune" && "card-type-badge--rune",
      )}
      style={
        {
          "--type-tag-bg": style.labelBg,
          "--type-tag-fg": style.labelFg,
          "--type-rarity-color": style.rarityColor,
        } as React.CSSProperties
      }
      aria-label={query ? undefined : label}
    >
      {showIcon ? (
        <span className="card-type-badge-glyph" aria-hidden="true">
          <span className={`icon-${iconKey}`} />
        </span>
      ) : null}
      {style.variant === "rune" ? (
        <span className="card-type-badge-label-shell">
          <span className="card-type-badge-label">{label}</span>
        </span>
      ) : (
        <span className="card-type-badge-label">{label}</span>
      )}
    </span>,
  );
}
