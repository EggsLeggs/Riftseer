/**
 * The printed type line, derived one way for every surface.
 */

import type { Oracle } from "../card.ts";

type TypedOracle = Pick<Oracle, "card_type" | "supertype">;

/**
 * Display type line: special + base as "X Y" (e.g. "Champion Unit",
 * "Signature Spell", "Token Unit"). Lone "Token" becomes "Token Unit".
 * Legends keep a lone "Legend" — upstream stores Champion as affiliation,
 * not a printed type prefix. Null when the card carries no type at all.
 */
export function cardTypeLine(oracle: TypedOracle): string | null {
  const type = oracle.card_type?.trim() || undefined;
  const special = oracle.supertype?.trim() || undefined;
  const typeKey = type?.toLowerCase();

  if (typeKey === "legend") return type!;
  if (type && special) return `${special} ${type}`;
  if (typeKey === "token") return "Token Unit";
  return type ?? special ?? null;
}

/**
 * Glyph for {@link cardTypeLine}. Champion units use the champion icon;
 * legends use the legend icon. Every other special (Signature, Token, …)
 * keeps the base type's glyph.
 */
export function cardTypeIconKey(oracle: TypedOracle): string | null {
  const type = oracle.card_type?.trim();
  const special = oracle.supertype?.trim();
  const typeKey = type?.toLowerCase();
  const specialKey = special?.toLowerCase();

  if (typeKey === "legend") return "legend";
  if (specialKey === "champion") return "champion";

  const base = typeKey ?? specialKey;
  if (!base) return null;
  if (base === "token") return "unit";
  return base;
}
