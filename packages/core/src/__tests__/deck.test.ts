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
