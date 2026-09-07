import { describe, expect, it } from "bun:test";
import { normalizeCardTextLayout } from "../render/index.ts";

/**
 * Fixture texts in upstream's compressed form, and the lines every surface
 * must split them into. Change an expectation here only with a card in hand.
 */
const CASES: Array<{ name: string; input: string; lines: string[] }> = [
  {
    name: "sentence break with no space after the full stop",
    input: "Draw a card.Then discard a card.",
    lines: ["Draw a card.", "Then discard a card."],
  },
  {
    name: "reminder text keeps its own punctuation together",
    input: "[Deflect 1] (Opponents must pay :rb_energy_1: to choose me. It's a tax.)[Assault 2]",
    lines: [
      "[Deflect 1] (Opponents must pay :rb_energy_1: to choose me. It's a tax.)",
      "[Assault 2]",
    ],
  },
  {
    name: "standalone keyword chain",
    input: "[Accelerate][Assault 2][Deflect]",
    lines: ["[Accelerate]", "[Assault 2]", "[Deflect]"],
  },
  {
    name: "activated ability cost glued to a keyword",
    input: "[Deflect]:rb_energy_2::rb_rune_fury:: Double it.",
    lines: ["[Deflect]", ":rb_energy_2::rb_rune_fury:: Double it."],
  },
  {
    name: "arrow stays attached; entities decode",
    input: "[Reaction][&gt;] :rb_exhaust:: [Add] :rb_rune_rainbow:. (They have &quot;power&quot;.)",
    lines: ['[Reaction][>] :rb_exhaust:: [Add] :rb_rune_rainbow:. (They have "power".)'],
  },
  {
    name: "misplaced italic marker before a parenthetical",
    input: "[Tank]_ (Reminder.)_Then act.",
    lines: ["[Tank]_(Reminder.)_", "Then act."],
  },
  {
    name: "newlines inside a parenthetical collapse to spaces",
    input: "[Hidden] (Play me\nface down.)",
    lines: ["[Hidden] (Play me face down.)"],
  },
  {
    name: "em dash before a capital starts a new line",
    input: "Choose one —Counter a spell.",
    lines: ["Choose one —", "Counter a spell."],
  },
];

describe("normalizeCardTextLayout", () => {
  for (const { name, input, lines } of CASES) {
    it(name, () => {
      expect(normalizeCardTextLayout(input).split("\n")).toEqual(lines);
    });
  }

  it("honours a custom paragraph break", () => {
    expect(normalizeCardTextLayout("[Accelerate][Deflect]", "\n\n")).toBe(
      "[Accelerate]\n\n[Deflect]",
    );
  });

  it("is idempotent", () => {
    for (const { input } of CASES) {
      const once = normalizeCardTextLayout(input);
      expect(normalizeCardTextLayout(once)).toBe(once);
    }
  });
});
