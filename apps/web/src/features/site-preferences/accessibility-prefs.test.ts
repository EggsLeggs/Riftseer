import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SITE_ACCESSIBILITY_PREFS,
  parseStoredAccessibilityPrefs,
} from "./accessibility-prefs";

describe("parseStoredAccessibilityPrefs", () => {
  test("round-trips every field", () => {
    const prefs = {
      showCardNamesBelowSearch: true,
      preferTextOverSymbols: true,
      cardDetailView: "simple",
      cardResultsView: "table",
      deckListView: "stack",
      deckGroupMode: "energy",
      deckShowTags: false,
    } as const;
    expect(parseStoredAccessibilityPrefs(JSON.stringify(prefs))).toEqual(prefs);
  });

  test("an unknown deck view or grouping falls back to the default", () => {
    const parsed = parseStoredAccessibilityPrefs(
      JSON.stringify({ deckListView: "carousel", deckGroupMode: "vibes" }),
    );
    expect(parsed.deckListView).toBe(DEFAULT_SITE_ACCESSIBILITY_PREFS.deckListView);
    expect(parsed.deckGroupMode).toBe(DEFAULT_SITE_ACCESSIBILITY_PREFS.deckGroupMode);
  });

  test("a blob from before the deck fields existed still parses", () => {
    const parsed = parseStoredAccessibilityPrefs(JSON.stringify({ cardResultsView: "table" }));
    expect(parsed.cardResultsView).toBe("table");
    expect(parsed.deckListView).toBe("list");
    expect(parsed.deckGroupMode).toBe("type");
    expect(parsed.deckShowTags).toBe(true);
  });
});
