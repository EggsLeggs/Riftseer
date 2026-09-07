import { describe, expect, it } from "bun:test";
import { cardTypeIconKey, cardTypeLine } from "../render/index.ts";

const CASES: Array<{
  card_type?: string;
  supertype?: string;
  line: string | null;
  icon: string | null;
}> = [
  { card_type: "Unit", supertype: "Champion", line: "Champion Unit", icon: "champion" },
  { card_type: "Unit", supertype: "Signature", line: "Signature Unit", icon: "unit" },
  { card_type: "Legend", supertype: "Champion", line: "Legend", icon: "legend" },
  { card_type: "Token", line: "Token Unit", icon: "unit" },
  { card_type: "Unit", supertype: "Token", line: "Token Unit", icon: "unit" },
  { card_type: "Spell", line: "Spell", icon: "spell" },
  { card_type: "Gear", line: "Gear", icon: "gear" },
  { card_type: "Battlefield", line: "Battlefield", icon: "battlefield" },
  { card_type: "Rune", line: "Rune", icon: "rune" },
  { supertype: "Signature", line: "Signature", icon: "signature" },
  { card_type: "  ", supertype: "", line: null, icon: null },
  { line: null, icon: null },
];

describe("cardTypeLine / cardTypeIconKey", () => {
  for (const { card_type, supertype, line, icon } of CASES) {
    it(`${card_type ?? "∅"} / ${supertype ?? "∅"} → ${line ?? "null"} (${icon ?? "no glyph"})`, () => {
      expect(cardTypeLine({ card_type, supertype })).toBe(line);
      expect(cardTypeIconKey({ card_type, supertype })).toBe(icon);
    });
  }
});
