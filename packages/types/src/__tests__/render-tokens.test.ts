import { describe, expect, it } from "bun:test";
import {
  formatTokenDisplayList,
  replaceIconTokens,
  tokenDisplayName,
  tokenPlainLabel,
  tokenizeCardTextInline,
  tokenizeCardTextLine,
} from "../render/index.ts";

describe("tokenPlainLabel", () => {
  it("labels known glyphs with braces", () => {
    expect(tokenPlainLabel("exhaust")).toBe("{Exhaust}");
    expect(tokenPlainLabel("rune_rainbow")).toBe("{Power}");
    expect(tokenPlainLabel("might")).toBe("{Might}");
  });

  it("renders energy values as braced numbers", () => {
    expect(tokenPlainLabel("energy_0")).toBe("{0}");
    expect(tokenPlainLabel("energy_3")).toBe("{3}");
  });

  it("falls back to a title-cased key for unknowns", () => {
    expect(tokenPlainLabel("rune_custom")).toBe("{Custom}");
    expect(tokenPlainLabel("foo_bar")).toBe("{Foo Bar}");
  });
});

describe("tokenDisplayName", () => {
  it("omits braces for tooltips", () => {
    expect(tokenDisplayName("exhaust")).toBe("Exhaust");
    expect(tokenDisplayName("rune_rainbow")).toBe("Power");
    expect(tokenDisplayName("energy_3")).toBe("3 Energy");
  });

  it("names domain runes with the domain's printed spelling", () => {
    expect(tokenDisplayName("rune_fury")).toBe("Fury");
    expect(tokenDisplayName("rune_order")).toBe("Order");
  });

  it("ignores inherited object members", () => {
    expect(tokenDisplayName("constructor")).toBe("Constructor");
  });
});

describe("formatTokenDisplayList", () => {
  it("joins with and / commas", () => {
    expect(formatTokenDisplayList(["energy_3"])).toBe("3 Energy");
    expect(formatTokenDisplayList(["energy_3", "rune_rainbow"])).toBe("3 Energy and Power");
    expect(formatTokenDisplayList(["energy_1", "rune_order", "rune_order"])).toBe(
      "1 Energy, Order, and Order",
    );
  });
});

describe("replaceIconTokens", () => {
  it("hands each key and its full match to the replacer", () => {
    expect(
      replaceIconTokens("Pay :rb_energy_2::rb_rune_fury: to :rb_exhaust:.", (key, match) =>
        key === "exhaust" ? "<exhaust>" : `[${match}]`,
      ),
    ).toBe("Pay [:rb_energy_2:][:rb_rune_fury:] to <exhaust>.");
  });
});

describe("tokenizeCardTextInline", () => {
  it("groups adjacent icons into one run", () => {
    expect(tokenizeCardTextInline("Pay :rb_energy_3::rb_rune_rainbow: now")).toEqual([
      { kind: "text", text: "Pay " },
      { kind: "icon", keys: ["energy_3", "rune_rainbow"] },
      { kind: "text", text: " now" },
    ]);
  });

  it("absorbs a keyword's trailing costs and its arrow", () => {
    expect(
      tokenizeCardTextInline(
        "[Empower] :rb_energy_3::rb_rune_body:[Empowered][>] I have +3 :rb_might:.",
      ),
    ).toEqual([
      {
        kind: "keyword",
        label: "Empower",
        arrow: false,
        stackLeft: false,
        costs: ["energy_3", "rune_body"],
      },
      { kind: "keyword", label: "Empowered", arrow: true, stackLeft: false, costs: [] },
      { kind: "text", text: " I have +3 " },
      { kind: "icon", keys: ["might"] },
      { kind: "text", text: "." },
    ]);
  });

  it("does not absorb an activated ability's cost run, which ends in an extra colon", () => {
    expect(tokenizeCardTextInline("[Deflect]:rb_energy_2::rb_rune_fury:: Double it.")).toEqual([
      { kind: "keyword", label: "Deflect", arrow: false, stackLeft: false, costs: [] },
      { kind: "icon", keys: ["energy_2", "rune_fury"] },
      { kind: "text", text: ": Double it." },
    ]);
  });

  it("leaves [Add] resources after the badge, since they are the effect", () => {
    expect(tokenizeCardTextInline("[Add] :rb_rune_rainbow:.")).toEqual([
      { kind: "keyword", label: "Add", arrow: false, stackLeft: false, costs: [] },
      { kind: "text", text: " " },
      { kind: "icon", keys: ["rune_rainbow"] },
      { kind: "text", text: "." },
    ]);
  });

  it("consumes a [>>] stack connector into the next keyword", () => {
    expect(tokenizeCardTextInline("[Level 6][>] [>>][Reaction][>] go")).toEqual([
      { kind: "keyword", label: "Level 6", arrow: true, stackLeft: false, costs: [] },
      { kind: "text", text: " " },
      { kind: "keyword", label: "Reaction", arrow: true, stackLeft: true, costs: [] },
      { kind: "text", text: " go" },
    ]);
  });

  it("keeps non-keyword brackets literal", () => {
    expect(tokenizeCardTextInline("[NO TEXT] and [3 Might]")).toEqual([
      { kind: "bracket", label: "NO TEXT" },
      { kind: "text", text: " and " },
      { kind: "bracket", label: "3 Might" },
    ]);
  });

  it("returns nothing for an empty line", () => {
    expect(tokenizeCardTextInline("")).toEqual([]);
  });
});

describe("tokenizeCardTextLine", () => {
  it("wraps reminder italics, with icons inside them intact", () => {
    // Ornn: the underscores inside `:rb_exhaust:` must not open an italic span.
    expect(
      tokenizeCardTextLine("[Tank] _(Pay :rb_exhaust: to :rb_rune_rainbow:.)_ Then this."),
    ).toEqual([
      { kind: "keyword", label: "Tank", arrow: false, stackLeft: false, costs: [] },
      { kind: "text", text: " " },
      {
        kind: "italic",
        tokens: [
          { kind: "text", text: "(Pay " },
          { kind: "icon", keys: ["exhaust"] },
          { kind: "text", text: " to " },
          { kind: "icon", keys: ["rune_rainbow"] },
          { kind: "text", text: ".)" },
        ],
      },
      { kind: "text", text: " Then this." },
    ]);
  });

  it("treats a lone underscore as prose", () => {
    expect(tokenizeCardTextLine("snake_case stays")).toEqual([
      { kind: "text", text: "snake_case stays" },
    ]);
  });
});
