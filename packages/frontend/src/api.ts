import { treaty } from "@elysiajs/eden";
import type { App } from "@riftseer/api";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? window.location.origin;
const client = treaty<App>(API_BASE);

// Derive types from the Eden client's route signatures (not from wrapper
// functions) to avoid circular references. Routes are under /api/v1.
type RandomCardData = Awaited<ReturnType<typeof client.api.v1.cards.random.get>>["data"];
type SetsData = Awaited<ReturnType<typeof client.api.v1.sets.get>>["data"];

export type Card = NonNullable<RandomCardData>;
export type CardSet = NonNullable<SetsData>["sets"][number];

export function apiUrl(path: string): string {
  const base = API_BASE.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export async function getCard(id: string): Promise<Card | null> {
  const { data, error } = await client.api.v1.cards({ id }).get();
  if (error) return null;
  return data;
}

export async function searchCards(
  name: string,
  opts: { limit?: number; set?: string; fuzzy?: boolean } = {}
): Promise<{ count: number; cards: Card[] }> {
  const { data, error } = await client.api.v1.cards.get({
    query: {
      name,
      limit: opts.limit !== undefined ? String(opts.limit) : undefined,
      set: opts.set,
      fuzzy: opts.fuzzy ? "1" : undefined,
    },
  });
  if (error || !data) return { count: 0, cards: [] };
  return data;
}

export async function getSets(): Promise<{ count: number; sets: CardSet[] }> {
  const { data, error } = await client.api.v1.sets.get();
  if (error || !data) return { count: 0, sets: [] };
  return data;
}

export type TCGPlayerPrice = { usdMarket: number | null; usdLow: number | null; url: string | null };

export async function getTCGPlayerPrice(name: string): Promise<TCGPlayerPrice> {
  try {
    const { data, error } = await client.api.v1.prices.tcgplayer.get({
      query: { name },
    });
    if (error || data == null) return { usdMarket: null, usdLow: null, url: null };
    return {
      usdMarket: data.usdMarket ?? null,
      usdLow: data.usdLow ?? null,
      url: data.url ?? null,
    };
  } catch {
    return { usdMarket: null, usdLow: null, url: null };
  }
}

export async function getRandomCard(): Promise<Card | null> {
  const { data, error } = await client.api.v1.cards.random.get();
  if (error) return null;
  return data;
}
