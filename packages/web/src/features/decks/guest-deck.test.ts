import { describe, expect, test } from "bun:test";
import { validateDeck } from "@riftseer/types/deck-validate";
import { formatDeckText } from "@riftseer/types/deck-text";

import {
  GUEST_DECK_VERSION,
  applyGuestCardChanges,
  emptyGuestDeck,
  guestDeckCreateInput,
  guestDeckLegalities,
  guestDeckSaveName,
  guestDeckState,
  guestDeckTextCards,
  guestDeckToChanges,
  isGuestDeckEmpty,
  parseGuestDeck,
  serializeGuestDeck,
  withGuestLegalities,
  type GuestDeck,
  type GuestDeckCard,
} from "./guest-deck";

function card(overrides: Partial<GuestDeckCard> = {}): GuestDeckCard {
  return {
    zone: "main",
    printing_id: "p1",
    oracle_id: "o1",
    quantity: 1,
    is_champion: false,
    name: "Vayne",
    card_type: "Unit",
    supertype: null,
    is_token: false,
    domains: ["Fury"],
    energy: 3,
    might: 2,
    power: null,
    set_code: "OGN",
    collector_number: "042",
    rarity: "rare",
    public_slug: "ogn/42/vayne",
    has_hosted_image: true,
    ...overrides,
  };
}

function deck(cards: GuestDeckCard[], overrides: Partial<GuestDeck> = {}): GuestDeck {
  return { ...emptyGuestDeck({ now: "2026-08-03T00:00:00.000Z" }), cards, ...overrides };
}

describe("serialise / parse", () => {
  test("round-trips a deck", () => {
    const original = deck([card(), card({ zone: "legend", printing_id: "p2", name: "Yasuo" })], {
      name: "Fury aggro",
      format: "standard",
    });
    expect(parseGuestDeck(serializeGuestDeck(original))).toEqual(original);
  });

  test("an empty store is no deck rather than an empty one", () => {
    expect(parseGuestDeck(null)).toBeNull();
    expect(parseGuestDeck("")).toBeNull();
  });
});

describe("a corrupt blob never throws", () => {
  test("unparseable JSON", () => {
    expect(parseGuestDeck("{not json")).toBeNull();
    expect(parseGuestDeck("undefined")).toBeNull();
  });

  test("JSON that is not an object", () => {
    expect(parseGuestDeck('"a string"')).toBeNull();
    expect(parseGuestDeck("42")).toBeNull();
    expect(parseGuestDeck("null")).toBeNull();
    expect(parseGuestDeck("[]")).toBeNull();
  });

  test("a version this build does not own", () => {
    const stale = { ...deck([card()]), version: GUEST_DECK_VERSION + 1 };
    expect(parseGuestDeck(JSON.stringify(stale))).toBeNull();
    expect(parseGuestDeck(JSON.stringify({ ...deck([card()]), version: undefined }))).toBeNull();
  });

  test("unreadable rows are dropped and the rest of the deck survives", () => {
    const raw = JSON.stringify({
      ...deck([card()]),
      cards: [
        card(),
        null,
        "nonsense",
        { ...card({ printing_id: "p9" }), zone: "graveyard" },
        { ...card({ printing_id: "p8" }), printing_id: "" },
        { ...card({ printing_id: "p7" }), quantity: 0 },
        { ...card({ printing_id: "p6" }), quantity: "three" },
        card({ printing_id: "p5", zone: "runes" }),
      ],
    });
    const parsed = parseGuestDeck(raw);
    expect(parsed?.cards.map((row) => row.printing_id)).toEqual(["p1", "p5"]);
  });

  test("mistyped fields on an otherwise valid row become their empty value", () => {
    const raw = JSON.stringify({
      ...deck([]),
      cards: [
        {
          zone: "main",
          printing_id: "p1",
          oracle_id: "o1",
          quantity: 2.7,
          name: 17,
          domains: ["Fury", 3, null],
          energy: "cheap",
          is_token: "yes",
        },
      ],
    });
    const row = parseGuestDeck(raw)?.cards[0];
    expect(row).toMatchObject({
      quantity: 2,
      // A row with no readable name still has to render as something.
      name: "p1",
      domains: ["Fury"],
      energy: null,
      // Only a real `true` is a token; a truthy string is not.
      is_token: false,
    });
  });

  test("a malformed legality block is dropped, not trusted", () => {
    const raw = JSON.stringify({
      ...deck([card()]),
      legalities: {
        standard: {
          oracles: { o1: { status: "unheard_of" }, o2: { status: "banned" } },
          printings: "not an object",
        },
        junk: 5,
      },
    });
    const parsed = parseGuestDeck(raw);
    expect(parsed?.legalities).toEqual({
      standard: { oracles: { o2: { status: "banned", note: null } } },
    });
  });

  test("missing top-level fields fall back rather than failing the read", () => {
    const parsed = parseGuestDeck(JSON.stringify({ version: GUEST_DECK_VERSION }));
    expect(parsed).toMatchObject({ name: "", format: "standard", cards: [], legalities: {} });
  });
});

