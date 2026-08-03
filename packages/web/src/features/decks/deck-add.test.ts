import { describe, expect, test } from "bun:test";
import { deckAddChange, eligibleZones, resolveAddZone } from "./deck-add";
import type { DeckCard } from "./types";

function deckCard(overrides: Partial<DeckCard>): DeckCard {
  return {
    printing_id: "p1",
    oracle_id: "o1",
    name: "Card",
    card_type: "Unit",
    supertype: null,
    is_token: false,
    domains: [],
    energy: 1,
    might: null,
    power: null,
    set_code: "OGN",
    collector_number: "001",
    rarity: null,
    public_slug: null,
    has_hosted_image: false,
    zone: "main",
    quantity: 1,
    is_champion: false,
    ...overrides,
  } as DeckCard;
}

describe("eligibleZones", () => {
  test("routes runes and battlefields away from the main deck", () => {
    expect(eligibleZones({ oracle_id: "o", printing_id: "p", card_type: "Rune" })[0]).toBe("runes");
    expect(
      eligibleZones({ oracle_id: "o", printing_id: "p", card_type: "Battlefield" })[0],
    ).toBe("battlefields");
    expect(eligibleZones({ oracle_id: "o", printing_id: "p", card_type: "Legend" })).toEqual([
      "legend",
    ]);
  });

  test("a token is only ever a scratch-list entry", () => {
    expect(
      eligibleZones({ oracle_id: "o", printing_id: "p", card_type: "Unit", is_token: true }),
    ).toEqual(["considering"]);
  });
});

describe("resolveAddZone", () => {
  test("honours a requested zone the card may sit in", () => {
    expect(
      resolveAddZone({ oracle_id: "o", printing_id: "p", card_type: "Unit" }, "sideboard"),
    ).toBe("sideboard");
  });

  test("ignores a requested zone the card may not sit in", () => {
    expect(
      resolveAddZone({ oracle_id: "o", printing_id: "p", card_type: "Legend" }, "main"),
    ).toBe("legend");
  });
});

describe("deckAddChange", () => {
  test("a first copy is quantity one", () => {
    const change = deckAddChange([], {
      oracle_id: "o1",
      printing_id: "p1",
      card_type: "Unit",
    });
    expect(change).toMatchObject({ zone: "main", quantity: 1, printing_id: "p1" });
  });

  test("adding to an existing row sends the absolute new total", () => {
    const cards = [deckCard({ quantity: 3 })];
    const change = deckAddChange(cards, {
      oracle_id: "o1",
      printing_id: "p1",
      card_type: "Unit",
    });
    expect(change.quantity).toBe(4);
  });

  test("a different printing of the same card is its own row", () => {
    const cards = [deckCard({ quantity: 3 })];
    const change = deckAddChange(cards, {
      oracle_id: "o1",
      printing_id: "p2",
      card_type: "Unit",
    });
    expect(change.quantity).toBe(1);
  });

  test("the same printing in another zone does not fold in", () => {
    const cards = [deckCard({ quantity: 2, zone: "considering" })];
    const change = deckAddChange(cards, {
      oracle_id: "o1",
      printing_id: "p1",
      card_type: "Unit",
    });
    expect(change).toMatchObject({ zone: "main", quantity: 1 });
  });

  test("keeps a champion flag the row already carries", () => {
    const cards = [deckCard({ quantity: 1, is_champion: true })];
    expect(
      deckAddChange(cards, { oracle_id: "o1", printing_id: "p1", card_type: "Unit" })
        .is_champion,
    ).toBe(true);
  });
});
