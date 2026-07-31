import { describe, expect, test } from "bun:test";
import type { Card } from "@riftseer/types";

import { sortCards } from "./meta-keywords";

function card(name: string, rarity?: string): Card {
  return {
    id: name,
    name,
    classification: rarity ? { rarity } : {},
  } as Card;
}

const names = (cards: Card[]) => cards.map((c) => c.name);

describe("sortCards by rarity", () => {
  test("sorts by the printed ladder, not alphabetically", () => {
    const cards = [
      card("epic", "Epic"),
      card("common", "Common"),
      card("showcase", "Showcase"),
      card("rare", "Rare"),
      card("uncommon", "Uncommon"),
    ];

    expect(names(sortCards(cards, "rarity", "asc"))).toEqual([
      "common",
      "uncommon",
      "rare",
      "epic",
      "showcase",
    ]);
    expect(names(sortCards(cards, "rarity", "desc"))).toEqual([
      "showcase",
      "epic",
      "rare",
      "uncommon",
      "common",
    ]);
  });

  test("is case-insensitive", () => {
    const cards = [card("b", "RARE"), card("a", "common")];
    expect(names(sortCards(cards, "rarity", "asc"))).toEqual(["a", "b"]);
  });

  test("sorts a rarity outside the ladder after it", () => {
    const cards = [card("promo", "Promo"), card("showcase", "Showcase")];
    expect(names(sortCards(cards, "rarity", "asc"))).toEqual([
      "showcase",
      "promo",
    ]);
  });

  test("sorts cards with no rarity last in both directions", () => {
    const cards = [card("none"), card("common", "Common")];
    expect(names(sortCards(cards, "rarity", "asc"))).toEqual([
      "common",
      "none",
    ]);
    expect(names(sortCards(cards, "rarity", "desc"))).toEqual([
      "common",
      "none",
    ]);
  });
});
