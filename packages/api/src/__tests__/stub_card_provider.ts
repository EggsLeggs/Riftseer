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

  async browseCards(_opts: { limit: number; offset: number }): Promise<{ cards: Card[]; total: number }> {
    return { cards: [STUB_CARD], total: 1 };
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