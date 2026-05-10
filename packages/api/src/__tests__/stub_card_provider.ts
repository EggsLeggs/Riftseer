import { Card, CardDataProvider, CardRequest, CardSearchOptions, CardSearchResult, ResolvedCard } from "@riftseer/core";

export const STUB_CARD: Card = {
  object: "card",
  id: "bf1bafdc-2739-469b-bde6-c24a868f4979",
  name: "Sun Disc",
  name_normalized: "sun disc",
  collector_number: "21",
  external_ids: { riftcodex_id: "bf1bafdc-2739-469b-bde6-c24a868f4979" },
  set: { set_code: "OGN", set_name: "Origins" },
  attributes: { energy: 2, might: null, power: 1 },
  classification: { type: "Gear", supertype: null, rarity: "Uncommon", domains: ["Fury"] },
  text: { plain: ":rb_exhaust:: Next unit ready." },
  artist: "Envar Studio",
  media: {
    orientation: "portrait",
    media_urls: { normal: "https://cdn.example.com/sun-disc.png" },
  },
  metadata: { alternate_art: false, overnumbered: false, signature: false },
  is_token: false,
  all_parts: [],
  used_by: [],
  related_champions: [
    {
      object: "related_card",
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      name: "Sun Disc, Champion",
      component: "champion",
      uri: "/api/v1/cards/aaaaaaaa-0000-0000-0000-000000000001",
    },
  ],
  related_legends: [],
  related_printings: [],
  public_slug: "ogn/21/sun-disc",
};

export class StubProvider implements CardDataProvider {
  readonly sourceName = "stub";

  async warmup() {}
  async refresh() {}

  async getCardById(id: string): Promise<Card | null> {
    return id === STUB_CARD.id ? STUB_CARD : null;
  }

  async getCardByPublicSlug(slug: string): Promise<Card | null> {
    return slug === STUB_CARD.public_slug ? STUB_CARD : null;
  }

  async getPublicSlugsByIds(ids: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const id of ids) {
      if (id === STUB_CARD.id && STUB_CARD.public_slug) {
        result.set(id, STUB_CARD.public_slug);
      }
    }
    return result;
  }

  async searchByName(q: string, opts?: CardSearchOptions): Promise<CardSearchResult> {
    const matches = q.toLowerCase().includes("sun") ? [STUB_CARD] : [];
    const offset = Math.max(0, Math.floor(opts?.offset ?? 0));
    const limit = Math.min(Math.max(Math.floor(Number(opts?.limit ?? 10)), 1), 100);
    const total = matches.length;
    const page = matches.slice(offset, offset + limit);
    return { cards: page, total };
  }

  async resolveRequest(req: CardRequest): Promise<ResolvedCard> {
    if (req.name.toLowerCase() === "sun disc") {
      return { request: req, card: STUB_CARD, matchType: "exact" };
    }
    return { request: req, card: null, matchType: "not-found" };
  }

  async getSets(): Promise<
    Array<{ setCode: string; setName: string; cardCount: number; isPromo: boolean; publishedOn: string | null }>
  > {
    return [{ setCode: "OGN", setName: "Origins", cardCount: 1, isPromo: false, publishedOn: null }];
  }

  async getCardsBySet(
    setCode: string,
    _opts?: { limit?: number }
  ): Promise<Card[]> {
    return setCode === "OGN" ? [STUB_CARD] : [];
  }

  async getRandomCard(): Promise<Card | null> {
    return STUB_CARD;
  }

  getStats() {
    return { lastRefresh: 0, cardCount: 1 };
  }
}