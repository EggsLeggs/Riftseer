/**
 * API route tests — uses Elysia's .handle() to test routes without a live server.
 * The provider is replaced with an in-memory stub so no real DB or network
 * calls happen.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { Elysia } from "elysia";
import type {
  CardDataProvider,
} from "@riftseer/core";

// ─── Stub provider ────────────────────────────────────────────────────────────



// ─── Replicate the app inline with stub provider ──────────────────────────────
// We inline a minimal copy of the app wiring so the test doesn't need to
// import the real index.ts (which calls provider.warmup() at module level).

import { cardsRoutes } from "../../routes/cards";
import { STUB_CARD, StubProvider } from "../stub_card_provider";

function buildTestApp(provider: CardDataProvider) {
  return new Elysia({ prefix: "/api/v1" }).use(cardsRoutes(provider));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("API routes", () => {
  let app: ReturnType<typeof buildTestApp>;

  beforeAll(() => {
    app = buildTestApp(new StubProvider());
  });

  // ── GET /cards/:id ─────────────────────────────────────────────────────────

  describe("GET /cards/:id", () => {
    it("returns the card for a known ID", async () => {
      const res = await app.handle(
        new Request(`http://localhost/api/v1/cards/${STUB_CARD.id}`),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.name).toBe("Sun Disc");
      expect(body.object).toBe("card");
      expect(body.set.set_code).toBe("OGN");
      expect(body.raw).toBeUndefined(); // no raw field in Card
      expect(Array.isArray(body.related_champions)).toBe(true);
      expect(body.related_champions).toHaveLength(1);
      expect(body.related_champions[0].object).toBe("related_card");
      expect(body.related_champions[0].id).toBe("aaaaaaaa-0000-0000-0000-000000000001");
      expect(body.related_champions[0].component).toBe("champion");
      expect(Array.isArray(body.related_legends)).toBe(true);
      expect(body.related_legends).toHaveLength(0);
    });

    it("returns 404 for unknown ID", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/cards/unknown-id"),
      );
      expect(res.status).toBe(404);
      const body = await res.json() as any;
      expect(body.code).toBe("NOT_FOUND");
    });
  });

  // ── GET /cards ─────────────────────────────────────────────────────────────

  describe("GET /cards", () => {
    it("returns matching cards for a name query", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/cards?name=Sun"),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.count).toBe(1);
      expect(body.cards[0].name).toBe("Sun Disc");
      expect(body.cards[0].set.set_code).toBe("OGN");
      expect(Array.isArray(body.cards[0].related_champions)).toBe(true);
      expect(body.cards[0].related_champions[0].object).toBe("related_card");
      expect(Array.isArray(body.cards[0].related_legends)).toBe(true);
    });

    it("returns 400 when name is missing", async () => {
      const res = await app.handle(new Request("http://localhost/api/v1/cards"));
      expect(res.status).toBe(400);
    });

    it("returns empty array for unknown name", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/cards?name=zzzzz"),
      );
      const body = await res.json() as any;
      expect(body.count).toBe(0);
    });

    // ── Exact lookup via ?fuzzy=false ──────────────────────────────────────────

    it("exact mode (fuzzy=false) returns card when name matches exactly", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/cards?name=Sun+Disc&fuzzy=false"),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.count).toBe(1);
      expect(body.cards[0].name).toBe("Sun Disc");
    });

    it("exact mode (fuzzy=false) returns empty for a non-existent card name", async () => {
      // The stub returns [] for exact mode on unknown names — this is the
      // canonical "not found" signal for exact card lookup via the search endpoint.
      const res = await app.handle(
        new Request("http://localhost/api/v1/cards?name=Nonexistent+Card&fuzzy=false"),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.count).toBe(0);
    });

    it("autocomplete mode (default) matches partial names", async () => {
      // "Sunshine" contains "sun" → stub returns the card in autocomplete mode
      const res = await app.handle(
        new Request("http://localhost/api/v1/cards?name=Sunshine"),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.count).toBe(1);
    });
  });

  // ── GET /cards/random ─────────────────────────────────────────────────────

  describe("GET /cards/random", () => {
    it("returns a card", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/cards/random"),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.name).toBe("Sun Disc");
      expect(body.object).toBe("card");
      expect(body.set.set_code).toBe("OGN");
      expect(Array.isArray(body.related_champions)).toBe(true);
      expect(Array.isArray(body.related_legends)).toBe(true);
    });
  });

  // ── GET /cards/:id/text ────────────────────────────────────────────────────

  describe("GET /cards/:id/text", () => {
    it("returns plain text for a known card", async () => {
      const res = await app.handle(
        new Request(`http://localhost/api/v1/cards/${STUB_CARD.id}/text`),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");
      const body = await res.text();
      expect(body).toContain("Sun Disc");
    });

    it("returns 404 for unknown ID", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/cards/unknown-id/text"),
      );
      expect(res.status).toBe(404);
      const body = await res.json() as any;
      expect(body.code).toBe("NOT_FOUND");
    });
  });

  // ── POST /cards/resolve ───────────────────────────────────────────────────

  describe("POST /cards/resolve", () => {
    it("resolves known cards", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/cards/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: ["Sun Disc"] }),
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.count).toBe(1);
      expect(body.results[0].matchType).toBe("exact");
      expect(body.results[0].card.name).toBe("Sun Disc");
      expect(body.results[0].card.object).toBe("card");
      expect(Array.isArray(body.results[0].card.related_champions)).toBe(true);
      expect(body.results[0].card.related_champions[0].object).toBe("related_card");
      expect(Array.isArray(body.results[0].card.related_legends)).toBe(true);
    });

    it("nonexistent exact card lookup returns not-found with null card", async () => {
      // /cards/resolve is the exact-lookup endpoint used by bots.
      // A missing card returns matchType "not-found" and a null card — the
      // caller (bot, frontend) should treat this as a 404-equivalent.
      const res = await app.handle(
        new Request("http://localhost/api/v1/cards/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: ["Nonexistent Card"] }),
        }),
      );
      expect(res.status).toBe(200); // envelope is always 200
      const body = await res.json() as any;
      expect(body.results[0].matchType).toBe("not-found");
      expect(body.results[0].card).toBeNull();
    });

    it("handles batch requests", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/cards/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: ["Sun Disc", "Missing Card"] }),
        }),
      );
      const body = await res.json() as any;
      expect(body.count).toBe(2);
    });

    it("caps at 20 requests", async () => {
      const requests = Array.from({ length: 25 }, (_, i) => `Card ${i}`);
      const res = await app.handle(
        new Request("http://localhost/api/v1/cards/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests }),
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body.error).toBe("Too many requests: maximum is 20");
      expect(body.code).toBe("TOO_MANY_REQUESTS");
    });

    it("accepts [[Name|SET]] format in requests", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/cards/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: ["Sun Disc|OGN"] }),
        }),
      );
      const body = await res.json() as any;
      expect(body.results[0].request.name).toBe("Sun Disc");
      expect(body.results[0].request.set).toBe("OGN");
    });
  });
});
