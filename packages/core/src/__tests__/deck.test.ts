import { describe, expect, it } from "bun:test";
import type { SimplifiedDeck } from "../types.ts";
import { toDeckCard } from "../deck-card.ts";
import { Deck, DeckIssue } from "../deck.ts";
import { makeDeckCard, makeOracle, makePrinting } from "./fixtures.ts";

const legend = (id = "legend") =>
  makeDeckCard(id, { card_type: "Legend", domains: ["Fury", "Order"] });
const unit = (id = "unit", domains = ["Fury"]) => makeDeckCard(id, { domains });
const champion = (id = "champion") =>
  makeDeckCard(id, { supertype: "Champion", domains: ["Fury"] });
const rune = (id = "rune", domains = ["Fury"]) =>
  makeDeckCard(id, { supertype: "Rune", domains });
const battleground = (id = "battle") =>
  makeDeckCard(id, { supertype: "Battleground", domains: [] });

function withLegend() {
  const deck = new Deck();
  deck.addLegend(legend());
  return deck;
}

const empty: SimplifiedDeck = {
  id: null,
  legendId: null,
  chosenChampionId: null,
  mainDeck: [],
  sideboard: [],
  runes: [],
  battlegrounds: [],
};

describe("Deck rules", () => {
  it("flattens oracle rules onto a printing-keyed deck card", () => {
    const oracle = makeOracle("o", {
      name: "Garen",
      card_type: "Unit",
      supertype: "Champion",
      domains: ["Order"],
    });
    expect(toDeckCard(oracle, makePrinting("printing", "o"))).toEqual({
      id: "printing",
      name: "Garen",
      card_type: "Unit",
      supertype: "Champion",
      domains: ["Order"],
    });
  });

  it("sets exactly one Legend", () => {
    const deck = new Deck();
    deck.addLegend(legend());
    expect(deck.legend?.id).toBe("legend");
    expect(() => deck.addLegend(legend("other"))).toThrow("already been chosen");
  });

  it("rejects a non-Legend in the legend slot", () => {
    expect(() => new Deck().addLegend(unit())).toThrow("is not a legend");
  });

  it("requires a legend before adding main-deck cards", () => {
    expect(() => new Deck().addMainCard(unit())).toThrow("before a legend");
  });

  it("keeps Legend, Battleground, and Rune cards out of main and sideboard", () => {
    const deck = withLegend();
    for (const card of [legend("l2"), battleground(), rune()]) {
      expect(() => deck.addMainCard(card)).toThrow("main deck or sideboard");
    }
  });

  it("requires every card domain to be covered by the legend", () => {
    const deck = withLegend();
    deck.addMainCard(unit("legal", ["Fury", "Order"]));
    expect(() => deck.addMainCard(unit("illegal", ["Chaos"]))).toThrow(
      "does not match all domains",
    );
  });

  it("allows domainless cards", () => {
    const deck = withLegend();
    deck.addMainCard(unit("neutral", []), 3);
    expect(deck.cards[0]?.quantity).toBe(3);
  });

  it("uses the first Champion as the chosen slot and puts overflow copies in main", () => {
    const deck = withLegend();
    deck.addMainCard(champion(), 3);
    expect(deck.chosenChampion?.id).toBe("champion");
    expect(deck.cards).toEqual([{ card: champion(), quantity: 2 }]);
  });

  it("enforces three copies across champion, main, and sideboard", () => {
    const deck = withLegend();
    deck.addMainCard(champion(), 2);
    deck.addMainCard(champion(), 1, true);
    expect(() => deck.addMainCard(champion())).toThrow("more than 3 copies");
  });

  it("enforces the 40-card main-deck cap including chosen Champion", () => {
    const deck = withLegend();
    deck.addMainCard(champion());
    for (let i = 0; i < 13; i++) deck.addMainCard(unit(`u${i}`), 3);
    expect(() => deck.addMainCard(unit("overflow"))).toThrow("more than 40");
  });

  it("enforces the eight-card sideboard cap", () => {
    const deck = withLegend();
    deck.addMainCard(unit("a"), 3, true);
    deck.addMainCard(unit("b"), 3, true);
    deck.addMainCard(unit("c"), 2, true);
    expect(() => deck.addMainCard(unit("d"), 1, true)).toThrow("more than 8");
  });

  it("accepts three unique Battlegrounds and rejects duplicates or a fourth", () => {
    const deck = new Deck();
    for (const id of ["b1", "b2", "b3"]) deck.addBattleground(battleground(id));
    expect(() => deck.addBattleground(battleground("b1"))).toThrow("more than 3");
    expect(() => deck.addBattleground(battleground("b4"))).toThrow("more than 3");
  });

  it("rejects a non-Battleground from the Battleground zone", () => {
    expect(() => new Deck().addBattleground(unit())).toThrow("not a Battleground");
  });

  it("requires a matching legend domain for Runes", () => {
    const deck = withLegend();
    deck.addRune(rune("legal"), 1);
    expect(() => deck.addRune(rune("illegal", ["Chaos"]))).toThrow(
      "does not match all domains",
    );
  });

  it("caps total Runes at twelve across rune types", () => {
    const deck = withLegend();
    deck.addRune(rune("r1"), 7);
    deck.addRune(rune("r2"), 5);
    expect(() => deck.addRune(rune("r3"))).toThrow("more than 12 runes");
  });

  it("routes each zone through addCard and spills main-deck overflow to sideboard", () => {
    const deck = new Deck();
    deck.addCard(legend());
    deck.addCard(champion());
    for (let i = 0; i < 13; i++) deck.addCard(unit(`u${i}`), 3);
    deck.addCard(unit("spill"), 2);
    deck.addCard(rune(), 2);
    deck.addCard(battleground());
    expect(deck.cards.find((entry) => entry.card.id === "spill")?.quantity).toBeUndefined();
    expect(deck.sideboard.find((entry) => entry.card.id === "spill")?.quantity).toBe(2);
    expect(deck.runes[0]?.quantity).toBe(2);
    expect(deck.battlegrounds).toHaveLength(1);
  });

  it("requires positive integer quantities", () => {
    const deck = withLegend();
    for (const quantity of [0, -1, 1.5]) {
      expect(() => deck.addCard(unit(), quantity)).toThrow("positive integer");
      expect(() => deck.removeCard("unit", quantity)).toThrow("positive integer");
    }
  });

  it("removes quantities before removing the entry", () => {
    const deck = withLegend();
    deck.addMainCard(unit(), 3);
    deck.removeMainCard("unit", 2);
    expect(deck.cards[0]?.quantity).toBe(1);
    deck.removeMainCard("unit");
    expect(deck.cards).toEqual([]);
  });

  it("removes cards from their specialised zones", () => {
    const deck = withLegend();
    deck.addRune(rune(), 2);
    deck.addBattleground(battleground());
    deck.removeCard("rune");
    deck.removeCard("battle");
    expect(deck.runes[0]?.quantity).toBe(1);
    expect(deck.battlegrounds).toEqual([]);
  });

  it("removing the legend clears every dependent zone but keeps Battlegrounds", () => {
    const deck = withLegend();
    deck.addMainCard(unit());
    deck.addRune(rune());
    deck.addBattleground(battleground());
    deck.removeLegend("legend");
    expect(deck).toMatchObject({
      legend: null,
      chosenChampion: null,
      cards: [],
      sideboard: [],
      runes: [],
    });
    expect(deck.battlegrounds).toHaveLength(1);
  });

  it("serialises every deck zone using printing ids", () => {
    const deck = withLegend();
    deck.id = "deck";
    deck.addMainCard(champion(), 2);
    deck.addMainCard(unit(), 2);
    deck.addMainCard(unit("side"), 1, true);
    deck.addRune(rune(), 3);
    deck.addBattleground(battleground());
    expect(deck.toSimplifiedDeck()).toEqual({
      id: "deck",
      legendId: "legend",
      chosenChampionId: "champion",
      mainDeck: ["champion:1", "unit:2"],
      sideboard: ["side:1"],
      runes: ["rune:3"],
      battlegrounds: ["battle"],
    });
  });

  it("round-trips a valid simplified deck", async () => {
    const cards = [legend(), champion(), unit(), rune(), battleground()];
    const lookup = async (id: string) => cards.find((card) => card.id === id)!;
    const input: SimplifiedDeck = {
      id: "deck",
      legendId: "legend",
      chosenChampionId: "champion",
      mainDeck: ["unit:3"],
      sideboard: [],
      runes: ["rune:12"],
      battlegrounds: ["battle"],
    };
    expect((await Deck.fromSimplifiedDeck(input, lookup)).toSimplifiedDeck()).toEqual(input);
  });

  it("rejects malformed entries and lookup failures with section context", async () => {
    await expect(
      Deck.fromSimplifiedDeck({ ...empty, mainDeck: ["broken"] }, async () => unit()),
    ).rejects.toThrow("Malformed deck entry");
    await expect(
      Deck.fromSimplifiedDeck({ ...empty, legendId: "missing" }, async () => {
        throw new Error("not found");
      }),
    ).rejects.toThrow("lookup failed in legend");
  });

  it("validates zone, domain, copy, and size rules after decoding", async () => {
    const cards = new Map([
      ["legend", legend()],
      ["unit", unit()],
      ["wrong", unit("wrong", ["Chaos"])],
      ["rune", rune()],
      ["battle", battleground()],
    ]);
    const lookup = async (id: string) => cards.get(id)!;
    const invalid = [
      { ...empty, mainDeck: ["unit:1"] },
      { ...empty, legendId: "legend", mainDeck: ["wrong:1"] },
      { ...empty, legendId: "legend", mainDeck: ["unit:4"] },
      { ...empty, legendId: "legend", runes: ["rune:13"] },
      { ...empty, legendId: "legend", battlegrounds: ["battle", "battle"] },
    ];
    for (const value of invalid) await expect(Deck.fromSimplifiedDeck(value, lookup)).rejects.toThrow();
  });

  it("reports each missing finalisation requirement once", () => {
    expect(new Deck().getFinalisationIssues()).toEqual([DeckIssue.NoLegend]);
    const deck = withLegend();
    expect(deck.getFinalisationIssues()).toEqual([
      DeckIssue.NoChosenChampion,
      DeckIssue.NotEnoughMainCards,
      DeckIssue.NotEnoughBattlegrounds,
      DeckIssue.NotEnoughRunes,
    ]);
  });
});
