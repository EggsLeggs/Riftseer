import { describe, expect, it } from "bun:test";
import { parseCardTextRich, richFragmentToPlain } from "../card-text.ts";

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
