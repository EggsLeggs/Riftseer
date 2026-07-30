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
