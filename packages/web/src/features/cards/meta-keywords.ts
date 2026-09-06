import type { CardResult } from "./api";
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
 * The printed rarity ladder. `order:rarity` has to sort by this, not
 * alphabetically — "Epic" before "Rare" before "Uncommon" is meaningless to a
 * reader. Anything outside the ladder (`Promo`, or a value a later set
 * introduces) sorts after it, keeping its incoming order.
 */
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "showcase"];

function rarityRank(rarity: string | null | undefined): number | null {
  if (!rarity) return null;
  const index = RARITY_ORDER.indexOf(rarity.trim().toLowerCase());
  return index === -1 ? RARITY_ORDER.length : index;
}

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

function cardValue(card: CardResult, field: OrderField): CardValue {
  const { oracle, printing } = card;
  switch (field) {
    case "energy":    return oracle.energy ?? null;
    case "power":     return oracle.power ?? null;
    case "might":     return oracle.might ?? null;
    case "rarity":    return rarityRank(printing.rarity);
    case "artist":    return printing.artist ?? null;
    case "usd":       return tcgplayerUsdPrice(printing.prices?.tcgplayer);
    case "eur":       return printing.prices?.cardmarket?.normal ?? null;
    case "domain":    return oracle.domains[0] ?? null;
    case "set":       return printing.set?.set_code ?? null;
    case "collector": {
      const m = /^(\d+)/.exec(printing.collector_number ?? "");
      return m ? parseInt(m[1], 10) : null;
    }
  }
}

/** Sort a cards array by the given field and direction. Nulls always sort last. */
export function sortCards(
  cards: CardResult[],
  field: OrderField,
  direction: "asc" | "desc",
): CardResult[] {
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
