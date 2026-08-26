import { describe, expect, test } from "bun:test";
import {
  applyDeckCardChanges,
  deckMoveChanges,
  deckRowKey,
  mergeDeckCardChange,
  mergeDeckCardChanges,
} from "./deck-changes";
import type { DeckCard, DeckCardChange } from "./types";

function change(overrides: Partial<DeckCardChange> = {}): DeckCardChange {
  return {
    zone: "main",
    printing_id: "p1",
    oracle_id: "o1",
    quantity: 1,
    ...overrides,
  } as DeckCardChange;
}

function card(overrides: Partial<DeckCard> = {}): DeckCard {
  return {
    printing_id: "p1",
    oracle_id: "o1",
    name: "Vayne",
    card_type: "Unit",
    supertype: null,
    is_token: false,
    domains: ["Fury"],
    energy: 3,
    might: 4,
    power: null,
    set_code: "OGN",
    collector_number: "042",
    rarity: "rare",
    public_slug: "ogn/042/vayne",
    has_hosted_image: true,
    zone: "main",
    quantity: 1,
    is_champion: false,
    ...overrides,
  } as DeckCard;
}

describe("deckRowKey", () => {
  test("separates the same printing in two zones", () => {
    expect(deckRowKey("main", "p1")).not.toBe(deckRowKey("considering", "p1"));
  });
});

describe("mergeDeckCardChange", () => {
  test("replaces rather than accumulates, because quantity is absolute", () => {
    let queue = mergeDeckCardChange([], change({ quantity: 1 }));
    queue = mergeDeckCardChange(queue, change({ quantity: 2 }));
    queue = mergeDeckCardChange(queue, change({ quantity: 3 }));
    expect(queue).toHaveLength(1);
    expect(queue[0]!.quantity).toBe(3);
  });

  test("keeps the same printing in a different zone as its own entry", () => {
    const queue = mergeDeckCardChanges(
      [],
      [change({ quantity: 2 }), change({ zone: "considering", quantity: 1 })],
    );
    expect(queue).toHaveLength(2);
  });

  test("a quantity change does not clear a champion flag queued earlier", () => {
    let queue = mergeDeckCardChange([], change({ is_champion: true }));
    queue = mergeDeckCardChange(queue, change({ quantity: 2 }));
    expect(queue[0]).toMatchObject({ quantity: 2, is_champion: true });
  });

  test("an explicit champion flag overwrites the queued one", () => {
    let queue = mergeDeckCardChange([], change({ is_champion: true }));
    queue = mergeDeckCardChange(queue, change({ is_champion: false }));
    expect(queue[0]!.is_champion).toBe(false);
  });

  test("preserves queue order when replacing", () => {
    const queue = mergeDeckCardChanges(
      [],
      [
        change({ printing_id: "a" }),
        change({ printing_id: "b" }),
        change({ printing_id: "a", quantity: 4 }),
      ],
    );
    expect(queue.map((entry) => entry.printing_id)).toEqual(["a", "b"]);
    expect(queue[0]!.quantity).toBe(4);
  });
});

describe("applyDeckCardChanges", () => {
  test("returns the list unchanged when nothing is queued", () => {
    const cards = [card()];
    expect(applyDeckCardChanges(cards, [])).toEqual(cards);
  });

  test("projects a new quantity onto the matching row", () => {
    const result = applyDeckCardChanges([card()], [change({ quantity: 3 })]);
    expect(result[0]!.quantity).toBe(3);
  });

  test("quantity zero removes the row", () => {
    const result = applyDeckCardChanges([card()], [change({ quantity: 0 })]);
    expect(result).toHaveLength(0);
  });

  test("only touches the row in the change's own zone", () => {
    const result = applyDeckCardChanges(
      [card(), card({ zone: "considering" })],
      [change({ quantity: 0 })],
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.zone).toBe("considering");
  });

  test("ignores a change for a row the server has not sent yet", () => {
    const result = applyDeckCardChanges([card()], [change({ printing_id: "new" })]);
    expect(result).toHaveLength(1);
    expect(result[0]!.printing_id).toBe("p1");
  });

  test("leaves the champion flag alone unless the change carries one", () => {
    const result = applyDeckCardChanges(
      [card({ is_champion: true })],
      [change({ quantity: 2 })],
    );
    expect(result[0]!.is_champion).toBe(true);
  });
});

describe("deckMoveChanges", () => {
  test("empties the old row and fills the new one with the same quantity", () => {
    const moved = card({ quantity: 2 });
    const [from, to] = deckMoveChanges([moved], moved, "considering");
    expect(from).toMatchObject({ zone: "main", quantity: 0 });
    expect(to).toMatchObject({ zone: "considering", quantity: 2 });
  });

  test("adds to the destination row rather than replacing it", () => {
    const moved = card({ quantity: 2 });
    const occupied = card({ zone: "considering", quantity: 1 });
    const [, to] = deckMoveChanges([moved, occupied], moved, "considering");
    // Absolute quantities: sending 2 here would drop the copy already there.
    expect(to).toMatchObject({ zone: "considering", quantity: 3 });
  });

  test("counts only the same printing in the destination zone", () => {
    const moved = card({ quantity: 2 });
    const otherArt = card({ zone: "considering", printing_id: "p2", quantity: 4 });
    const [, to] = deckMoveChanges([moved, otherArt], moved, "considering");
    expect(to).toMatchObject({ printing_id: "p1", quantity: 2 });
  });

  test("drops the champion flag when the destination is not main", () => {
    const moved = card({ is_champion: true });
    const [, to] = deckMoveChanges([moved], moved, "sideboard");
    expect(to!.is_champion).toBe(false);
  });

  test("keeps the champion flag when moving back into main", () => {
    const moved = card({ zone: "sideboard", is_champion: true });
    const [, to] = deckMoveChanges([moved], moved, "main");
    expect(to!.is_champion).toBe(true);
  });

  test("keeps a champion flag the destination row already carries", () => {
    const moved = card({ zone: "sideboard" });
    const occupied = card({ zone: "main", is_champion: true });
    const [, to] = deckMoveChanges([moved, occupied], moved, "main");
    expect(to!.is_champion).toBe(true);
  });
});
