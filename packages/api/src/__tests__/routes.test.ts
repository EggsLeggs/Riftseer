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
  id: "bf1bafdc-2739-469b-bde6-c24a868f4979",
  name: "Sun Disc",
  normalizedName: "sun disc",
  setCode: "OGN",
  setName: "Origins",
  collectorNumber: "21",
  imageUrl: "https://cdn.example.com/sun-disc.png",
  text: ":rb_exhaust:: Next unit ready.",
  cost: 2,
  typeLine: "Gear",
  rarity: "Uncommon",
  domains: ["Fury"],
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

  async getRandomCard(): Promise<Card | null> {
    return STUB_CARD;
  }
}

// ─── Replicate the app inline with stub provider ──────────────────────────────
// We inline a minimal copy of the app wiring so the test doesn't need to
// import the real index.ts (which calls provider.warmup() at module level).

import { parseCardRequests, getCacheMeta } from "@riftseer/core";

function buildTestApp(provider: CardDataProvider) {
  function sanitiseCard(card: Card) {
    const { raw: _raw, ...rest } = card;
    return rest;
  }

  const startTime = Date.now();

  const API_PREFIX = "/api";
  return new Elysia().group(API_PREFIX, (app) =>
    app
      .use(swagger())
      .get("/health", () => ({
        status: "ok",
        uptimeMs: Date.now() - startTime,
      }))
      .get("/meta", () => {
        return {
          provider: provider.sourceName,
          cardCount: 1,
          lastRefresh: null,
          cacheAgeSeconds: null,
          uptimeSeconds: 0,
        };
      })
      .get("/cards/:id", async ({ params, set }) => {
        const card = await provider.getCardById(params.id);
        if (!card) {
          set.status = 404;
          return { error: "Card not found", code: "NOT_FOUND" };
        }
        return sanitiseCard(card);
      })
      .get("/cards", async ({ query, set }) => {
        if (!query.name) {
          set.status = 400;
          return { error: "name required", code: "MISSING_PARAM" };
        }
        const cards = await provider.searchByName(query.name as string, {
          set: query.set as string | undefined,
          fuzzy: (query.fuzzy as string) === "1",
          limit: query.limit ? parseInt(query.limit as string, 10) : 10,
        });
        return { count: cards.length, cards: cards.map(sanitiseCard) };
      })
      .post(
        "/resolve",
        async ({ body }) => {
          const reqs = (body as { requests: string[] }).requests
            .slice(0, 20)
            .map((r) => {
              const parsed = parseCardRequests(`[[${r}]]`);
              return parsed[0] ?? { raw: r, name: r };
            });
          const results = await Promise.all(
            reqs.map((req) => provider.resolveRequest(req)),
          );
          return {
            count: results.length,
            results: results.map((r) => ({
              ...r,
              card: r.card ? sanitiseCard(r.card) : null,
            })),
          };
        },
        { body: t.Object({ requests: t.Array(t.String()) }) },
      ),
  );
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
      const res = await app.handle(new Request("http://localhost/api/health"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(typeof body.uptimeMs).toBe("number");
    });
  });

  // ── /meta ──────────────────────────────────────────────────────────────────

  describe("GET /meta", () => {
    it("returns provider name", async () => {
      const res = await app.handle(new Request("http://localhost/api/meta"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.provider).toBe("stub");
    });
  });

  // ── GET /cards/:id ─────────────────────────────────────────────────────────

  describe("GET /cards/:id", () => {
    it("returns the card for a known ID", async () => {
      const res = await app.handle(
        new Request(`http://localhost/api/cards/${STUB_CARD.id}`),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("Sun Disc");
      expect(body.raw).toBeUndefined(); // raw field stripped
    });

    it("returns 404 for unknown ID", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/cards/unknown-id"),
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("NOT_FOUND");
    });
  });

  // ── GET /cards ─────────────────────────────────────────────────────────────

  describe("GET /cards", () => {
    it("returns matching cards for a name query", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/cards?name=Sun"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.count).toBe(1);
      expect(body.cards[0].name).toBe("Sun Disc");
    });

    it("returns 400 when name is missing", async () => {
      const res = await app.handle(new Request("http://localhost/api/cards"));
      expect(res.status).toBe(400);
    });

    it("returns empty array for unknown name", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/cards?name=zzzzz"),
      );
      const body = await res.json();
      expect(body.count).toBe(0);
    });
  });

  // ── POST /resolve ──────────────────────────────────────────────────────────

  describe("POST /resolve", () => {
    it("resolves known cards", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: ["Sun Disc"] }),
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.count).toBe(1);
      expect(body.results[0].matchType).toBe("exact");
      expect(body.results[0].card.name).toBe("Sun Disc");
    });

    it("returns not-found for unknown cards", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: ["Nonexistent Card"] }),
        }),
      );
      const body = await res.json();
      expect(body.results[0].matchType).toBe("not-found");
      expect(body.results[0].card).toBeNull();
    });

    it("handles batch requests", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: ["Sun Disc", "Missing Card"] }),
        }),
      );
      const body = await res.json();
      expect(body.count).toBe(2);
    });

    it("caps at 20 requests", async () => {
      const requests = Array.from({ length: 25 }, (_, i) => `Card ${i}`);
      const res = await app.handle(
        new Request("http://localhost/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
        }),
      );
      const body = await res.json();
      expect(body.count).toBe(20);
    });

    it("accepts [[Name|SET]] format in requests", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: ["Sun Disc|OGN"] }),
        }),
      );
      const body = await res.json();
      expect(body.results[0].request.name).toBe("Sun Disc");
      expect(body.results[0].request.set).toBe("OGN");
    });
  });
});
