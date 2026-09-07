import type { CardPriceEntry, Oracle, Printing } from "@riftseer/types";
import { domainRuneHex, meaningfulCardDomains } from "@riftseer/types/render";

/**
 * What these formatters render when there is nothing to show. Exported so code
 * that filters the placeholder back out (alt text, for one) does not re-spell
 * the character.
 */
export const EMPTY_VALUE = "—";

/**
 * TCGPlayer may expose a card only under the Foil subtype. Prefer the regular
 * printing when both exist, but do not hide a valid foil-only USD price.
 */
export function tcgplayerUsdPrice(prices: CardPriceEntry | null | undefined): number | null {
  return prices?.normal ?? prices?.foil ?? null;
}

export function formatUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return EMPTY_VALUE;
  return `$${n.toFixed(2)}`;
}

export function formatEur(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return EMPTY_VALUE;
  return `€${n.toFixed(2)}`;
}

export function cardIsLandscapeOriented(printing: Printing): boolean {
  const orientation = printing.image_orientation;
  return orientation === "landscape" || orientation === "horizontal";
}

/** Gear printings show card energy cost in a diamond, not a circle. */
export function cardIsGear(oracle: Pick<Oracle, "card_type">): boolean {
  return oracle.card_type?.trim().toLowerCase() === "gear";
}

const TYPE_BADGE_GREY = "#c8c8c8";
const TYPE_BADGE_GOLD = "#D6A93C";
const TYPE_BADGE_BLACK = "#0a0a0a";
const TYPE_BADGE_WHITE = "#ffffff";

/** Rarity accent for the type-glyph inner ring + icon tint. */
export function typeBadgeRarityColor(rarity: string | null | undefined): string {
  const key = rarity?.trim().toLowerCase();
  if (key === "common") return "#A25F15";
  if (key === "uncommon") return "#999999";
  return TYPE_BADGE_GOLD;
}

export interface TypeBadgeStyle {
  /** Label fill. */
  labelBg: string;
  /** Label text. */
  labelFg: string;
  /** Glyph icon + inner ring (outer ring is the page background). */
  rarityColor: string;
  /** Rune labels get a white stroke (except the capsule-facing edge). */
  variant: "rune" | "default";
}

/**
 * Colours for the capsule + rhombus type chrome.
 *
 * Label: rune → black; battlefield / token → grey; legend / multi-domain → gold;
 * single domain → that domain's colour; otherwise grey.
 */
export function typeBadgeStyle(oracle: Oracle, rarity?: string | null): TypeBadgeStyle {
  const typeKey = oracle.card_type?.trim().toLowerCase();
  const specialKey = oracle.supertype?.trim().toLowerCase();
  const rarityColor = typeBadgeRarityColor(rarity);
  const domains = meaningfulCardDomains(oracle);
  const isToken = oracle.is_token || typeKey === "token" || specialKey === "token";

  if (typeKey === "rune") {
    return {
      labelBg: TYPE_BADGE_BLACK,
      labelFg: TYPE_BADGE_WHITE,
      rarityColor,
      variant: "rune",
    };
  }

  if (typeKey === "battlefield" || isToken) {
    return {
      labelBg: TYPE_BADGE_GREY,
      labelFg: TYPE_BADGE_BLACK,
      // Always silver — ignore print rarity for these types.
      rarityColor: TYPE_BADGE_GREY,
      variant: "default",
    };
  }

  if (typeKey === "legend" || domains.length > 1) {
    return {
      labelBg: TYPE_BADGE_GOLD,
      labelFg: TYPE_BADGE_BLACK,
      rarityColor,
      variant: "default",
    };
  }

  if (domains.length === 1) {
    const domainKey = domains[0]!.trim().toLowerCase();
    const domainColor = domainRuneHex(domainKey);
    if (domainColor) {
      return {
        labelBg: domainColor,
        // Order's yellow needs black text; other domains keep white.
        labelFg: domainKey === "order" ? TYPE_BADGE_BLACK : TYPE_BADGE_WHITE,
        rarityColor,
        variant: "default",
      };
    }
  }

  return {
    labelBg: TYPE_BADGE_GREY,
    labelFg: TYPE_BADGE_BLACK,
    rarityColor,
    variant: "default",
  };
}

/**
 * Upstream marks cards with no ability as `[NO TEXT]` (sometimes without
 * brackets). Treat that sentinel — and blank strings — as absent rules text.
 */
export function meaningfulRulesText(plain: string | null | undefined): string | undefined {
  const trimmed = plain?.trim();
  if (!trimmed) return undefined;
  if (/^\[?no text\]?$/iu.test(trimmed)) return undefined;
  return trimmed;
}
