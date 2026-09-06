import { describe, expect, it } from "bun:test";
import {
  normalizeCardTextLayout,
  parseCardTextRich,
  richFragmentToPlain,
} from "../card-text.ts";

const FLURRY_RICH =
  "<p>[Reaction]<br />Choose one —</p><ul><li>Counter a spell.</li><li>Play four 1 :rb_might: Bird unit tokens with [Deflect]. (Opponents must pay :rb_rune_rainbow: to choose them with a spell or ability.)</li></ul>";

describe("richFragmentToPlain", () => {
  it("converts br tags to newlines and decodes entities", () => {
    expect(
      richFragmentToPlain('[Reaction]<br />Choose one &quot;option&quot; —'),
    ).toBe('[Reaction]\nChoose one "option" —');
  });
});

describe("parseCardTextRich", () => {
  it("returns null when there is no bullet list", () => {
    expect(parseCardTextRich("<p>[Tank] (Reminder text.)</p>")).toBeNull();
    expect(parseCardTextRich("")).toBeNull();
  });

  it("parses choose-one paragraphs and list items", () => {
    expect(parseCardTextRich(FLURRY_RICH)).toEqual([
      { type: "paragraph", lines: ["[Reaction]", "Choose one —"] },
      {
        type: "list",
        items: [
          "Counter a spell.",
          "Play four 1 :rb_might: Bird unit tokens with [Deflect]. (Opponents must pay :rb_rune_rainbow: to choose them with a spell or ability.)",
        ],
      },
    ]);
  });

  it("preserves break-only list items as explicit rendering breaks", () => {
    expect(
      parseCardTextRich("<p>Choose one —</p><ul><li><br /></li><li>Do a thing.</li></ul>"),
    ).toEqual([
      { type: "paragraph", lines: ["Choose one —"] },
      { type: "list", items: ["\n", "Do a thing."] },
    ]);
  });
});

describe("normalizeCardTextLayout", () => {
  it("breaks between a keyword's cost and the next keyword", () => {
    // Ambessa, The Wolf (alternate art). The base printing carries reminder
    // text, so its `)` triggers the punctuation rule; this printing ends its
    // Empower line on the cost itself and used to run straight into
    // [Empowered].
    expect(
      normalizeCardTextLayout(
        "[Empower] :rb_energy_3::rb_rune_body:[Empowered][&gt;] I have +3 :rb_might: in combat.",
      ),
    ).toBe(
      "[Empower] :rb_energy_3::rb_rune_body:\n[Empowered][>] I have +3 :rb_might: in combat.",
    );
  });

  it("keeps the arrow attached to the keyword it follows", () => {
    expect(
      normalizeCardTextLayout("[Empower] :rb_energy_8:[Empowered][>] When I connect."),
    ).toBe("[Empower] :rb_energy_8:\n[Empowered][>] When I connect.");
  });

  it("leaves a cost that already ends its line alone", () => {
    const already = "[Empower] :rb_energy_3:\n[Empowered][>] Your spells cost less.";
    expect(normalizeCardTextLayout(already)).toBe(already);
  });
});
