import type { Card, CardPriceEntry } from "@riftseer/types";

/**
 * TCGPlayer may expose a card only under the Foil subtype. Prefer the regular
 * printing when both exist, but do not hide a valid foil-only USD price.
 */
export function tcgplayerUsdPrice(
  prices: CardPriceEntry | null | undefined,
): number | null {
  return prices?.normal ?? prices?.foil ?? null;
}

export function formatUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

export function formatEur(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `€${n.toFixed(2)}`;
}

/**
 * Display type line: special + base as "X Y" (e.g. "Champion Unit",
 * "Signature Spell", "Token Unit"). Lone "Token" becomes "Token Unit".
 * Legends keep a lone "Legend" — upstream stores Champion as affiliation,
 * not a printed type prefix.
 */
export function cardTypeLine(card: Card): string {
  const type = card.classification?.type?.trim() || undefined;
  const special = card.classification?.supertype?.trim() || undefined;
  const typeKey = type?.toLowerCase();

  if (typeKey === "legend") return type!;
  if (type && special) return `${special} ${type}`;
  if (typeKey === "token") return "Token Unit";
  return type ?? special ?? "—";
}

/**
 * Glyph for {@link cardTypeLine}. Champion units use the champion icon;
 * legends use the legend icon. Every other special (Signature, Token, …)
 * keeps the base type's glyph.
 */
export function cardTypeIconKey(card: Card): string | null {
  const type = card.classification?.type?.trim();
  const special = card.classification?.supertype?.trim();
  const typeKey = type?.toLowerCase();
  const specialKey = special?.toLowerCase();

  if (typeKey === "legend") return "legend";
  if (specialKey === "champion") return "champion";

  const base = typeKey ?? specialKey;
  if (!base) return null;
  if (base === "token") return "unit";
  return base;
}

export function cardIsLandscapeOriented(card: Card): boolean {
  const orientation = card.media?.orientation;
  return orientation === "landscape" || orientation === "horizontal";
}

/** Gear printings show card energy cost in a diamond, not a circle. */
export function cardIsGear(card: Pick<Card, "classification">): boolean {
  return card.classification?.type?.trim().toLowerCase() === "gear";
}

/** Drops the placeholder "Colorless" domain, which has no rune of its own. */
export function meaningfulCardDomains(card: Card): string[] {
  return (card.classification?.domains ?? []).filter(
    (d) => d.trim() !== "" && d.trim().toLowerCase() !== "colorless",
  );
}

/** Domain fills sampled from `public/icons/domains/rune_*.svg`. */
const DOMAIN_BADGE_COLORS: Record<string, string> = {
  fury: "#DF1620",
  calm: "#488C38",
  mind: "#0F6FA6",
  body: "#E87600",
  chaos: "#6A4094",
  order: "#D2B400",
};

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
export function typeBadgeStyle(card: Card): TypeBadgeStyle {
  const typeKey = card.classification?.type?.trim().toLowerCase();
  const specialKey = card.classification?.supertype?.trim().toLowerCase();
  const rarityColor = typeBadgeRarityColor(card.classification?.rarity);
  const domains = meaningfulCardDomains(card);
  const isToken =
    card.is_token === true || typeKey === "token" || specialKey === "token";

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
    const domainKey = domains[0]!.toLowerCase();
    const domainColor = DOMAIN_BADGE_COLORS[domainKey];
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
export function meaningfulRulesText(
  plain: string | null | undefined,
): string | undefined {
  const trimmed = plain?.trim();
  if (!trimmed) return undefined;
  if (/^\[?no text\]?$/iu.test(trimmed)) return undefined;
  return trimmed;
}