describe("applyGuestCardChanges", () => {
  test("updates an existing row in place", () => {
    const cards = applyGuestCardChanges(
      [card()],
      [{ zone: "main", printing_id: "p1", oracle_id: "o1", quantity: 3 }],
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]?.quantity).toBe(3);
    // The cached display fields survive an edit.
    expect(cards[0]?.set_code).toBe("OGN");
  });

  test("quantity 0 removes the row", () => {
    const cards = applyGuestCardChanges(
      [card()],
      [{ zone: "main", printing_id: "p1", oracle_id: "o1", quantity: 0 }],
    );
    expect(cards).toEqual([]);
  });

  test("creates a row from a template — the difference from the server projection", () => {
    const { zone: _zone, quantity: _q, is_champion: _c, ...fields } = card({
      printing_id: "p2",
      name: "Yasuo",
    });
    const cards = applyGuestCardChanges(
      [card()],
      [{ zone: "main", printing_id: "p2", oracle_id: "o1", quantity: 2 }],
      [fields],
    );
    expect(cards.map((row) => [row.printing_id, row.quantity])).toEqual([
      ["p1", 1],
      ["p2", 2],
    ]);
    expect(cards[1]?.name).toBe("Yasuo");
  });

  test("a change with no card data behind it is dropped, not stored blank", () => {
    const cards = applyGuestCardChanges(
      [],
      [{ zone: "main", printing_id: "ghost", oracle_id: "o9", quantity: 1 }],
    );
    expect(cards).toEqual([]);
  });

  test("a move is a remove plus a create that finds its fields on the old row", () => {
    const cards = applyGuestCardChanges(
      [card({ zone: "main", quantity: 2, is_champion: true })],
      [
        { zone: "main", printing_id: "p1", oracle_id: "o1", quantity: 0 },
        {
          zone: "considering",
          printing_id: "p1",
          oracle_id: "o1",
          quantity: 2,
          is_champion: false,
        },
      ],
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      zone: "considering",
      quantity: 2,
      is_champion: false,
      name: "Vayne",
    });
  });

  test("the same printing in two zones is two rows", () => {
    const cards = applyGuestCardChanges(
      [card({ zone: "main" })],
      [{ zone: "considering", printing_id: "p1", oracle_id: "o1", quantity: 1 }],
    );
    expect(cards.map((row) => row.zone)).toEqual(["main", "considering"]);
  });

  test("an omitted champion flag does not clear one the row carries", () => {
    const cards = applyGuestCardChanges(
      [card({ is_champion: true })],
      [{ zone: "main", printing_id: "p1", oracle_id: "o1", quantity: 4 }],
    );
    expect(cards[0]?.is_champion).toBe(true);
  });
});

describe("withGuestLegalities", () => {
  const entries = [
    { format_code: "standard", status: "banned", scope: "oracle", note: "Banned 2026-07." },
    { format_code: "standard", status: "legal", scope: "default", note: null },
    { format_code: "casual", status: "restricted", scope: "printing", note: null },
  ];

  test("keeps stored rows at their own rung, per format", () => {
    const next = withGuestLegalities(deck([card()]), { oracle_id: "o1", printing_id: "p1" }, entries);
    expect(next.legalities).toEqual({
      standard: { oracles: { o1: { status: "banned", note: "Banned 2026-07." } } },
      casual: { printings: { p1: { status: "restricted", note: null } } },
    });
  });

  test("a default-scope entry stores nothing, because absence already means legal", () => {
    const next = withGuestLegalities(deck([card()]), { oracle_id: "o1", printing_id: "p1" }, [
      { format_code: "standard", status: "legal", scope: "default" },
    ]);
    expect(next.legalities).toEqual({});
    expect(guestDeckLegalities(next, "standard")).toEqual({});
  });

  test("a second card folds in beside the first", () => {
    const first = withGuestLegalities(deck([]), { oracle_id: "o1", printing_id: "p1" }, entries);
    const second = withGuestLegalities(first, { oracle_id: "o2", printing_id: "p2" }, [
      { format_code: "standard", status: "not_legal", scope: "oracle" },
    ]);
    expect(Object.keys(second.legalities.standard?.oracles ?? {})).toEqual(["o1", "o2"]);
  });
});

