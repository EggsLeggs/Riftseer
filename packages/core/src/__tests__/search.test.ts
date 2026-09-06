import { describe, expect, test } from "bun:test";
import { normalizeCardName } from "../normalize.ts";
import { autocompleteSearch, rankIds, scoreCard, type Nameable } from "../search.ts";

const card = (name: string, id = name): Nameable => ({ id, name, name_normalized: normalizeCardName(name) });

describe("name search ranking", () => {
  test("uses one ordered score tier for each matching rule", () => {
    const query = "bard";
    expect([
      scoreCard(card("Bard"), query, 4)?.score,
      scoreCard(card("Bardic Shot"), query, 4)?.score,
      scoreCard(card("The Bard"), query, 4)?.score,
      scoreCard(card("Disbard"), query, 4)?.score,
      scoreCard(card("Barg"), query, 4)?.score,
    ]).toEqual([1000, 900, 790, 694, 150]);
  });

  test("short queries enable only their permitted tiers", () => {
    expect(scoreCard(card("Cannon Barrage"), "b", 1)).toBeNull();
    expect(scoreCard(card("Cannon Barrage"), "ba", 2)?.score).toBe(790);
    expect(scoreCard(card("Singularity"), "bar", 3)).toBeNull();
    expect(scoreCard(card("Bard"), "brd", 3)).toBeNull();
  });

  test("fuzzy matching permits one short-query edit and two long-query edits", () => {
    expect(scoreCard(card("Bard"), "barg", 4)?.score).toBe(150);
    expect(scoreCard(card("Sun Disc"), "sun dsic", 8)?.score).toBe(100);
    expect(scoreCard(card("Bard"), "zzzz", 4)).toBeNull();
  });

  test("ranks direct matches ahead of later-word and fuzzy matches", () => {
    const cards = [card("Cannon Barrage"), card("Barg"), card("Bard"), card("Barrow Stinger")];
    expect(autocompleteSearch(cards, "bard", 10).map(({ name }) => name)).toEqual(["Bard", "Barg"]);
    expect(autocompleteSearch(cards, "bar", 10).map(({ name }) => name)).toEqual([
      "Bard",
      "Barg",
      "Barrow Stinger",
      "Cannon Barrage",
    ]);
  });

  test("breaks equal scores by position, length, then alphabetically", () => {
    const cards = [card("Bard B"), card("Bard A"), card("Bar"), card("Long Bard")];
    expect(autocompleteSearch(cards, "bar", 10).map(({ name }) => name)).toEqual([
      "Bar",
      "Bard A",
      "Bard B",
      "Long Bard",
    ]);
  });

  test("deduplicates ids, honors a safe integer limit, and rejects empty queries", () => {
    expect(rankIds([card("Bard", "same"), card("Bard Prime", "same"), card("Barrow")], "bar", 10)).toEqual([
      "Barrow",
      "same",
    ]);
    expect(rankIds([card("Bard"), card("Barrow")], "bar", 1.9)).toHaveLength(1);
    expect(rankIds([card("Bard")], "bar", -1)).toEqual([]);
    expect(rankIds([card("Bard")], "   ", 10)).toEqual([]);
  });

  test("normalization makes punctuation-equivalent exact matches", () => {
    expect(autocompleteSearch([card("Kai-Sa")], "Kai Sa", 1)[0]?.name).toBe("Kai-Sa");
  });
});
