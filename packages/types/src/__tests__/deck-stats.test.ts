import { describe, expect, test } from "bun:test";

import { deckStats, type StattableCard } from "../deck/stats.ts";

function card(overrides: Partial<StattableCard> = {}): StattableCard {
  return {
    card_type: "Unit",
    domains: ["Calm"],
    energy: 2,
    power: 1,
    quantity: 1,
    zone: "main",
    ...overrides,
  };
}

describe("deckStats", () => {
  test("counts copies, not rows", () => {
    const stats = deckStats([card({ quantity: 3 }), card({ quantity: 2 })]);
    expect(stats.cards).toBe(5);
    expect(stats.cardTypes).toEqual([{ key: "unit", label: "Unit", count: 5 }]);
  });

  test("reads only the main deck", () => {
    const stats = deckStats([
      card({ quantity: 3 }),
      card({ zone: "sideboard", quantity: 2 }),
      card({ zone: "runes", quantity: 12, energy: null, power: null }),
      card({ zone: "considering", quantity: 4 }),
    ]);
    expect(stats.cards).toBe(3);
  });

  test("weights averages by copies and skips cards with no value", () => {
    const stats = deckStats([
      card({ energy: 1, quantity: 3 }),
      card({ energy: 5, quantity: 1 }),
      card({ energy: null, quantity: 10 }),
    ]);
    expect(stats.averageEnergy).toBe(2);
  });

  test("has no average when nothing carries the value", () => {
    const stats = deckStats([card({ energy: null, power: null })]);
    expect(stats.averageEnergy).toBeNull();
    expect(stats.averagePower).toBeNull();
  });

  test("a zero is a real value, not a missing one", () => {
    const stats = deckStats([card({ power: 0, quantity: 2 }), card({ power: 2 })]);
    expect(stats.averagePower).toBeCloseTo(2 / 3);
    expect(stats.powerCurve[0]).toEqual({ value: 0, count: 2 });
  });

  test("curve buckets are contiguous so an empty cost still shows", () => {
    const stats = deckStats([card({ energy: 0 }), card({ energy: 3 })]);
    expect(stats.energyCurve).toEqual([
      { value: 0, count: 1 },
      { value: 1, count: 0 },
      { value: 2, count: 0 },
      { value: 3, count: 1 },
    ]);
  });

  test("a two-domain card counts toward both", () => {
    const stats = deckStats([
      card({ domains: ["Calm", "Order"], quantity: 2 }),
      card({ domains: ["Calm"], quantity: 1 }),
    ]);
    expect(stats.domains).toEqual([
      { key: "calm", label: "Calm", count: 3 },
      { key: "order", label: "Order", count: 2 },
    ]);
  });

  test("a repeated domain on one card is counted once", () => {
    const stats = deckStats([card({ domains: ["Calm", "calm"], quantity: 2 })]);
    expect(stats.domains).toEqual([{ key: "calm", label: "Calm", count: 2 }]);
  });

  test("an empty deck reports zeroes rather than throwing", () => {
    const stats = deckStats([]);
    expect(stats.cards).toBe(0);
    expect(stats.energyCurve).toEqual([]);
    expect(stats.domains).toEqual([]);
  });
});
