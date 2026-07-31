import type { Card } from "@riftseer/types";
import { tcgplayerUsdPrice } from "./format";

export const ORDER_FIELDS = [
  "artist",
  "energy",
  "power",
  "might",
  "rarity",
  "usd",
  "eur",
  "domain",
  "set",
  "collector",
] as const;

export type OrderField = (typeof ORDER_FIELDS)[number];

export interface MetaKeywords {
  /** Clean query after meta-keywords have been stripped. */
  query: string;
  /** Set code filter extracted from `set:OGN`. */
  set?: string;
  /** Sort field extracted from `order:energy`. */
  order?: OrderField;
  /** Sort direction extracted from `direction:asc` / `direction:desc`. Default: "asc". */
  direction: "asc" | "desc";
  /** True when `unique:prints` or `++` was present — show all printings. */
  allPrintings: boolean;
}

const ORDER_FIELD_SET = new Set<string>(ORDER_FIELDS);

/**
 * Strip meta-keywords (`set:`, `order:`, `direction:`, `unique:prints`, `++`)
 * from a raw query string and return them plus the cleaned query text.
 */
export function parseMetaKeywords(raw: string): MetaKeywords {
  let s = raw;
  let set: string | undefined;
  let order: OrderField | undefined;
  let direction: "asc" | "desc" = "asc";
  let allPrintings = false;

  // unique:prints or ++ — must check ++ before generic word scan
  s = s.replace(/\+\+/g, () => { allPrintings = true; return ""; });
  s = s.replace(/\bunique:prints\b/gi, () => { allPrintings = true; return ""; });

  // set:VALUE
  s = s.replace(/\bset:(\S+)/gi, (_m, val: string) => {
    set = val.toUpperCase();
    return "";
  });

  // order:VALUE
  s = s.replace(/\border:(\S+)/gi, (_m, val: string) => {
    const lower = val.toLowerCase();
    if (ORDER_FIELD_SET.has(lower)) order = lower as OrderField;
    return "";
  });

  // direction:asc|desc
  s = s.replace(/\bdirection:(asc|desc)\b/gi, (_m, val: string) => {
    direction = val.toLowerCase() as "asc" | "desc";
    return "";
  });

  return { query: s.replace(/\s{2,}/g, " ").trim(), set, order, direction, allPrintings };
}

type CardValue = string | number | null | undefined;

function cardValue(card: Card, field: OrderField): CardValue {
  switch (field) {
    case "energy":    return card.attributes?.energy ?? null;
    case "power":     return card.attributes?.power ?? null;
    case "might":     return card.attributes?.might ?? null;
    case "rarity":    return card.classification?.rarity ?? null;
    case "artist":    return card.artist ?? null;
    case "usd":       return tcgplayerUsdPrice(card.prices?.tcgplayer);
    case "eur":       return card.prices?.cardmarket?.normal ?? null;
    case "domain":    return card.classification?.domains?.[0] ?? null;
    case "set":       return card.set?.set_code ?? null;
    case "collector": {
      const m = /^(\d+)/.exec(card.collector_number ?? "");
      return m ? parseInt(m[1], 10) : null;
    }
  }
}

/** Sort a cards array by the given field and direction. Nulls always sort last. */
export function sortCards(
  cards: Card[],
  field: OrderField,
  direction: "asc" | "desc",
): Card[] {
  const dir = direction === "asc" ? 1 : -1;
  return [...cards].sort((a, b) => {
    const av = cardValue(a, field);
    const bv = cardValue(b, field);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}
