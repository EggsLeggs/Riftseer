import { describe, it, expect } from "bun:test";
import { SimplifiedDeckProviderImpl } from "../providers/simplified_deck_provider.ts";
import { DeckSerializerV1 } from "../serialiser.ts";
import { Card, CardDomain, CardSupertype, CardType, RelatedCard } from "../types.ts";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<Card> & { id: string; name: string }): Card {
  return {
    object: "card",
    name_normalized: overrides.name.toLowerCase(),
    is_token: false,
    all_parts: [],
    used_by: [],
    related_champions: [],
    related_legends: [],
    ...overrides,
  };
}

function relatedCard(id: string, name: string): RelatedCard {
  return { object: "related_card", id, name, component: "champion" };
}

function makeLegend(id: string, domains: CardDomain[], relatedChampions: RelatedCard[] = []): Card {
  return makeCard({
    id,
    name: `Legend ${id}`,
    classification: { type: CardType.Legend, domains },
    related_champions: relatedChampions,
  });
}

function makeChampion(id: string, domains: CardDomain[]): Card {
  return makeCard({
    id,
    name: `Champion ${id}`,
    classification: { supertype: CardSupertype.Champion, domains },
  });
}

function makeUnit(id: string, domains: CardDomain[] = []): Card {
  return makeCard({
    id,
    name: `Unit ${id}`,
    classification: { type: CardType.Unit, domains },
  });
}

function makeRune(id: string, domains: CardDomain[] = []): Card {
  return makeCard({
    id,
    name: `Rune ${id}`,
    classification: { type: CardType.Rune, domains },
  });
}

function makeBattleField(id: string): Card {
  return makeCard({
    id,
    name: `Battleground ${id}`,
    classification: { type: CardType.Battlefield },
  });
}

