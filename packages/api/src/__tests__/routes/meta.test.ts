/**
 * API route tests — uses Elysia's .handle() to test routes without a live server.
 * The provider is replaced with an in-memory stub so no real DB or network
 * calls happen.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { Elysia, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import type {
  CardDataProvider,
  Card,
  CardRequest,
  ResolvedCard,
  CardSearchOptions,
} from "@riftseer/core";

// ─── Stub provider ────────────────────────────────────────────────────────────

const STUB_CARD: Card = {
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
};

class StubProvider implements CardDataProvider {
  readonly sourceName = "stub";

  async warmup() {}
  async refresh() {}

  async getCardById(id: string): Promise<Card | null> {
    return id === STUB_CARD.id ? STUB_CARD : null;
  }

  async searchByName(q: string, _opts?: CardSearchOptions): Promise<Card[]> {
    if (q.toLowerCase().includes("sun")) return [STUB_CARD];
    return [];
  }

  async resolveRequest(req: CardRequest): Promise<ResolvedCard> {
    if (req.name.toLowerCase() === "sun disc") {
      return { request: req, card: STUB_CARD, matchType: "exact" };
    }
    return { request: req, card: null, matchType: "not-found" };
  }

  async getSets(): Promise<
    Array<{ setCode: string; setName: string; cardCount: number }>
  > {
    return [{ setCode: "OGN", setName: "Origins", cardCount: 1 }];
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

// ─── Replicate the app inline with stub provider ──────────────────────────────
// We inline a minimal copy of the app wiring so the test doesn't need to
// import the real index.ts (which calls provider.warmup() at module level).

import { metaRoutes } from "../../routes/meta";

function buildTestApp(provider: CardDataProvider) {
  const startTime = Date.now();

  return new Elysia({prefix: "/api/v1"}).use(metaRoutes(provider, startTime)).use(swagger());
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("API routes", () => {
  let app: ReturnType<typeof buildTestApp>;

  beforeAll(() => {
    app = buildTestApp(new StubProvider());
  });

    // ── /health ────────────────────────────────────────────────────────────────

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const res = await app.handle(new Request("http://localhost/api/v1/health"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(typeof body.uptimeMs).toBe("number");
    });
  });

  // ── /meta ──────────────────────────────────────────────────────────────────

  describe("GET /meta", () => {
    it("returns provider name", async () => {
      const res = await app.handle(new Request("http://localhost/api/v1/meta"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.provider).toBe("stub");
    });
  });

});
