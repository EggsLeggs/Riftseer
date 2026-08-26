import { beforeEach, describe, expect, mock, test } from "bun:test";

import { emptyGuestDeck, type GuestDeck, type GuestDeckCard } from "./guest-deck.ts";

// The two server actions are the whole dependency, so they are mocked at the
// module boundary and the calls are recorded. `storage()` returns null without a
// `window`, so `clearGuestDeck()` is inert here — what these tests pin is the
// call sequence, not the blob.
const createCalls: unknown[] = [];
const applyCalls: { deckId: string; count: number }[] = [];

let createResult: { ok: true; data: { id: string; name: string } } | { ok: false; error: string } =
  { ok: true, data: { id: "created-deck", name: "Guest deck" } };
let applyResult: { ok: true; data: unknown } | { ok: false; error: string } = {
  ok: true,
  data: {},
};

mock.module("./actions.ts", () => ({
  createDeckAction: async (input: unknown) => {
    createCalls.push(input);
    return createResult;
  },
  applyDeckCardChangesAction: async (deckId: string, changes: unknown[]) => {
    applyCalls.push({ deckId, count: changes.length });
    return applyResult;
  },
}));

const { saveGuestDeck } = await import("./guest-deck-save.ts");

function deckWithACard(): GuestDeck {
  const card: GuestDeckCard = {
    zone: "main",
    oracle_id: "11111111-1111-4111-8111-111111111111",
    printing_id: "69bc5bc6d308c64675ca86b6",
    quantity: 2,
    is_champion: false,
    name: "Adaptatron",
    card_type: "Unit",
    supertype: null,
    is_token: false,
    domains: ["Calm"],
    energy: 3,
    might: 2,
    power: null,
    set_code: "OGN",
    collector_number: "042",
    rarity: "Common",
    public_slug: "ogn/042/adaptatron",
    has_hosted_image: true,
  };
  return { ...emptyGuestDeck(), name: "Guest deck", cards: [card] };
}

beforeEach(() => {
  createCalls.length = 0;
  applyCalls.length = 0;
  createResult = { ok: true, data: { id: "created-deck", name: "Guest deck" } };
  applyResult = { ok: true, data: {} };
});

describe("saveGuestDeck", () => {
  test("creates the deck then applies its cards as one batch", async () => {
    const outcome = await saveGuestDeck(deckWithACard());

    expect(outcome).toMatchObject({ ok: true, deckId: "created-deck" });
    expect(createCalls).toHaveLength(1);
    expect(applyCalls).toEqual([{ deckId: "created-deck", count: 1 }]);
  });

  test("reports the created deck when only the cards fail", async () => {
    applyResult = { ok: false, error: "cards rejected" };

    const outcome = await saveGuestDeck(deckWithACard());

    // The id is what makes the failure survivable: without it the deck row is
    // orphaned and the user has no route back to it.
    expect(outcome).toMatchObject({
      ok: false,
      error: "cards rejected",
      deckId: "created-deck",
    });
  });

  test("a retry after a cards failure reuses the deck instead of creating a second", async () => {
    applyResult = { ok: false, error: "cards rejected" };
    const deck = deckWithACard();
    const first = await saveGuestDeck(deck);
    expect(first.ok).toBe(false);
    expect(createCalls).toHaveLength(1);

    applyResult = { ok: true, data: {} };
    const retry = await saveGuestDeck(deck, first.ok ? undefined : first.deckId);

    // Retrying from the top would mint a second deck and strand the first, so
    // three clicks of "Try again" would leave three decks and populate one.
    expect(createCalls).toHaveLength(1);
    expect(retry).toMatchObject({ ok: true, deckId: "created-deck" });
    expect(applyCalls).toEqual([
      { deckId: "created-deck", count: 1 },
      { deckId: "created-deck", count: 1 },
    ]);
  });

  test("a failed create reports no deck id, because none was made", async () => {
    createResult = { ok: false, error: "nope" };

    const outcome = await saveGuestDeck(deckWithACard());

    expect(outcome).toEqual({ ok: false, error: "nope" });
    expect(applyCalls).toHaveLength(0);
  });

  test("an empty deck still creates the deck and skips the cards call", async () => {
    const outcome = await saveGuestDeck({ ...emptyGuestDeck(), name: "Empty" });

    expect(outcome).toMatchObject({ ok: true, deckId: "created-deck" });
    expect(applyCalls).toHaveLength(0);
  });
});
