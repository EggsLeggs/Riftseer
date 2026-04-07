/**
 * Deck route tests — uses Elysia's .handle() to test routes without a live server.
 * The deck provider is replaced with an in-memory stub so no real serialization
 * or card lookups happen.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import type { SimplifiedDeck, SimplifiedDeckProvider } from "@riftseer/core";
import { BadRequestError } from "@riftseer/core";
import { decksRoutes } from "../../routes/decks";

// ─── Stub data ────────────────────────────────────────────────────────────────

const STUB_DECK: SimplifiedDeck = {
  id: null,
  legendId: null,
  chosenChampionId: null,
  mainDeck: ["bf1bafdc-2739-469b-bde6-c24a868f4979:2"],
  sideboard: [],
  runes: [],
  battlegrounds: [],
};

const VALID_SHORT_FORM = "validshortform";
const UPDATED_SHORT_FORM = "updatedshortform";

// ─── Stub provider ────────────────────────────────────────────────────────────

class StubDeckProvider implements SimplifiedDeckProvider {
  async getDeckFromShortForm(shortForm: string): Promise<{ deck: SimplifiedDeck; shortForm: string }> {
    if (shortForm === VALID_SHORT_FORM) {
      return { deck: STUB_DECK, shortForm };
    }
    throw new BadRequestError(`Invalid deck short form: ${shortForm}`);
  }

  async addCards(
    cards: { id: string; quantity: number }[],
    deckShortForm?: string,
  ): Promise<{ deck: SimplifiedDeck; shortForm: string }> {
    const updatedDeck: SimplifiedDeck = {
      ...STUB_DECK,
      mainDeck: [
        ...STUB_DECK.mainDeck,
        ...cards.map((c) => `${c.id}:${c.quantity}`),
      ],
    };
    return { deck: updatedDeck, shortForm: UPDATED_SHORT_FORM };
  }

  async removeCards(
    cards: { id: string; quantity: number }[],
    deckShortForm: string,
  ): Promise<{ deck: SimplifiedDeck; shortForm: string }> {
    const idsToRemove = new Set(cards.map((c) => c.id));
    const updatedDeck: SimplifiedDeck = {
      ...STUB_DECK,
      mainDeck: STUB_DECK.mainDeck.filter(
        (entry) => !idsToRemove.has(entry.split(":")[0]),
      ),
    };
    return { deck: updatedDeck, shortForm: UPDATED_SHORT_FORM };
  }
}

// ─── App builder ──────────────────────────────────────────────────────────────

function buildTestApp(provider: SimplifiedDeckProvider) {
  return new Elysia({ prefix: "/api/v1" }).use(decksRoutes(provider)).use(swagger());
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Deck routes", () => {
  let app: ReturnType<typeof buildTestApp>;

  beforeAll(() => {
    app = buildTestApp(new StubDeckProvider());
  });

  // ── GET /decks/u/:shortForm ───────────────────────────────────────────────

  describe("GET /decks/u/:shortForm", () => {
    it("returns the deck for a valid short form", async () => {
      const res = await app.handle(
        new Request(`http://localhost/api/v1/decks/u/${VALID_SHORT_FORM}`),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.shortForm).toBe(VALID_SHORT_FORM);
      expect(Array.isArray(body.deck.mainDeck)).toBe(true);
      expect(body.deck.mainDeck).toHaveLength(1);
    });

    it("returns 400 for an invalid short form", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/decks/u/badinput"),
      );
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body.code).toBe("INVALID_SHORT_FORM");
    });
  });

  // ── POST /decks/u/:shortForm ──────────────────────────────────────────────

  describe("POST /decks/u/:shortForm", () => {
    it("returns 400 when no cardsToAdd or cardsToRemove provided", async () => {
      const res = await app.handle(
        new Request(`http://localhost/api/v1/decks/u/${VALID_SHORT_FORM}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body.code).toBe("MISSING_CARDS");
    });

    it("adds cards and returns updated deck", async () => {
      const res = await app.handle(
        new Request(`http://localhost/api/v1/decks/u/${VALID_SHORT_FORM}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardsToAdd: ["aaaaaaaa-0000-0000-0000-000000000001:1"],
          }),
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.shortForm).toBe(UPDATED_SHORT_FORM);
      expect(body.deck.mainDeck).toHaveLength(2);
    });

    it("removes cards and returns updated deck", async () => {
      const res = await app.handle(
        new Request(`http://localhost/api/v1/decks/u/${VALID_SHORT_FORM}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardsToRemove: ["bf1bafdc-2739-469b-bde6-c24a868f4979:2"],
          }),
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.shortForm).toBe(UPDATED_SHORT_FORM);
      expect(body.deck.mainDeck).toHaveLength(0);
    });

    it("returns 400 for malformed card entry", async () => {
      const res = await app.handle(
        new Request(`http://localhost/api/v1/decks/u/${VALID_SHORT_FORM}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardsToAdd: ["notavalidentry"] }),
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid short form", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/decks/u/badinput", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardsToAdd: ["bf1bafdc-2739-469b-bde6-c24a868f4979:1"] }),
        }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ── POST /decks/u ─────────────────────────────────────────────────────────

  describe("POST /decks/u", () => {
    it("creates a new deck with the provided cards", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/decks/u", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardsToAdd: ["bf1bafdc-2739-469b-bde6-c24a868f4979:2"],
          }),
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.shortForm).toBe(UPDATED_SHORT_FORM);
      expect(Array.isArray(body.deck.mainDeck)).toBe(true);
    });

    it("returns 400 when cardsToAdd is missing", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/decks/u", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body.code).toBe("MISSING_CARDS");
    });

    it("returns 400 when cardsToRemove is provided on a new deck", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/decks/u", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardsToAdd: ["bf1bafdc-2739-469b-bde6-c24a868f4979:1"],
            cardsToRemove: ["bf1bafdc-2739-469b-bde6-c24a868f4979:1"],
          }),
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body.code).toBe("INVALID_INPUT");
    });

    it("returns 400 for malformed card entry", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/v1/decks/u", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardsToAdd: ["notavalidentry"] }),
        }),
      );
      expect(res.status).toBe(400);
    });
  });
});
