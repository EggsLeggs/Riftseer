import { describe, expect, test } from "bun:test";
import {
  deckDisplayOrder,
  deckZoneSections,
  groupDeckCards,
  totalCopies,
  type GroupableCard,
} from "./grouping";

function card(overrides: Partial<GroupableCard> & { name: string }): GroupableCard {
  return {
    card_type: "Unit",
    domains: [],
    energy: 1,
    quantity: 1,
    zone: "main",
    ...overrides,
  };
}

describe("groupDeckCards by type", () => {
  test("orders groups by play order, not alphabetically", () => {
    const groups = groupDeckCards([
      card({ name: "Sigil", card_type: "Rune" }),
      card({ name: "Vayne", card_type: "Unit" }),
      card({ name: "Yasuo", card_type: "Legend" }),
    ]);
    expect(groups.map((group) => group.label)).toEqual(["Legend", "Unit", "Rune"]);
  });

  test("counts copies rather than rows", () => {
    const groups = groupDeckCards([
      card({ name: "Vayne", quantity: 2 }),
      card({ name: "Vayne (alt art)", quantity: 1 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.cards).toHaveLength(2);
    expect(groups[0]!.count).toBe(3);
  });

  test("keeps an unrecognised type, sorted after the known ones", () => {
    const groups = groupDeckCards([
      card({ name: "Relic", card_type: "Artefact" }),
      card({ name: "Vayne", card_type: "Unit" }),
    ]);
    expect(groups.map((group) => group.label)).toEqual(["Unit", "Artefact"]);
  });

  test("groups a missing type under Other rather than dropping the card", () => {
    const groups = groupDeckCards([card({ name: "Mystery", card_type: null })]);
    expect(groups.map((group) => group.label)).toEqual(["Other"]);
    expect(groups[0]!.count).toBe(1);
  });

  test("sorts cards inside a group by name", () => {
    const groups = groupDeckCards([card({ name: "Zed" }), card({ name: "Ahri" })]);
    expect(groups[0]!.cards.map((entry) => entry.name)).toEqual(["Ahri", "Zed"]);
  });
});

describe("groupDeckCards by domain", () => {
  test("puts a multi-domain card in one combined group, counted once", () => {
    const groups = groupDeckCards(
      [
        card({ name: "Split", domains: ["Fury", "Calm"], quantity: 2 }),
        card({ name: "Pure", domains: ["Calm"] }),
      ],
      "domain",
    );
    expect(groups.map((group) => group.label)).toEqual(["Calm", "Calm · Fury"]);
    expect(totalCopies([...groups[0]!.cards, ...groups[1]!.cards])).toBe(3);
  });

  test("treats domain order as insignificant", () => {
    const groups = groupDeckCards(
      [
        card({ name: "A", domains: ["Fury", "Calm"] }),
        card({ name: "B", domains: ["Calm", "Fury"] }),
      ],
      "domain",
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.count).toBe(2);
  });

  test("sorts domainless last", () => {
    const groups = groupDeckCards(
      [card({ name: "Bare", domains: [] }), card({ name: "Calm one", domains: ["Calm"] })],
      "domain",
    );
    expect(groups.map((group) => group.label)).toEqual(["Calm", "Domainless"]);
  });
});

describe("groupDeckCards by energy", () => {
  test("orders numerically and keeps zero as a real energy", () => {
    const groups = groupDeckCards(
      [
        card({ name: "Ten", energy: 10 }),
        card({ name: "Two", energy: 2 }),
        card({ name: "Free", energy: 0 }),
      ],
      "energy",
    );
    expect(groups.map((group) => group.label)).toEqual(["0 energy", "2 energy", "10 energy"]);
  });

  test("names the value so a heading is not two bare numbers", () => {
    const groups = groupDeckCards([card({ name: "Four", energy: 4, quantity: 6 })], "energy");
    expect(groups[0]!.label).toBe("4 energy");
    expect(groups[0]!.count).toBe(6);
  });

  test("sorts energyless cards last", () => {
    const groups = groupDeckCards(
      [card({ name: "Rune", energy: null }), card({ name: "Unit", energy: 3 })],
      "energy",
    );
    expect(groups.map((group) => group.label)).toEqual(["3 energy", "No energy"]);
  });
});

describe("deckZoneSections", () => {
  test("returns every zone in canonical order, empty ones included", () => {
    const sections = deckZoneSections([card({ name: "Vayne", zone: "main" })]);
    expect(sections.map((section) => section.zone)).toEqual([
      "legend",
      "main",
      "sideboard",
      "runes",
      "battlefields",
      "considering",
    ]);
    expect(sections.find((section) => section.zone === "runes")!.cards).toEqual([]);
  });

  test("counts copies per zone", () => {
    const sections = deckZoneSections([
      card({ name: "Vayne", zone: "main", quantity: 3 }),
      card({ name: "Sigil", zone: "runes", quantity: 12 }),
    ]);
    expect(sections.find((section) => section.zone === "main")!.count).toBe(3);
    expect(sections.find((section) => section.zone === "runes")!.count).toBe(12);
  });
});

describe("deckDisplayOrder", () => {
  const deck = [
    card({ name: "Sigil", zone: "runes", card_type: "Rune", energy: null }),
    card({ name: "Vayne", zone: "main", card_type: "Unit", energy: 3 }),
    card({ name: "Defy", zone: "main", card_type: "Spell", energy: 1 }),
    card({ name: "Ivern", zone: "legend", card_type: "Legend" }),
  ];

  test("walks zones in canonical order, then each zone's groups", () => {
    expect(deckDisplayOrder(deck, "type").map((entry) => entry.name)).toEqual([
      "Ivern",
      "Vayne",
      "Defy",
      "Sigil",
    ]);
  });

  test("regrouping regroups the order with it", () => {
    expect(deckDisplayOrder(deck, "energy").map((entry) => entry.name)).toEqual([
      "Ivern",
      "Defy",
      "Vayne",
      "Sigil",
    ]);
  });

  test("holds every card exactly once", () => {
    expect(deckDisplayOrder(deck, "domain")).toHaveLength(deck.length);
  });
});
