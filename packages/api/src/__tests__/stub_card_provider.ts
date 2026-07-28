import {
  parseCardSearchQuery,
  type Card,
  type CardDataProvider,
  type CardRequest,
  type CardSearchAst,
  type CardSearchOptions,
  type CardSearchResult,
  type ResolvedCard,
} from "@riftseer/core";

export const STUB_PRINTING_ID = "bf1bafdc-2739-469b-bde6-c24a868f4980";
export const STUB_TOKEN_ID = "cccccccc-0000-0000-0000-000000000001";
export const STUB_CHAMPION_ID = "aaaaaaaa-0000-0000-0000-000000000001";
export const STUB_SIGNATURE_ID = "dddddddd-0000-0000-0000-000000000001";

export const STUB_CARD: Card = {
  object: "card",
  id: "bf1bafdc-2739-469b-bde6-c24a868f4979",
  name: "Sun Disc",
  name_normalized: "sun disc",
  collector_number: "21",
  external_ids: {
    riftcodex_id: "bf1bafdc-2739-469b-bde6-c24a868f4979",
    tcgplayer_id: "123456",
  },
  set: { set_code: "OGN", set_name: "Origins", published_on: "2025-01-01" },
  attributes: { energy: 2, might: null, power: 1 },
  classification: { type: "Gear", supertype: null, rarity: "Uncommon", domains: ["Fury"] },
  text: { plain: ":rb_exhaust:: Next unit ready. Create a Sprite Token." },
  artist: "Envar Studio",
  media: {
    orientation: "portrait",
    media_urls: { normal: "https://cdn.example.com/sun-disc.png" },
  },
  metadata: { alternate_art: false, overnumbered: false, signature: false },
  prices: { tcgplayer: { normal: 1.25, foil: 4.5 } },
  is_token: false,
  all_parts: [
    {
      object: "related_card",
      id: STUB_TOKEN_ID,
      name: "Sprite",
      component: "token",
      uri: `/api/v1/cards/${STUB_TOKEN_ID}`,
    },
  ],
  used_by: [],
  related_champions: [
    {
      object: "related_card",
      id: STUB_CHAMPION_ID,
      name: "Sun Disc, Champion",
      component: "champion",
      uri: `/api/v1/cards/${STUB_CHAMPION_ID}`,
    },
  ],
  related_legends: [],
  related_signatures: [
    {
      object: "related_card",
      id: STUB_SIGNATURE_ID,
      name: "Sun Disc, Signature",
      component: "signature",
      uri: `/api/v1/cards/${STUB_SIGNATURE_ID}`,
    },
  ],
  related_printings: [
    {
      object: "related_card",
      id: STUB_PRINTING_ID,
      name: "Sun Disc",
      component: "printing",
      uri: `/api/v1/cards/${STUB_PRINTING_ID}`,
    },
  ],
  public_slug: "ogn/21/sun-disc",
};

/** Alternate-art reprint of {@link STUB_CARD}. */
const STUB_PRINTING: Card = {
  ...STUB_CARD,
  id: STUB_PRINTING_ID,
  collector_number: "22",
  metadata: { alternate_art: true, overnumbered: false, signature: false },
  prices: { tcgplayer: { normal: 9.99 } },
  all_parts: [],
  related_champions: [],
  related_printings: [
    {
      object: "related_card",
      id: STUB_CARD.id,
      name: STUB_CARD.name,
      component: "printing",
      uri: `/api/v1/cards/${STUB_CARD.id}`,
    },
  ],
  public_slug: "ogn/22a/sun-disc",
};

const STUB_TOKEN: Card = {
  object: "card",
  id: STUB_TOKEN_ID,
  name: "Sprite",
  name_normalized: "sprite",
  set: { set_code: "OGN", set_name: "Origins", published_on: "2025-01-01" },
  classification: { type: "Unit", supertype: "Token", rarity: "Common" },
  is_token: true,
  all_parts: [],
  used_by: [
    {
      object: "related_card",
      id: STUB_CARD.id,
      name: STUB_CARD.name,
      component: "token_of",
      uri: `/api/v1/cards/${STUB_CARD.id}`,
    },
  ],
  related_champions: [],
  related_legends: [],
  related_signatures: [],
  related_printings: [],
  public_slug: "ogn/t1/sprite",
};

/** Deliberately has no public_slug so riftseer_uri hydration stays untested here. */
const STUB_CHAMPION: Card = {
  object: "card",
  id: STUB_CHAMPION_ID,
  name: "Sun Disc, Champion",
  name_normalized: "sun disc champion",
  collector_number: "5",
  set: { set_code: "OGN", set_name: "Origins", published_on: "2025-01-01" },
  classification: { type: "Unit", supertype: "Champion", rarity: "Rare" },
  is_token: false,
  all_parts: [],
  used_by: [],
  related_champions: [],
  related_legends: [],
  related_signatures: [],
  related_printings: [],
};

