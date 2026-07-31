import { describe, expect, test } from "bun:test";
import type { Card } from "@riftseer/types";

import {
  tcgplayerUsdPrice,
  typeBadgeRarityColor,
  typeBadgeStyle,
} from "./format";

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

function card(partial: {
  type?: string;
  supertype?: string;
  rarity?: string;
  domains?: string[];
  is_token?: boolean;
}): Card {
  return {
    is_token: partial.is_token ?? false,
    classification: {
      type: partial.type,
      supertype: partial.supertype,
      rarity: partial.rarity,
      domains: partial.domains,
    },
  } as Card;
}

describe("typeBadgeRarityColor", () => {
  test("maps common / uncommon / everything else", () => {
    expect(typeBadgeRarityColor("Common")).toBe("#A25F15");
    expect(typeBadgeRarityColor("uncommon")).toBe("#999999");
    expect(typeBadgeRarityColor("Rare")).toBe("#D6A93C");
    expect(typeBadgeRarityColor("Epic")).toBe("#D6A93C");
    expect(typeBadgeRarityColor(undefined)).toBe("#D6A93C");
  });
});

describe("typeBadgeStyle", () => {
  test("runes are black with white text regardless of domain", () => {
    expect(typeBadgeStyle(card({ type: "Rune", domains: ["Fury"], rarity: "Common" }))).toEqual({
      labelBg: "#0a0a0a",
      labelFg: "#ffffff",
      rarityColor: "#A25F15",
      variant: "rune",
    });
  });

  test("battlefields and tokens stay grey", () => {
    expect(typeBadgeStyle(card({ type: "Battlefield", rarity: "Uncommon" }))).toEqual({
      labelBg: "#c8c8c8",
      labelFg: "#0a0a0a",
      rarityColor: "#c8c8c8",
      variant: "default",
    });
    // Printed as "Token Unit" — type Unit, supertype Token (e.g. Recruit).
    expect(
      typeBadgeStyle(
        card({
          type: "Unit",
          supertype: "Token",
          is_token: true,
          rarity: "Common",
        }),
      ),
    ).toEqual({
      labelBg: "#c8c8c8",
      labelFg: "#0a0a0a",
      rarityColor: "#c8c8c8",
      variant: "default",
    });
  });

  test("legends and multi-domain cards use gold", () => {
    expect(typeBadgeStyle(card({ type: "Legend", domains: ["Calm", "Mind"] })).labelBg).toBe(
      "#D6A93C",
    );
    expect(typeBadgeStyle(card({ type: "Unit", domains: ["Fury", "Order"] })).labelBg).toBe(
      "#D6A93C",
    );
  });

  test("single-domain cards use that domain's colour", () => {
    expect(typeBadgeStyle(card({ type: "Unit", domains: ["Fury"] }))).toMatchObject({
      labelBg: "#DF1620",
      labelFg: "#ffffff",
    });
    expect(typeBadgeStyle(card({ type: "Spell", domains: ["Mind"] })).labelBg).toBe("#0F6FA6");
    expect(typeBadgeStyle(card({ type: "Unit", domains: ["Order"] }))).toMatchObject({
      labelBg: "#D2B400",
      labelFg: "#0a0a0a",
    });
  });
});
