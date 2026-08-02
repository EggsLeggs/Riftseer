import { describe, expect, it } from "bun:test";
import type { DeckCard } from "../deck-card.ts";
import { SimplifiedDeckProviderImpl } from "../providers/simplified_deck_provider.ts";
import { DeckSerializerV1 } from "../serialiser.ts";
import { makeDeckCard } from "./fixtures.ts";

const cards: DeckCard[] = [
  makeDeckCard("legend", { card_type: "Legend", domains: ["Fury"] }),
  makeDeckCard("champion", { supertype: "Champion", domains: ["Fury"] }),
  makeDeckCard("unit", { domains: ["Fury"] }),
  makeDeckCard("other", { domains: ["Fury"] }),
];
const lookup = async (id: string) => {
  const card = cards.find((value) => value.id === id);
  if (!card) throw new Error(`Card not found: ${id}`);
  return card;
};
const provider = new SimplifiedDeckProviderImpl(new DeckSerializerV1(), lookup);

describe("SimplifiedDeckProvider", () => {
  it("creates and serialises a printing-keyed deck", async () => {
    const result = await provider.addCards([
      { id: "legend", quantity: 1 },
      { id: "champion", quantity: 2 },
      { id: "unit", quantity: 3 },
    ]);
    expect(result.deck).toMatchObject({
      legendId: "legend",
      chosenChampionId: "champion",
      mainDeck: ["champion:1", "unit:3"],
    });
    expect(result.shortForm.length).toBeGreaterThan(0);
  });

  it("adds to a deck decoded from an existing short form", async () => {
    const first = await provider.addCards([
      { id: "legend", quantity: 1 },
      { id: "unit", quantity: 1 },
    ]);
    const second = await provider.addCards([{ id: "other", quantity: 2 }], first.shortForm);
    expect(second.deck.mainDeck).toEqual(["unit:1", "other:2"]);
  });

  it("removes quantities and returns a short form reflecting the result", async () => {
    const first = await provider.addCards([
      { id: "legend", quantity: 1 },
      { id: "unit", quantity: 3 },
    ]);
    const removed = await provider.removeCards([{ id: "unit", quantity: 2 }], first.shortForm);
    expect(removed.deck.mainDeck).toEqual(["unit:1"]);
    expect((await provider.getDeckFromShortForm(removed.shortForm)).deck.mainDeck).toEqual(["unit:1"]);
  });

  it("removing the legend clears dependent zones", async () => {
    const first = await provider.addCards([
      { id: "legend", quantity: 1 },
      { id: "unit", quantity: 1 },
    ]);
    const removed = await provider.removeCards([{ id: "legend", quantity: 1 }], first.shortForm);
    expect(removed.deck).toMatchObject({ legendId: null, mainDeck: [] });
  });

  it("rejects missing cards and malformed short forms", async () => {
    await expect(provider.addCards([{ id: "missing", quantity: 1 }])).rejects.toThrow("not found");
    await expect(provider.getDeckFromShortForm("not-valid!!!")).rejects.toThrow();
  });
});
