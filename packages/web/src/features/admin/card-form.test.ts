import { describe, expect, test } from "bun:test";
import type { Oracle, Printing } from "@riftseer/types";
import {
  buildOraclePatch,
  buildPrintingPatch,
  oracleToEditorValues,
  printingToEditorValues,
} from "./card-form";

const oracle: Oracle = {
  object: "oracle", id: "o", oracle_key: "warhammer", slug: "warhammer",
  name: "Warhammer", name_normalized: "warhammer", card_type: "Gear",
  is_token: false, energy: 2, might_bonus: 0, text: { plain: "[Equip]" },
  keywords: [], tags: ["Weapon"], domains: ["Fury"], meta_flags: [],
};
const printing: Printing = {
  object: "printing", id: "0123456789abcdef01234567", oracle_id: "o",
  public_slug: "ogn/1/warhammer", collector_number: "1", rarity: "Rare",
  finishes: ["Normal"], signature: false, alternate_art: false,
  overnumbered: false, special_collection: false,
};

describe("oracle editor", () => {
  test("preserves a zero might bonus as present", () => {
    expect(oracleToEditorValues(oracle).might_bonus).toBe("0");
  });
  test("only patches changed oracle fields", () => {
    const initial = oracleToEditorValues(oracle);
    expect(buildOraclePatch(initial, initial)).toEqual({});
    expect(buildOraclePatch({ ...initial, tags: "Weapon, Relic" }, initial)).toEqual({ tags: ["Weapon", "Relic"] });
  });
});

describe("printing editor", () => {
  test("keeps rarity printing-scoped", () => {
    const initial = printingToEditorValues(printing);
    expect(buildPrintingPatch({ ...initial, rarity: "Showcase" }, initial)).toEqual({ rarity: "Showcase" });
  });
  test("clears optional printing text with null", () => {
    const initial = { ...printingToEditorValues(printing), artist: "Artist" };
    expect(buildPrintingPatch({ ...initial, artist: "" }, initial)).toEqual({ artist: null });
  });
});
