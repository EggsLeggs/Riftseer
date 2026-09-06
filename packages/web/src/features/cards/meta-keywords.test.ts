import { describe, expect, test } from "bun:test";
import type { CardResult } from "./api";

import { sortCards } from "./meta-keywords";

function card(name: string, rarity?: string): CardResult {
  return {
    oracle: {
      object: "oracle", id: name, oracle_key: name, slug: name, name,
      name_normalized: name, is_token: false, keywords: [], tags: [],
      domains: [], meta_flags: [],
    },
    printing: {
      object: "printing", id: name, oracle_id: name, public_slug: name,
      rarity, finishes: [], signature: false, alternate_art: false,
      overnumbered: false, special_collection: false,
    },
  };
}

const names = (cards: CardResult[]) => cards.map((card) => card.oracle.name);

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
