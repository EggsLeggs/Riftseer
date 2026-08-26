import { describe, expect, test } from "bun:test";
import { formatDeckText, parseDeckText, type DeckTextCard } from "../deck-text.ts";

const DECK: DeckTextCard[] = [
  { zone: "legend", quantity: 1, name: "Volibear", set_code: "OGN", collector_number: "001" },
  { zone: "main", quantity: 3, name: "Vayne", set_code: "OGN", collector_number: "100", is_champion: true },
  { zone: "main", quantity: 2, name: "Yordle Scout" },
  { zone: "sideboard", quantity: 1, name: "Brush", set_code: "UNL", collector_number: "T03" },
  { zone: "runes", quantity: 12, name: "Fury Rune" },
  { zone: "battlefields", quantity: 1, name: "Baron Pit", set_code: "OGN", collector_number: "SP3" },
  { zone: "considering", quantity: 1, name: "Poro" },
];

describe("formatDeckText", () => {
  test("writes a zone header per non-empty zone, in zone order", () => {
    expect(formatDeckText(DECK)).toBe(
      [
        "Legend",
        "1 Volibear (OGN) 001",
        "",
        "Main",
        "3 Vayne (OGN) 100 *CH*",
        "2 Yordle Scout",
        "",
        "Sideboard",
        "1 Brush (UNL) T03",
        "",
        "Runes",
        "12 Fury Rune",
        "",
        "Battlefields",
        "1 Baron Pit (OGN) SP3",
        "",
        "Considering",
        "1 Poro",
      ].join("\n"),
    );
  });

  test("emits nothing for an empty deck", () => {
    expect(formatDeckText([])).toBe("");
  });
});

describe("parseDeckText", () => {
  test("round-trips everything the formatter emits", () => {
    const parsed = parseDeckText(formatDeckText(DECK));
    expect(parsed.errors).toEqual([]);
    expect(parsed.cards.map(({ line, ...card }) => card)).toEqual(DECK);
  });

  test("round-trips a deck with no printing suffixes", () => {
    const plain: DeckTextCard[] = [
      { zone: "main", quantity: 4, name: "Yordle Scout" },
      { zone: "runes", quantity: 12, name: "Fury Rune" },
    ];
    const parsed = parseDeckText(formatDeckText(plain));
    expect(parsed.cards.map(({ line, ...card }) => card)).toEqual(plain);
  });

  test("reads a bare list as the main deck", () => {
    const parsed = parseDeckText("3 Vayne\n1 Poro");
    expect(parsed.errors).toEqual([]);
    expect(parsed.cards).toEqual([
      { line: 1, zone: "main", quantity: 3, name: "Vayne" },
      { line: 2, zone: "main", quantity: 1, name: "Poro" },
    ]);
  });

  test("accepts Moxfield and legacy zone headers", () => {
    const parsed = parseDeckText(
      ["Deck", "1 A", "Maybeboard:", "1 B", "Battlegrounds (3)", "1 C", "Main Deck", "1 D"].join("\n"),
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.cards.map((card) => card.zone)).toEqual([
      "main",
      "considering",
      "battlefields",
      "main",
    ]);
  });

  test("accepts the 3x quantity form and extra whitespace", () => {
    const parsed = parseDeckText("  Main  \n  3x   Yordle Scout   \n\n// a comment\n1 Poro");
    expect(parsed.errors).toEqual([]);
    expect(parsed.cards.map((card) => `${card.quantity} ${card.name}`)).toEqual([
      "3 Yordle Scout",
      "1 Poro",
    ]);
  });

  test("keeps the champion marker case-insensitively", () => {
    expect(parseDeckText("1 Vayne *ch*").cards[0]).toMatchObject({
      name: "Vayne",
      is_champion: true,
    });
  });

  test("reports bad lines and still returns the rest", () => {
    const parsed = parseDeckText(["Main", "3 Vayne", "not a card", "0 Poro", "2"].join("\n"));
    expect(parsed.cards.map((card) => card.name)).toEqual(["Vayne"]);
    expect(parsed.errors).toEqual([
      { line: 3, text: "not a card", message: expect.any(String) },
      { line: 4, text: "0 Poro", message: "Quantity must be a positive whole number." },
      { line: 5, text: "2", message: expect.any(String) },
    ]);
  });

  test("never throws on hostile input", () => {
    expect(() => parseDeckText("")).not.toThrow();
    expect(parseDeckText("").cards).toEqual([]);
    expect(() => parseDeckText("((()))\n\r\n\t")).not.toThrow();
  });

  test("keeps a set code with no collector number", () => {
    expect(parseDeckText("1 Brush (UNL)").cards[0]).toMatchObject({
      name: "Brush",
      set_code: "UNL",
    });
    expect(parseDeckText("1 Brush (UNL)").cards[0]?.collector_number).toBeUndefined();
  });
});
