export interface Card {
  id: string;
  name: string;
  normalizedName: string;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  imageUrl?: string;
  text?: string;
  cost?: number;
  typeLine?: string;
  supertype?: string | null;
  rarity?: string;
  domains?: string[];
  might?: number | null;
  power?: number | null;
  tags?: string[];
  artist?: string;
}

export interface CardSet {
  setCode: string;
  setName: string;
  cardCount: number;
}

export async function getCard(id: string): Promise<Card | null> {
  const res = await fetch(`/cards/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return res.json();
}

export async function searchCards(
  name: string,
  opts: { limit?: number; set?: string; fuzzy?: boolean } = {}
): Promise<{ count: number; cards: Card[] }> {
  const params = new URLSearchParams({ name });
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.set) params.set("set", opts.set);
  if (opts.fuzzy) params.set("fuzzy", "1");
  const res = await fetch(`/cards?${params}`);
  if (!res.ok) return { count: 0, cards: [] };
  return res.json();
}

export async function getSets(): Promise<{ count: number; sets: CardSet[] }> {
  const res = await fetch("/sets");
  if (!res.ok) return { count: 0, sets: [] };
  return res.json();
}

export async function getRandomCard(): Promise<Card | null> {
  const res = await fetch("/cards/random");
  if (!res.ok) return null;
  return res.json();
}
