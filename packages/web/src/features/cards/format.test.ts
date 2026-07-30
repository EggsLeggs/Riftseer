import { describe, expect, test } from "bun:test";

import { tcgplayerUsdPrice } from "./format";

describe("tcgplayerUsdPrice", () => {
  test("prefers a normal price when both finishes are available", () => {
    expect(tcgplayerUsdPrice({ normal: 2.5, foil: 8.75 })).toBe(2.5);
  });

  test("falls back to a foil-only price", () => {
    expect(tcgplayerUsdPrice({ normal: null, foil: 13.6 })).toBe(13.6);
  });

  test("returns null when no TCGPlayer price is available", () => {
    expect(tcgplayerUsdPrice(undefined)).toBeNull();
    expect(tcgplayerUsdPrice({ normal: null, foil: null })).toBeNull();
  });
});
