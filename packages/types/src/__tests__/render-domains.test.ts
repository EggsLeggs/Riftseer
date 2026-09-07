import { describe, expect, it } from "bun:test";
import {
  DOMAIN_KEYS,
  domainDisplayName,
  domainKey,
  domainRuneHex,
  domainWashRgb,
  hasRuneGlyph,
  meaningfulCardDomains,
} from "../render/index.ts";

describe("domainKey", () => {
  it("accepts upstream's capitalised spelling and the rune key", () => {
    expect(domainKey("Fury")).toBe("fury");
    expect(domainKey(" order ")).toBe("order");
    expect(domainKey("BODY")).toBe("body");
  });

  it("rejects anything that is not one of the six", () => {
    expect(domainKey("Light")).toBeNull();
    expect(domainKey("Colorless")).toBeNull();
    expect(domainKey("rainbow")).toBeNull();
    expect(domainKey("")).toBeNull();
  });

  it("names every key the way the card prints it", () => {
    expect(DOMAIN_KEYS.map(domainDisplayName)).toEqual([
      "Body",
      "Calm",
      "Chaos",
      "Fury",
      "Mind",
      "Order",
    ]);
  });
});

describe("colours", () => {
  it("has a rune fill for every domain and nothing else", () => {
    expect(DOMAIN_KEYS.map(domainRuneHex)).toEqual([
      "#E87600",
      "#488C38",
      "#6A4094",
      "#DF1620",
      "#0F6FA6",
      "#D2B400",
    ]);
    expect(domainRuneHex("Fury")).toBe("#DF1620");
    expect(domainRuneHex("Light")).toBeNull();
  });

  it("has a wash for every domain plus rainbow", () => {
    expect(domainWashRgb("Calm")).toBe("22 163 74");
    expect(domainWashRgb("rainbow")).toBe("168 85 247");
    expect(domainWashRgb("Colorless")).toBeNull();
    expect(domainWashRgb("constructor")).toBeNull();
  });
});

describe("hasRuneGlyph", () => {
  it("covers the six domains and rainbow", () => {
    expect(hasRuneGlyph("Mind")).toBe(true);
    expect(hasRuneGlyph("rainbow")).toBe(true);
    expect(hasRuneGlyph("Colorless")).toBe(false);
  });
});

describe("meaningfulCardDomains", () => {
  it("drops the Colorless placeholder and blanks, keeping spelling", () => {
    expect(meaningfulCardDomains({ domains: ["Colorless", "Fury", "", " Order"] })).toEqual([
      "Fury",
      " Order",
    ]);
  });
});
