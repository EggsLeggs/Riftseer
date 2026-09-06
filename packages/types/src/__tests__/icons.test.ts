import { describe, expect, it } from "bun:test";
import { tokenDisplayName, formatTokenDisplayList, tokenPlainLabel } from "../icons.ts";

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
});

describe("formatTokenDisplayList", () => {
  it("joins with and / commas", () => {
    expect(formatTokenDisplayList(["energy_3"])).toBe("3 Energy");
    expect(formatTokenDisplayList(["energy_3", "rune_rainbow"])).toBe(
      "3 Energy and Power",
    );
    expect(
      formatTokenDisplayList(["energy_1", "rune_order", "rune_order"]),
    ).toBe("1 Energy, Order, and Order");
  });
});
