import { describe, it, expect, beforeEach } from "bun:test";
import { Deck, DeckIssue } from "../deck.ts";
import { Card, RelatedCard } from "../types.ts";

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

function makeLegend(id: string, domains: string[], relatedChampions: RelatedCard[] = []): Card {
  return makeCard({
    id,
    name: `Legend ${id}`,
    classification: { supertype: "Legend", domains },
    related_champions: relatedChampions,
  });
}

function makeChampion(id: string, domains: string[]): Card {
  return makeCard({
    id,
    name: `Champion ${id}`,
    classification: { supertype: "Champion", domains },
  });
}

function makeUnit(id: string, domains: string[] = []): Card {
  return makeCard({
    id,
    name: `Unit ${id}`,
    classification: { type: "Unit", domains },
  });
}

function makeBattleground(id: string): Card {
  return makeCard({
    id,
    name: `Battleground ${id}`,
    classification: { supertype: "Battleground" },
  });
}

function makeRune(id: string, domains: string[] = []): Card {
  return makeCard({
    id,
    name: `Rune ${id}`,
    classification: { supertype: "Rune", domains },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Deck", () => {
  let deck: Deck;

  beforeEach(() => {
    deck = new Deck();
  });

  // ── addLegend ───────────────────────────────────────────────────────────────

  describe("addLegend", () => {
    it("sets the legend when a valid legend card is provided", () => {
      const legend = makeLegend("l1", ["Fury"]);
      deck.addLegend(legend);
      expect(deck.legend).toBe(legend);
    });

    it("throws when the card is not a legend", () => {
      const unit = makeUnit("u1", ["Fury"]);
      expect(() => deck.addLegend(unit)).toThrow("is not a legend");
    });

    it("throws when a legend has already been set", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      expect(() => deck.addLegend(makeLegend("l2", ["Fury"]))).toThrow("A legend has already been chosen");
    });
  });

  // ── addMainCard ─────────────────────────────────────────────────────────────

  describe("addMainCard", () => {
    it("throws when no legend has been chosen", () => {
      const unit = makeUnit("u1", ["Fury"]);
      expect(() => deck.addMainCard(unit)).toThrow("Cannot add cards before a legend is chosen");
    });

    it("throws when trying to add a Legend card", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      expect(() => deck.addMainCard(makeLegend("l2", ["Fury"]))).toThrow("can not be added into the main deck");
    });

    it("throws when trying to add a Battleground card", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      expect(() => deck.addMainCard(makeBattleground("b1"))).toThrow("can not be added into the main deck");
    });

    it("throws when trying to add a Rune card", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      expect(() => deck.addMainCard(makeRune("r1", ["Fury"]))).toThrow("can not be added into the main deck");
    });

    it("throws when card domain is not covered by the legend", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      const wrongDomain = makeUnit("u1", ["Arcane"]);
      expect(() => deck.addMainCard(wrongDomain)).toThrow("does not match all domains of the legend");
    });

    it("adds a card to the main deck", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      const unit = makeUnit("u1", ["Fury"]);
      deck.addMainCard(unit);
      expect(deck.cards).toHaveLength(1);
      expect(deck.cards[0]).toMatchObject({ card: unit, quantity: 1 });
    });

    it("increments quantity for duplicate cards", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      const unit = makeUnit("u1", ["Fury"]);
      deck.addMainCard(unit);
      deck.addMainCard(unit);
      expect(deck.cards).toHaveLength(1);
      expect(deck.cards[0].quantity).toBe(2);
    });

    it("throws when adding more than 3 copies of a card", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      const unit = makeUnit("u1", ["Fury"]);
      deck.addMainCard(unit, 3);
      expect(() => deck.addMainCard(unit)).toThrow("Cannot have more than 3 copies");
    });

    it("throws when the main deck would exceed 40 cards", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      // Add 40 unique cards (3 + 3 + ... then fill up)
      for (let i = 0; i < 13; i++) {
        deck.addMainCard(makeUnit(`u${i}`, ["Fury"]), 3);
      }
      // 39 cards so far — one more should be fine
      deck.addMainCard(makeUnit("u99", ["Fury"]));
      // Now at 40; adding one more should fail
      expect(() => deck.addMainCard(makeUnit("u100", ["Fury"]))).toThrow("Cannot have more than 40 total cards");
    });

    it("adds a card to the sideboard when toSideboard is true", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      const unit = makeUnit("u1", ["Fury"]);
      deck.addMainCard(unit, 1, true);
      expect(deck.cards).toHaveLength(0);
      expect(deck.sideboard).toHaveLength(1);
      expect(deck.sideboard[0]).toMatchObject({ card: unit, quantity: 1 });
    });

    it("allows card with no domains regardless of legend domains", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      const neutral = makeUnit("u1", []);
      expect(() => deck.addMainCard(neutral)).not.toThrow();
      expect(deck.cards).toHaveLength(1);
    });

    it("sets chosenChampion when the champion is in the legend's related_champions", () => {
      const champion = makeChampion("c1", ["Fury"]);
      const legend = makeLegend("l1", ["Fury"], [relatedCard("c1", "Champion c1")]);
      deck.addLegend(legend);
      deck.addMainCard(champion);
      expect(deck.chosenChampion).toBe(champion);
      expect(deck.cards).toHaveLength(0);
    });

    it("adds a second champion to the main deck if one is already chosen", () => {
      const champion1 = makeChampion("c1", ["Fury"]);
      const champion2 = makeChampion("c2", ["Fury"]);
      const legend = makeLegend("l1", ["Fury"], [
        relatedCard("c1", "Champion c1"),
        relatedCard("c2", "Champion c2"),
      ]);
      deck.addLegend(legend);
      deck.addMainCard(champion1);
      deck.addMainCard(champion2);
      expect(deck.chosenChampion).toBe(champion1);
      expect(deck.cards[0]).toMatchObject({ card: champion2, quantity: 1 });
    });

    it("adds a champion to the main deck when it is not in the legend's related_champions", () => {
      const champion = makeChampion("c_other", ["Fury"]);
      const legend = makeLegend("l1", ["Fury"], [relatedCard("c1", "Champion c1")]);
      deck.addLegend(legend);
      deck.addMainCard(champion);
      expect(deck.chosenChampion).toBeNull();
      expect(deck.cards[0]).toMatchObject({ card: champion, quantity: 1 });
    });

    it("sets chosenChampion and adds remaining copies to the main deck when quantity > 1", () => {
      const champion = makeChampion("c1", ["Fury"]);
      const legend = makeLegend("l1", ["Fury"], [relatedCard("c1", "Champion c1")]);
      deck.addLegend(legend);
      deck.addMainCard(champion, 2);
      expect(deck.chosenChampion).toBe(champion);
      expect(deck.cards).toHaveLength(1);
      expect(deck.cards[0]).toMatchObject({ card: champion, quantity: 1 });
    });

    it("sets chosenChampion and adds remaining 2 copies to main deck when quantity is 3", () => {
      const champion = makeChampion("c1", ["Fury"]);
      const legend = makeLegend("l1", ["Fury"], [relatedCard("c1", "Champion c1")]);
      deck.addLegend(legend);
      deck.addMainCard(champion, 3);
      expect(deck.chosenChampion).toBe(champion);
      expect(deck.cards[0]).toMatchObject({ card: champion, quantity: 2 });
    });

    it("counts chosenChampion slot toward the 3-copy limit on subsequent adds", () => {
      const champion = makeChampion("c1", ["Fury"]);
      const legend = makeLegend("l1", ["Fury"], [relatedCard("c1", "Champion c1")]);
      deck.addLegend(legend);
      deck.addMainCard(champion); // 1 → chosenChampion
      deck.addMainCard(champion, 2); // 2 more → total 3, should be fine
      expect(deck.cards[0]).toMatchObject({ card: champion, quantity: 2 });
      // Adding a 4th copy must fail
      expect(() => deck.addMainCard(champion)).toThrow("Cannot have more than 3 copies");
    });

    it("applies the 40-card cap to overflow copies after the champion slot is filled", () => {
      const champion = makeChampion("c1", ["Fury"]);
      const legend = makeLegend("l1", ["Fury"], [relatedCard("c1", "Champion c1")]);
      deck.addLegend(legend);
      // Fill the deck: chosenChampion (1) + 13×3 = 40 total
      deck.addMainCard(champion); // chosenChampion (1 main card count)
      for (let i = 0; i < 13; i++) {
        deck.addMainCard(makeUnit(`u${i}`, ["Fury"]), 3);
      }
      // At 40 cards — any overflow from a batch champion add that exceeds cap must fail
      const champion2 = makeChampion("c2", ["Fury"]);
      // champion2 is not in related_champions, so it goes straight to main deck
      expect(() => deck.addMainCard(champion2)).toThrow("Cannot have more than 40 total cards");
    });
  });

  // ── addBattleground ─────────────────────────────────────────────────────────

  describe("addBattleground", () => {
    it("adds a valid battleground", () => {
      const bg = makeBattleground("b1");
      deck.addBattleground(bg);
      expect(deck.battlegrounds).toHaveLength(1);
      expect(deck.battlegrounds[0]).toBe(bg);
    });

    it("throws when card is not a battleground", () => {
      expect(() => deck.addBattleground(makeUnit("u1"))).toThrow("is not a Battleground");
    });

    it("throws when a fourth battleground is added", () => {
      deck.addBattleground(makeBattleground("b1"));
      deck.addBattleground(makeBattleground("b2"));
      deck.addBattleground(makeBattleground("b3"));
      expect(() => deck.addBattleground(makeBattleground("b4"))).toThrow("Cannot have more than 3 battlegrounds");
    });

    it("throws when the same battleground is added twice", () => {
      const bg = makeBattleground("b1");
      deck.addBattleground(bg);
      expect(() => deck.addBattleground(bg)).toThrow("already in the deck");
    });
  });

  // ── addRune ─────────────────────────────────────────────────────────────────

  describe("addRune", () => {
    beforeEach(() => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
    });

    it("adds a valid rune", () => {
      const rune = makeRune("r1", ["Fury"]);
      deck.addRune(rune);
      expect(deck.runes).toHaveLength(1);
      expect(deck.runes[0]).toMatchObject({ card: rune, quantity: 1 });
    });

    it("throws when card is not a rune", () => {
      expect(() => deck.addRune(makeUnit("u1", ["Fury"]))).toThrow("is not a Rune");
    });

    it("throws when rune domain is not covered by the legend", () => {
      expect(() => deck.addRune(makeRune("r1", ["Arcane"]))).toThrow("does not match all domains");
    });

    it("increments quantity for duplicate runes", () => {
      const rune = makeRune("r1", ["Fury"]);
      deck.addRune(rune, 3);
      deck.addRune(rune, 2);
      expect(deck.runes[0].quantity).toBe(5);
    });

    it("throws when the same rune already has 12 copies", () => {
      const rune = makeRune("r1", ["Fury"]);
      deck.addRune(rune, 12);
      expect(() => deck.addRune(rune)).toThrow("Cannot have more than 12 runes");
    });

    it("throws when runes across different cards would exceed 12 total", () => {
      deck.addRune(makeRune("r1", ["Fury"]), 10);
      expect(() => deck.addRune(makeRune("r2", ["Fury"]), 3)).toThrow("Cannot have more than 12 runes");
    });

    it("allows mixing rune cards up to exactly 12 total", () => {
      deck.addRune(makeRune("r1", ["Fury"]), 6);
      deck.addRune(makeRune("r2", ["Fury"]), 6);
      expect(deck.runes.reduce((sum, c) => sum + c.quantity, 0)).toBe(12);
    });

    it("throws when a single batch add would push multiple rune types past 12 total", () => {
      deck.addRune(makeRune("r1", ["Fury"]), 12);
      expect(() => deck.addRune(makeRune("r2", ["Fury"]), 1)).toThrow("Cannot have more than 12 runes");
    });
  });

  // ── removeLegend ────────────────────────────────────────────────────────────

  describe("removeLegend", () => {
    it("removes the legend and clears all dependent state", () => {
      const champion = makeChampion("c1", ["Fury"]);
      const legend = makeLegend("l1", ["Fury"], [relatedCard("c1", "Champion c1")]);
      deck.addLegend(legend);
      deck.addMainCard(champion);
      deck.addMainCard(makeUnit("u1", ["Fury"]));
      deck.addMainCard(makeUnit("u2", ["Fury"]), 1, true);
      deck.addRune(makeRune("r1", ["Fury"]));

      deck.removeLegend();

      expect(deck.legend).toBeNull();
      expect(deck.chosenChampion).toBeNull();
      expect(deck.cards).toHaveLength(0);
      expect(deck.sideboard).toHaveLength(0);
      expect(deck.runes).toHaveLength(0);
    });

    it("throws when there is no legend to remove", () => {
      expect(() => deck.removeLegend()).toThrow("No legend to remove");
    });
  });

  // ── removeMainCard ──────────────────────────────────────────────────────────

  describe("removeMainCard", () => {
    beforeEach(() => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
    });

    it("decrements quantity when more than one copy exists", () => {
      const unit = makeUnit("u1", ["Fury"]);
      deck.addMainCard(unit, 2);
      deck.removeMainCard("u1");
      expect(deck.cards[0].quantity).toBe(1);
    });

    it("removes the entry entirely when the last copy is removed", () => {
      deck.addMainCard(makeUnit("u1", ["Fury"]));
      deck.removeMainCard("u1");
      expect(deck.cards).toHaveLength(0);
    });

    it("removes from the sideboard when no copies remain in the main deck", () => {
      const unit = makeUnit("u1", ["Fury"]);
      deck.addMainCard(unit, 1, true);
      deck.removeMainCard("u1");
      expect(deck.sideboard).toHaveLength(0);
    });

    it("unsets chosenChampion when the champion card is removed", () => {
      const champion = makeChampion("c1", ["Fury"]);
      deck.addLegend = deck.addLegend.bind(deck);
      // Rebuild with a legend that has the champion as related
      deck = new Deck();
      const legend = makeLegend("l1", ["Fury"], [relatedCard("c1", "Champion c1")]);
      deck.addLegend(legend);
      deck.addMainCard(champion);
      expect(deck.chosenChampion).toBe(champion);

      deck.removeMainCard("c1");
      expect(deck.chosenChampion).toBeNull();
    });

    it("throws when the card id is not found anywhere", () => {
      expect(() => deck.removeMainCard("nonexistent")).toThrow("not found");
    });
  });

  // ── removeBattleground ──────────────────────────────────────────────────────

  describe("removeBattleground", () => {
    it("removes an existing battleground", () => {
      const bg = makeBattleground("b1");
      deck.addBattleground(bg);
      deck.removeBattleground("b1");
      expect(deck.battlegrounds).toHaveLength(0);
    });

    it("throws when the battleground id is not found", () => {
      expect(() => deck.removeBattleground("nonexistent")).toThrow("not found");
    });
  });

  // ── removeRune ──────────────────────────────────────────────────────────────

  describe("removeRune", () => {
    beforeEach(() => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
    });

    it("decrements rune quantity when more than one copy exists", () => {
      const rune = makeRune("r1", ["Fury"]);
      deck.addRune(rune, 3);
      deck.removeRune("r1");
      expect(deck.runes[0].quantity).toBe(2);
    });

    it("removes the rune entry entirely when the last copy is removed", () => {
      deck.addRune(makeRune("r1", ["Fury"]));
      deck.removeRune("r1");
      expect(deck.runes).toHaveLength(0);
    });

    it("throws when the rune id is not found", () => {
      expect(() => deck.removeRune("nonexistent")).toThrow("not found");
    });
  });

  // ── toSimplifiedDeck ────────────────────────────────────────────────────────

  describe("toSimplifiedDeck", () => {
    it("serialises an empty deck with no legend", () => {
      const simplified = deck.toSimplifiedDeck();
      expect(simplified.id).toBe(deck.id);
      expect(simplified.legendId).toBeNull();
      expect(simplified.chosenChampionId).toBeNull();
      expect(simplified.mainDeck).toHaveLength(0);
      expect(simplified.sideboard).toHaveLength(0);
      expect(simplified.runes).toHaveLength(0);
      expect(simplified.battlegrounds).toHaveLength(0);
    });

    it("serialises the legend id", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      expect(deck.toSimplifiedDeck().legendId).toBe("l1");
    });

    it("serialises chosenChampion id", () => {
      const champion = makeChampion("c1", ["Fury"]);
      const legend = makeLegend("l1", ["Fury"], [relatedCard("c1", "Champion c1")]);
      deck.addLegend(legend);
      deck.addMainCard(champion);
      expect(deck.toSimplifiedDeck().chosenChampionId).toBe("c1");
    });

    it("serialises main deck cards as id:quantity strings", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      deck.addMainCard(makeUnit("u1", ["Fury"]), 3);
      deck.addMainCard(makeUnit("u2", ["Fury"]), 1);
      const { mainDeck } = deck.toSimplifiedDeck();
      expect(mainDeck).toContain("u1:3");
      expect(mainDeck).toContain("u2:1");
    });

    it("serialises sideboard cards as id:quantity strings", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      deck.addMainCard(makeUnit("u1", ["Fury"]), 2, true);
      expect(deck.toSimplifiedDeck().sideboard).toContain("u1:2");
    });

    it("serialises runes as id:quantity strings", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      deck.addRune(makeRune("r1", ["Fury"]), 4);
      expect(deck.toSimplifiedDeck().runes).toContain("r1:4");
    });

    it("serialises battleground ids", () => {
      deck.addBattleground(makeBattleground("b1"));
      deck.addBattleground(makeBattleground("b2"));
      const { battlegrounds } = deck.toSimplifiedDeck();
      expect(battlegrounds).toEqual(["b1", "b2"]);
    });
  });

  // ── fromSimplifiedDeck ──────────────────────────────────────────────────────

  describe("fromSimplifiedDeck", () => {
    function buildCardLookup(...cards: Card[]): (id: string) => Card {
      const map = new Map(cards.map(c => [c.id, c]));
      return (id: string) => {
        const card = map.get(id);
        if (!card) throw new Error(`Card not found: ${id}`);
        return card;
      };
    }

    it("restores the deck id", () => {
      const simplified = deck.toSimplifiedDeck();
      const restored = Deck.fromSimplifiedDeck(simplified, buildCardLookup());
      expect(restored.id).toBe(deck.id);
    });

    it("restores legend as null when legendId is null", () => {
      const simplified = deck.toSimplifiedDeck();
      const restored = Deck.fromSimplifiedDeck(simplified, buildCardLookup());
      expect(restored.legend).toBeNull();
    });

    it("restores the legend from legendId", () => {
      const legend = makeLegend("l1", ["Fury"]);
      deck.addLegend(legend);
      const simplified = deck.toSimplifiedDeck();
      const restored = Deck.fromSimplifiedDeck(simplified, buildCardLookup(legend));
      expect(restored.legend?.id).toBe("l1");
    });

    it("restores chosenChampion from chosenChampionId", () => {
      const champion = makeChampion("c1", ["Fury"]);
      const legend = makeLegend("l1", ["Fury"], [relatedCard("c1", "Champion c1")]);
      deck.addLegend(legend);
      deck.addMainCard(champion);
      const simplified = deck.toSimplifiedDeck();
      const restored = Deck.fromSimplifiedDeck(simplified, buildCardLookup(legend, champion));
      expect(restored.chosenChampion?.id).toBe("c1");
    });

    it("restores main deck cards with correct quantities", () => {
      const legend = makeLegend("l1", ["Fury"]);
      const unit1 = makeUnit("u1", ["Fury"]);
      const unit2 = makeUnit("u2", ["Fury"]);
      deck.addLegend(legend);
      deck.addMainCard(unit1, 3);
      deck.addMainCard(unit2, 2);
      const simplified = deck.toSimplifiedDeck();
      const restored = Deck.fromSimplifiedDeck(simplified, buildCardLookup(legend, unit1, unit2));
      expect(restored.cards).toHaveLength(2);
      expect(restored.cards.find(c => c.card.id === "u1")?.quantity).toBe(3);
      expect(restored.cards.find(c => c.card.id === "u2")?.quantity).toBe(2);
    });

    it("restores sideboard cards with correct quantities", () => {
      const legend = makeLegend("l1", ["Fury"]);
      const unit = makeUnit("u1", ["Fury"]);
      deck.addLegend(legend);
      deck.addMainCard(unit, 2, true);
      const simplified = deck.toSimplifiedDeck();
      const restored = Deck.fromSimplifiedDeck(simplified, buildCardLookup(legend, unit));
      expect(restored.sideboard).toHaveLength(1);
      expect(restored.sideboard[0]).toMatchObject({ card: unit, quantity: 2 });
    });

    it("restores runes with correct quantities", () => {
      const legend = makeLegend("l1", ["Fury"]);
      const rune = makeRune("r1", ["Fury"]);
      deck.addLegend(legend);
      deck.addRune(rune, 6);
      const simplified = deck.toSimplifiedDeck();
      const restored = Deck.fromSimplifiedDeck(simplified, buildCardLookup(legend, rune));
      expect(restored.runes).toHaveLength(1);
      expect(restored.runes[0]).toMatchObject({ card: rune, quantity: 6 });
    });

    it("restores battlegrounds", () => {
      const bg1 = makeBattleground("b1");
      const bg2 = makeBattleground("b2");
      deck.addBattleground(bg1);
      deck.addBattleground(bg2);
      const simplified = deck.toSimplifiedDeck();
      const restored = Deck.fromSimplifiedDeck(simplified, buildCardLookup(bg1, bg2));
      expect(restored.battlegrounds).toHaveLength(2);
      expect(restored.battlegrounds.map(c => c.id)).toEqual(["b1", "b2"]);
    });

    it("round-trips a fully populated deck", () => {
      const champion = makeChampion("c1", ["Fury"]);
      const legend = makeLegend("l1", ["Fury"], [relatedCard("c1", "Champion c1")]);
      const unit = makeUnit("u1", ["Fury"]);
      const rune = makeRune("r1", ["Fury"]);
      const bg = makeBattleground("b1");

      deck.addLegend(legend);
      deck.addMainCard(champion);
      deck.addMainCard(unit, 2);
      deck.addMainCard(unit, 1, true);
      deck.addRune(rune, 3);
      deck.addBattleground(bg);

      const simplified = deck.toSimplifiedDeck();
      const restored = Deck.fromSimplifiedDeck(
        simplified,
        buildCardLookup(legend, champion, unit, rune, bg),
      );

      expect(restored.id).toBe(deck.id);
      expect(restored.legend?.id).toBe("l1");
      expect(restored.chosenChampion?.id).toBe("c1");
      expect(restored.cards.find(c => c.card.id === "u1")?.quantity).toBe(2);
      expect(restored.sideboard.find(c => c.card.id === "u1")?.quantity).toBe(1);
      expect(restored.runes.find(c => c.card.id === "r1")?.quantity).toBe(3);
      expect(restored.battlegrounds.map(c => c.id)).toEqual(["b1"]);
    });
  });

  // ── getFinalisationIssues ───────────────────────────────────────────────────

  describe("getFinalisationIssues", () => {
    it("returns NoLegend when no legend is set", () => {
      const issues = deck.getFinalisationIssues();
      expect(issues).toContain(DeckIssue.NoLegend);
    });

    it("returns no other issues when only NoLegend is present", () => {
      expect(deck.getFinalisationIssues()).toEqual([DeckIssue.NoLegend]);
    });

    it("returns NoChosenChampion when legend is set but no champion chosen", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      expect(deck.getFinalisationIssues()).toContain(DeckIssue.NoChosenChampion);
    });

    it("returns NotEnoughMainCards when fewer than 40 cards are in the main deck", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      expect(deck.getFinalisationIssues()).toContain(DeckIssue.NotEnoughMainCards);
    });

    it("returns NotEnoughBattlegrounds when fewer than 3 battlegrounds are set", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      expect(deck.getFinalisationIssues()).toContain(DeckIssue.NotEnoughBattlegrounds);
    });

    it("returns NotEnoughRunes when fewer than 12 runes are set", () => {
      deck.addLegend(makeLegend("l1", ["Fury"]));
      expect(deck.getFinalisationIssues()).toContain(DeckIssue.NotEnoughRunes);
    });

    it("returns no issues for a fully valid deck", () => {
      const champion = makeChampion("c1", ["Fury"]);
      const legend = makeLegend("l1", ["Fury"], [relatedCard("c1", "Champion c1")]);
      deck.addLegend(legend);
      deck.addMainCard(champion); // sets chosenChampion

      // Fill main deck to 40 cards (chosenChampion counts as 1, so 13×3 = 39 + 1 = 40)
      for (let i = 0; i < 13; i++) {
        deck.addMainCard(makeUnit(`u${i}`, ["Fury"]), 3);
      }

      // 3 battlegrounds
      deck.addBattleground(makeBattleground("b1"));
      deck.addBattleground(makeBattleground("b2"));
      deck.addBattleground(makeBattleground("b3"));

      // 12 runes
      deck.addRune(makeRune("r1", ["Fury"]), 12);

      expect(deck.getFinalisationIssues()).toHaveLength(0);
    });
  });
});
