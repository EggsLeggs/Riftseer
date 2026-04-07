/**
 * TCGCSV data source — fetches TCGPlayer groups, products, and prices.
 * Base: https://tcgcsv.com/tcgplayer/{category}/...
 */

import { logger } from "../utils.ts";

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";
const TCGCSV_CATEGORY = 89;
const GROUP_FETCH_CONCURRENCY = 5;

export interface TCGGroup {
  groupId: number;
  name: string;
  abbreviation: string;
  publishedOn?: string;
  categoryId: number;
}

export interface TCGProduct {
  productId: number;
  name: string;
  cleanName: string;
  imageUrl?: string;
  url: string;
  extendedData?: Array<{ name: string; displayName: string; value: string }>;
  presaleInfo?: { releasedOn?: string | null } | null;
}

export interface TCGPrice {
  productId: number;
  lowPrice: number | null;
  marketPrice: number | null;
  subTypeName: string;
}

export interface TCGGroupResult {
  groupId: number;
  products: TCGProduct[];
  prices: TCGPrice[];
}

export async function fetchGroups(timeoutMs: number): Promise<TCGGroup[]> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${TCGCSV_BASE}/${TCGCSV_CATEGORY}/groups`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`fetchGroups: ${res.status} ${res.statusText}`);
    const raw = (await res.json()) as { results?: TCGGroup[] };
    const groups = Array.isArray(raw?.results) ? raw.results : [];
    logger.info("Fetched TCGPlayer groups", { count: groups.length });
    return groups;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchProductsAndPrices(
  groupId: number,
  signal: AbortSignal,
): Promise<{ products: TCGProduct[]; prices: TCGPrice[] }> {
  const base = `${TCGCSV_BASE}/${TCGCSV_CATEGORY}/${groupId}`;
  const [productsRes, pricesRes] = await Promise.all([
    fetch(`${base}/products`, { signal }),
    fetch(`${base}/prices`, { signal }),
  ]);

  if (!productsRes.ok || !pricesRes.ok) {
    logger.warn("Skipping TCGPlayer group — fetch failed", { groupId });
    return { products: [], prices: [] };
  }

  const productsRaw = (await productsRes.json()) as { results?: TCGProduct[] };
  const pricesRaw = (await pricesRes.json()) as { results?: TCGPrice[] };

  return {
    products: Array.isArray(productsRaw?.results) ? productsRaw.results : [],
    prices: Array.isArray(pricesRaw?.results) ? pricesRaw.results : [],
  };
}

export async function fetchAllGroupResults(
  groups: TCGGroup[],
  timeoutMs: number,
): Promise<TCGGroupResult[]> {
  logger.info("Fetching TCGPlayer products and prices for all groups", { groups: groups.length });
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const results: TCGGroupResult[] = new Array(groups.length);
    let nextIndex = 0;
    const workers = Array.from(
      { length: Math.min(GROUP_FETCH_CONCURRENCY, groups.length) },
      async () => {
        while (nextIndex < groups.length) {
          const current = nextIndex;
          nextIndex += 1;
          const group = groups[current];
          const { products, prices } = await fetchProductsAndPrices(group.groupId, ctrl.signal);
          results[current] = { groupId: group.groupId, products, prices };
        }
      },
    );
    await Promise.all(workers);
    return results;
  } finally {
    clearTimeout(timeout);
  }
}