describe("projections", () => {
  test("guestDeckState feeds validateDeck the rules fields it reads", () => {
    const stored = deck([
      card({ zone: "legend", printing_id: "pL", oracle_id: "oL", card_type: "Legend", name: "Yasuo" }),
      card({ zone: "main", quantity: 5 }),
    ]);
    const violations = validateDeck(
      guestDeckState(stored),
      { zones: [{ zone: "main", min_count: 40, max_count: 40, copy_limit: 3 }] },
      guestDeckLegalities(stored, "standard"),
    );
    const codes = violations.map((violation) => violation.code);
    expect(codes).toContain("copy_limit_exceeded");
    expect(codes).toContain("zone_under_min");
    // A legend is present, so that game-level rule is satisfied.
    expect(codes).not.toContain("no_legend");
  });

  test("a stored ban reaches the validator through the deck's own blob", () => {
    const stored = withGuestLegalities(
      deck([card({ zone: "legend", card_type: "Legend" })]),
      { oracle_id: "o1", printing_id: "p1" },
      [{ format_code: "standard", status: "banned", scope: "oracle" }],
    );
    const violations = validateDeck(
      guestDeckState(stored),
      { zones: [] },
      guestDeckLegalities(stored, "standard"),
    );
    expect(violations.some((violation) => violation.code === "legality")).toBe(true);
  });

  test("guestDeckToChanges is one absolute change per row", () => {
    const stored = deck([
      card({ quantity: 3, is_champion: true }),
      card({ zone: "runes", printing_id: "p2", quantity: 12 }),
    ]);
    expect(guestDeckToChanges(stored)).toEqual([
      { zone: "main", printing_id: "p1", oracle_id: "o1", quantity: 3, is_champion: true },
      { zone: "runes", printing_id: "p2", oracle_id: "o1", quantity: 12 },
    ]);
  });

  test("text export writes a printing suffix only when there is a set to pin it to", () => {
    const text = formatDeckText(
      guestDeckTextCards(
        deck([
          card({ quantity: 2, is_champion: true }),
          card({ printing_id: "p2", name: "Nameless", set_code: null, collector_number: "7" }),
        ]),
      ),
    );
    expect(text).toContain("2 Vayne (OGN) 042 *CH*");
    expect(text).toContain("1 Nameless");
    expect(text).not.toContain("(null)");
  });
});

describe("guestDeckCreateInput", () => {
  test("is the metadata half of the conversion, always private", () => {
    expect(guestDeckCreateInput(deck([card()], { name: "Fury aggro", format: "standard" }))).toEqual(
      { name: "Fury aggro", format: "standard", visibility: "private" },
    );
  });

  test("falls back when the stored format code is empty", () => {
    expect(guestDeckCreateInput(deck([card()], { format: "" })).format).toBe("standard");
  });

  test("pairs with guestDeckToChanges to describe the whole deck", () => {
    const stored = deck([
      card({ zone: "legend", printing_id: "pL", oracle_id: "oL", name: "Yasuo" }),
      card({ quantity: 3, is_champion: true }),
    ]);
    expect(guestDeckCreateInput(stored).name).toBe("Yasuo deck");
    expect(guestDeckToChanges(stored)).toHaveLength(2);
  });
});

describe("guestDeckSaveName", () => {
  test("uses the typed name when there is one", () => {
    expect(guestDeckSaveName(deck([card()], { name: "  Fury aggro  " }))).toBe("Fury aggro");
  });

  test("falls back to the legend, then to a placeholder", () => {
    expect(
      guestDeckSaveName(deck([card({ zone: "legend", name: "Yasuo" })])),
    ).toBe("Yasuo deck");
    expect(guestDeckSaveName(deck([]))).toBe("Untitled deck");
  });
});

test("isGuestDeckEmpty", () => {
  expect(isGuestDeckEmpty(null)).toBe(true);
  expect(isGuestDeckEmpty(emptyGuestDeck())).toBe(true);
  expect(isGuestDeckEmpty(deck([card()]))).toBe(false);
});
