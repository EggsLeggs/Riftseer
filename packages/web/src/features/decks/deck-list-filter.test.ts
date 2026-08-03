import { describe, expect, test } from "bun:test";
import {
  deckListFormats,
  filterDeckSummaries,
  pageDeckSummaries,
} from "./deck-list-filter";
import type { DeckSummary } from "./types";

function summary(overrides: Partial<DeckSummary>): DeckSummary {
  return {
    id: "d1",
    name: "Deck",
    description: null,
    visibility: "private",
    format: { id: "f1", code: "standard", name: "Standard" },
    owner: { id: "u1", handle: "amory", username: "Amory" },
    role: "owner",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as DeckSummary;
}

describe("filterDeckSummaries", () => {
  const decks = [
    summary({ id: "a", name: "Yasuo Aggro", role: "owner" }),
    summary({ id: "b", name: "Vayne Midrange", role: "editor", visibility: "public" }),
    summary({ id: "c", name: "Lux Control", role: null, visibility: "public" }),
    summary({
      id: "d",
      name: "Draven Burn",
      role: "viewer",
      format: { id: "f2", code: "legacy", name: "Legacy" },
    }),
  ];

  test("matches names case-insensitively", () => {
    expect(filterDeckSummaries(decks, { query: "vayne" }).map((d) => d.id)).toEqual(["b"]);
  });

  test("mine means the owner role, not merely visible", () => {
    expect(filterDeckSummaries(decks, { ownership: "mine" }).map((d) => d.id)).toEqual(["a"]);
  });

  test("shared excludes both my own decks and decks I only happen to see", () => {
    expect(filterDeckSummaries(decks, { ownership: "shared" }).map((d) => d.id)).toEqual([
      "b",
      "d",
    ]);
  });

  test("filters by format code and visibility", () => {
    expect(filterDeckSummaries(decks, { format: "legacy" }).map((d) => d.id)).toEqual(["d"]);
    expect(filterDeckSummaries(decks, { visibility: "public" }).map((d) => d.id)).toEqual([
      "b",
      "c",
    ]);
  });

  test("an empty filter is the whole list", () => {
    expect(filterDeckSummaries(decks)).toHaveLength(4);
  });
});

describe("deckListFormats", () => {
  test("reports each format once, by name", () => {
    expect(
      deckListFormats([
        summary({ id: "a" }),
        summary({ id: "b" }),
        summary({ id: "c", format: { id: "f2", code: "legacy", name: "Legacy" } }),
        summary({ id: "d", format: null }),
      ]),
    ).toEqual([
      { code: "legacy", name: "Legacy" },
      { code: "standard", name: "Standard" },
    ]);
  });
});

describe("pageDeckSummaries", () => {
  const decks = Array.from({ length: 5 }, (_, i) => summary({ id: `d${i}` }));

  test("slices the requested page", () => {
    expect(pageDeckSummaries(decks, 2, 2).items.map((d) => d.id)).toEqual(["d2", "d3"]);
  });

  test("clamps a page past the end rather than showing nothing", () => {
    const page = pageDeckSummaries(decks, 99, 2);
    expect(page.page).toBe(3);
    expect(page.items.map((d) => d.id)).toEqual(["d4"]);
  });

  test("an empty list is still one page", () => {
    expect(pageDeckSummaries([], 1, 20)).toEqual({ items: [], page: 1, totalPages: 1 });
  });
});
