import { describe, expect, test } from "bun:test";
import type { Card } from "@riftseer/types";
import { suggestAltTextForCard, suggestCardAltText } from "./alt-text";

function card(overrides: Partial<Card> & Pick<Card, "name">): Card {
  return {
    object: "card",
    id: "x",
    name_normalized: overrides.name.toLowerCase(),
    attributes: {},
    classification: {},
    text: {},
    metadata: {},
    media: {},
    is_token: false,
    all_parts: [],
    used_by: [],
    related_champions: [],
    related_legends: [],
    related_signatures: [],
    related_printings: [],
    ...overrides,
  };
}

describe("suggestCardAltText", () => {
  test("builds a description from name, type, set and artist", () => {
    expect(
      suggestCardAltText({
        name: "Sett, Brawler",
        typeLine: "Champion Unit",
        setCode: "OGN",
        collectorNumber: "164",
        artist: "Kudos Productions",
      }),
    ).toBe("Sett, Brawler · Champion Unit · OGN #164. Art by Kudos Productions");
  });

  test("mentions alternate art and signature printings", () => {
    expect(
      suggestCardAltText({
        name: "Ahri",
        type: "Unit",
        signature: true,
        alternateArt: true,
        setCode: "OGN",
        collectorNumber: "305",
      }),
    ).toBe("Ahri · Unit · signature, alternate art · OGN #305");
  });

  test("returns empty when the card has no name", () => {
    expect(suggestCardAltText({ name: "  " })).toBe("");
  });
});

describe("suggestAltTextForCard", () => {
  test("formats the type line from the card classification", () => {
    expect(
      suggestAltTextForCard(
        card({
          name: "Sett, Brawler",
          classification: { type: "Unit", supertype: "Champion" },
          set: { set_code: "OGN", set_name: "Origins" },
          collector_number: "164",
        }),
      ),
    ).toBe("Sett, Brawler · Champion Unit · OGN #164");
  });
});