/** Signature card tied to {@link STUB_CARD} via related_signatures. */
const STUB_SIGNATURE: Card = {
  object: "card",
  id: STUB_SIGNATURE_ID,
  name: "Sun Disc, Signature",
  name_normalized: "sun disc signature",
  collector_number: "21",
  set: { set_code: "OGN", set_name: "Origins", published_on: "2025-01-01" },
  classification: { type: "Spell", supertype: "Signature", rarity: "Rare" },
  metadata: { alternate_art: false, overnumbered: false, signature: true },
  is_token: false,
  all_parts: [],
  used_by: [],
  related_champions: [],
  related_legends: [],
  related_signatures: [],
  related_printings: [],
  public_slug: "ogn/21/signature/sun-disc",
};

const STUB_CARDS: Card[] = Array.from({ length: 5 }, (_, i) => ({
  ...STUB_CARD,
  id: `bf1bafdc-2739-469b-bde6-c24a868f49${70 + i}`,
  collector_number: String(21 + i),
}));

const CARDS_BY_ID = new Map<string, Card>(
  [STUB_CARD, STUB_PRINTING, STUB_TOKEN, STUB_CHAMPION, STUB_SIGNATURE].map(
    (c) => [c.id, c],
  ),
);

export class StubProvider implements CardDataProvider {
  readonly sourceName = "stub";

  async warmup() {}
  async refresh() {}

  async getCardById(id: string): Promise<Card | null> {
    return CARDS_BY_ID.get(id) ?? null;
  }

  async getCardByPublicSlug(slug: string): Promise<Card | null> {
    for (const card of CARDS_BY_ID.values()) {
      if (card.public_slug === slug) return card;
    }
    return null;
  }

  async getPublicSlugsByIds(ids: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const id of ids) {
      const slug = CARDS_BY_ID.get(id)?.public_slug;
      if (slug) result.set(id, slug);
    }
    return result;
  }

  async getCardsByIds(ids: string[]): Promise<Card[]> {
    return ids.flatMap((id) => {
      const card = CARDS_BY_ID.get(id);
      return card ? [card] : [];
    });
  }

  async searchByName(q: string, opts?: CardSearchOptions): Promise<CardSearchResult> {
    const { ast } = parseCardSearchQuery(q);
    if (!ast) return { cards: [], total: 0 };
    return this.searchByAst(ast, opts);
  }

  async searchByAst(ast: CardSearchAst, opts?: CardSearchOptions): Promise<CardSearchResult> {
    const matches = matchAst(STUB_CARD, ast) ? [STUB_CARD] : [];
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

  async browseCards(opts: { limit: number; offset: number }): Promise<{ cards: Card[]; total: number }> {
    const total = STUB_CARDS.length;
    const start = opts.offset;
    const end = opts.offset + opts.limit;
    return { cards: STUB_CARDS.slice(start, end), total };
  }

  getStats() {
    return { lastRefresh: 0, cardCount: 1 };
  }
}

/**
 * Tiny in-memory AST evaluator covering every leaf type the parser produces.
 * Keeps the stub provider faithful to the production semantics so API-route
 * tests can exercise the new query language without hitting Postgres.
 */
function matchAst(card: Card, ast: CardSearchAst): boolean {
  switch (ast.op) {
    case "and":
      return ast.children.every((c) => matchAst(card, c));
    case "or":
      return ast.children.some((c) => matchAst(card, c));
    case "not":
      return !matchAst(card, ast.child);
    case "text": {
      const needle = ast.value.toLowerCase();
      return card.name.toLowerCase().includes(needle);
    }
    case "exact_name":
      return card.name_normalized === ast.value;
    case "filter": {
      const needle = ast.value.toLowerCase();
      switch (ast.field) {
        case "type": {
          const haystacks = [
            card.classification?.type ?? "",
            card.classification?.supertype ?? "",
            ...(card.classification?.tags ?? []),
          ];
          return haystacks.some((h) => h.toLowerCase().includes(needle));
        }
        case "rarity":
          return (card.classification?.rarity ?? "")
            .toLowerCase()
            .includes(needle);
        case "artist":
          return (card.artist ?? "").toLowerCase().includes(needle);
        default:
          return false;
      }
    }
    default: {
      const unreachable: never = ast;
      throw new Error(
        `Unsupported card search AST op in stub provider: ${
          (unreachable as { op?: string }).op ?? "unknown"
        }`,
      );
    }
  }
}