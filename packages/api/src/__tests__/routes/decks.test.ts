import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("../../lib/supabase", () => ({
  supabaseUrl: "http://localhost",
  supabaseAnonKey: "test-key",
  authClient: {
    auth: {
      getUser: async (token: string) => token === "test-token"
        ? { data: { user: { id: "test-user-id" } }, error: null }
        : { data: { user: null }, error: null },
    },
  },
}));

import { BadRequestError, type SimplifiedDeck, type SimplifiedDeckProvider } from "@riftseer/core";
import { Elysia } from "elysia";
import { decksRoutes } from "../../routes/decks";

const baseDeck: SimplifiedDeck = {
  id: null,
  legendId: null,
  chosenChampionId: null,
  mainDeck: ["bf1bafdc-2739-469b-bde6-c24a868f4979:2"],
  sideboard: [],
  runes: [],
  battlegrounds: [],
};

class StubDeckProvider implements SimplifiedDeckProvider {
  async getDeckFromShortForm(shortForm: string) {
    if (shortForm !== "valid") throw new BadRequestError("invalid");
    return { deck: baseDeck, shortForm };
  }
  async addCards(cards: { id: string; quantity: number }[], deckShortForm?: string) {
    return {
      deck: { ...baseDeck, mainDeck: [...baseDeck.mainDeck, ...cards.map(({ id, quantity }) => `${id}:${quantity}`)] },
      shortForm: deckShortForm ? "updated" : "created",
    };
  }
  async removeCards(cards: { id: string; quantity: number }[], _deckShortForm: string) {
    const removed = new Set(cards.map(({ id }) => id));
    return { deck: { ...baseDeck, mainDeck: baseDeck.mainDeck.filter((entry) => !removed.has(entry.split(":")[0])) }, shortForm: "updated" };
  }
}

function buildTestApp() {
  return new Elysia({ prefix: "/api/v1" }).use(decksRoutes(new StubDeckProvider()));
}

describe("deck routes", () => {
  let app: ReturnType<typeof buildTestApp>;
  const auth = { Authorization: "Bearer test-token", "Content-Type": "application/json" };

  beforeAll(() => { app = buildTestApp(); });

  test("reads a valid deck and maps a bad short form to 400", async () => {
    const valid = await app.handle(new Request("http://localhost/api/v1/decks/u/valid"));
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({ shortForm: "valid", deck: { mainDeck: baseDeck.mainDeck } });
    expect((await app.handle(new Request("http://localhost/api/v1/decks/u/bad"))).status).toBe(400);
  });

  test("all mutations share the bearer-token gate", async () => {
    for (const url of ["http://localhost/api/v1/decks/u", "http://localhost/api/v1/decks/u/valid"]) {
      expect((await app.handle(new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }))).status).toBe(401);
      expect((await app.handle(new Request(url, { method: "POST", headers: { ...auth, Authorization: "Bearer wrong" }, body: "{}" }))).status).toBe(401);
    }
  });

  test("creates a deck from cards", async () => {
    const response = await app.handle(new Request("http://localhost/api/v1/decks/u", {
      method: "POST", headers: auth, body: JSON.stringify({ cardsToAdd: ["new-card:2"] }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ shortForm: "created", deck: { mainDeck: [baseDeck.mainDeck[0], "new-card:2"] } });
  });

  test("updates an existing deck with additions or removals", async () => {
    const add = await app.handle(new Request("http://localhost/api/v1/decks/u/valid", {
      method: "POST", headers: auth, body: JSON.stringify({ cardsToAdd: ["new-card:1"] }),
    }));
    expect(await add.json()).toMatchObject({ shortForm: "updated", deck: { mainDeck: [baseDeck.mainDeck[0], "new-card:1"] } });
    const remove = await app.handle(new Request("http://localhost/api/v1/decks/u/valid", {
      method: "POST", headers: auth, body: JSON.stringify({ cardsToRemove: [baseDeck.mainDeck[0]] }),
    }));
    expect(await remove.json()).toMatchObject({ shortForm: "updated", deck: { mainDeck: [] } });
  });

  test("requires the operation appropriate to new and existing decks", async () => {
    const requests = [
      new Request("http://localhost/api/v1/decks/u", { method: "POST", headers: auth, body: JSON.stringify({ cardsToRemove: ["card:1"] }) }),
      new Request("http://localhost/api/v1/decks/u/valid", { method: "POST", headers: auth, body: "{}" }),
    ];
    for (const request of requests) expect((await app.handle(request)).status).toBe(400);
  });

  test("rejects malformed card quantities at the route boundary", async () => {
    for (const url of ["http://localhost/api/v1/decks/u", "http://localhost/api/v1/decks/u/valid"]) {
      const response = await app.handle(new Request(url, { method: "POST", headers: auth, body: JSON.stringify({ cardsToAdd: ["not-an-entry"] }) }));
      expect(response.status).toBe(400);
    }
  });
});
