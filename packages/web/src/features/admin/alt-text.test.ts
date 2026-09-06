import { describe, expect, test } from "bun:test";
import type { Oracle, Printing } from "@riftseer/types";
import { suggestAltTextForCard, suggestCardAltText } from "./alt-text";

describe("suggestCardAltText", () => {
  test("describes printing variants and artist", () => {
    expect(suggestCardAltText({ name: "Vayne", typeLine: "Champion Unit", setCode: "OGN", collectorNumber: "12", artist: "Artist", alternateArt: true })).toBe("Vayne · Champion Unit · alternate art · OGN #12. Art by Artist");
  });
  test("accepts an oracle and printing", () => {
    const oracle = { object: "oracle", id: "o", oracle_key: "vayne", slug: "vayne", name: "Vayne", name_normalized: "vayne", card_type: "Unit", supertype: "Champion", is_token: false, keywords: [], tags: [], domains: [], meta_flags: [] } as Oracle;
    const printing = { object: "printing", id: "p", oracle_id: "o", public_slug: "ogn/1/vayne", collector_number: "1", finishes: [], signature: false, alternate_art: false, overnumbered: false, special_collection: false } as Printing;
    expect(suggestAltTextForCard(oracle, printing)).toContain("Vayne · Champion Unit");
  });
});