function buildLookup(...cards: Card[]): (id: string) => Promise<Card> {
  const map = new Map(cards.map(c => [c.id, c]));
  return async (id: string) => {
    const card = map.get(id);
    if (!card) throw new Error(`Card not found: ${id}`);
    return card;
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SimplifieDeckProvider", () => {
  const serialiser = new DeckSerializerV1();

  const legend = makeLegend("l1", [CardDomain.Fury], [relatedCard("c1", "Champion c1")]);
  const champion = makeChampion("c1", [CardDomain.Fury]);
  const unit1 = makeUnit("u1", [CardDomain.Fury]);
  const unit2 = makeUnit("u2", [CardDomain.Fury]);
  const rune = makeRune("r1", [CardDomain.Fury]);
  const bg = makeBattleField("b1");

  const lookup = buildLookup(legend, champion, unit1, unit2, rune, bg);
  const provider = new SimplifiedDeckProviderImpl(serialiser, lookup);

  // ── addCards ─────────────────────────────────────────────────────────────────

  describe("addCards", () => {
    it("creates a new deck when no shortForm is provided", async () => {
      const { deck } = await provider.addCards([{ id: "l1", quantity: 1 }]);
      expect(deck.legendId).toBe("l1");
    });

    it("returns a serializable shortForm", async () => {
      const { shortForm } = await provider.addCards([{ id: "l1", quantity: 1 }]);
      expect(typeof shortForm).toBe("string");
      expect(shortForm.length).toBeGreaterThan(0);
    });

    it("adds multiple cards to a new deck", async () => {
      const { deck } = await provider.addCards([
        { id: "l1", quantity: 1 },
        { id: "u1", quantity: 2 },
      ]);
      expect(deck.legendId).toBe("l1");
      expect(deck.mainDeck).toContain("u1:2");
    });

    it("adds cards to an existing deck given a shortForm", async () => {
      const { shortForm } = await provider.addCards([
        { id: "l1", quantity: 1 },
        { id: "u1", quantity: 2 },
      ]);
      const { deck } = await provider.addCards([{ id: "u2", quantity: 1 }], shortForm);
      expect(deck.mainDeck).toContain("u1:2");
      expect(deck.mainDeck).toContain("u2:1");
    });

    it("sets chosenChampionId when the legend's related champion is added", async () => {
      const { deck } = await provider.addCards([
        { id: "l1", quantity: 1 },
        { id: "c1", quantity: 1 },
      ]);
      expect(deck.chosenChampionId).toBe("c1");
    });

    it("round-trips the shortForm through serialize/deserialize", async () => {
      const { shortForm, deck } = await provider.addCards([
        { id: "l1", quantity: 1 },
        { id: "u1", quantity: 3 },
      ]);
      const { deck: restored } = await provider.getDeckFromShortForm(shortForm);
      expect(restored.legendId).toBe(deck.legendId);
      expect(restored.mainDeck).toEqual(deck.mainDeck);
    });
  });

  // ── removeCards ──────────────────────────────────────────────────────────────

  describe("removeCards", () => {
    it("removes a card from the deck", async () => {
      const { shortForm } = await provider.addCards([
        { id: "l1", quantity: 1 },
        { id: "u1", quantity: 2 },
      ]);
      const { deck } = await provider.removeCards([{ id: "u1", quantity: 1 }], shortForm);
      expect(deck.mainDeck).toContain("u1:1");
    });

    it("removes a card entirely when all copies are removed", async () => {
      const { shortForm } = await provider.addCards([
        { id: "l1", quantity: 1 },
        { id: "u1", quantity: 2 },
      ]);
      const { deck } = await provider.removeCards([{ id: "u1", quantity: 2 }], shortForm);
      expect(deck.mainDeck.some(e => e.startsWith("u1:"))).toBe(false);
    });

    it("removes the legend and clears the deck", async () => {
      const { shortForm } = await provider.addCards([
        { id: "l1", quantity: 1 },
        { id: "u1", quantity: 1 },
      ]);
      const { deck } = await provider.removeCards([{ id: "l1", quantity: 1 }], shortForm);
      expect(deck.legendId).toBeNull();
      expect(deck.mainDeck).toHaveLength(0);
    });

    it("returns an updated shortForm that reflects the removal", async () => {
      const { shortForm: initial } = await provider.addCards([
        { id: "l1", quantity: 1 },
        { id: "u1", quantity: 2 },
      ]);
      const { shortForm: updated } = await provider.removeCards([{ id: "u1", quantity: 2 }], initial);
      // The updated shortForm should deserialize without u1
      const { deck } = await provider.getDeckFromShortForm(updated);
      expect(deck.mainDeck.some(e => e.startsWith("u1:"))).toBe(false);
    });

    it("throws when trying to remove a card not in the deck", async () => {
      const { shortForm } = await provider.addCards([{ id: "l1", quantity: 1 }]);
      await expect(provider.removeCards([{ id: "u2", quantity: 1 }], shortForm)).rejects.toThrow();
    });
  });

  // ── getDeckFromShortForm ──────────────────────────────────────────────────────

  describe("getDeckFromShortForm", () => {
    it("returns the deck matching the shortForm", async () => {
      const { shortForm } = await provider.addCards([
        { id: "l1", quantity: 1 },
        { id: "u1", quantity: 2 },
      ]);
      const { deck } = await provider.getDeckFromShortForm(shortForm);
      expect(deck.legendId).toBe("l1");
      expect(deck.mainDeck).toContain("u1:2");
    });

    it("returns the same shortForm unchanged", async () => {
      const { shortForm } = await provider.addCards([{ id: "l1", quantity: 1 }]);
      const { shortForm: returned } = await provider.getDeckFromShortForm(shortForm);
      expect(returned).toBe(shortForm);
    });

    it("throws on an invalid shortForm string", async () => {
      await expect(provider.getDeckFromShortForm("not-valid-base64url!!!")).rejects.toThrow();
    });
  });
});
