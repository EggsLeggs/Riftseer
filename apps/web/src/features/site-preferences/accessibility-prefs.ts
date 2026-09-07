/** Persisted only when the user has granted functional cookies (c15t). */
export const SITE_ACCESSIBILITY_STORAGE_KEY = "riftseer.prefs.accessibility";

export const CARD_DETAIL_VIEW_OPTIONS = ["detailed", "simple"] as const;
export type CardDetailViewPreference = (typeof CARD_DETAIL_VIEW_OPTIONS)[number];

export const CARD_RESULTS_VIEW_OPTIONS = ["details", "images", "table"] as const;
export type CardResultsViewPreference = (typeof CARD_RESULTS_VIEW_OPTIONS)[number];

export const DECK_LIST_VIEW_OPTIONS = ["list", "grid", "stack"] as const;
export type DeckListViewPreference = (typeof DECK_LIST_VIEW_OPTIONS)[number];

export const DECK_GROUP_MODE_OPTIONS = ["type", "domain", "energy"] as const;
export type DeckGroupModePreference = (typeof DECK_GROUP_MODE_OPTIONS)[number];

export type SiteAccessibilityPreferences = {
  /** When true, card search grid shows names under thumbnails instead of selectable overlay text on art. */
  showCardNamesBelowSearch: boolean;
  /**
   * When true, places where icons stand in for words or costs show plain
   * labels (`Exhaust`, `3 Energy`, …) instead of glyphs.
   */
  preferTextOverSymbols: boolean;
  /** Default layout for individual card pages. */
  cardDetailView: CardDetailViewPreference;
  /** Default layout for card gallery / search / set browse grids. */
  cardResultsView: CardResultsViewPreference;
  /** Default layout for the deck page's card list. */
  deckListView: DeckListViewPreference;
  /** Default grouping for the deck page's card list. */
  deckGroupMode: DeckGroupModePreference;
  /** Whether card tags show on deck rows. */
  deckShowTags: boolean;
};

export const DEFAULT_SITE_ACCESSIBILITY_PREFS: SiteAccessibilityPreferences = {
  showCardNamesBelowSearch: false,
  preferTextOverSymbols: false,
  cardDetailView: "detailed",
  cardResultsView: "images",
  deckListView: "list",
  deckGroupMode: "type",
  deckShowTags: true,
};

function parseDetailView(raw: unknown): CardDetailViewPreference {
  if (typeof raw === "string" && (CARD_DETAIL_VIEW_OPTIONS as readonly string[]).includes(raw)) {
    return raw as CardDetailViewPreference;
  }
  return DEFAULT_SITE_ACCESSIBILITY_PREFS.cardDetailView;
}

function parseResultsView(raw: unknown): CardResultsViewPreference {
  if (typeof raw === "string" && (CARD_RESULTS_VIEW_OPTIONS as readonly string[]).includes(raw)) {
    return raw as CardResultsViewPreference;
  }
  return DEFAULT_SITE_ACCESSIBILITY_PREFS.cardResultsView;
}

function parseDeckListView(raw: unknown): DeckListViewPreference {
  if (typeof raw === "string" && (DECK_LIST_VIEW_OPTIONS as readonly string[]).includes(raw)) {
    return raw as DeckListViewPreference;
  }
  return DEFAULT_SITE_ACCESSIBILITY_PREFS.deckListView;
}

function parseDeckGroupMode(raw: unknown): DeckGroupModePreference {
  if (typeof raw === "string" && (DECK_GROUP_MODE_OPTIONS as readonly string[]).includes(raw)) {
    return raw as DeckGroupModePreference;
  }
  return DEFAULT_SITE_ACCESSIBILITY_PREFS.deckGroupMode;
}

export function parseStoredAccessibilityPrefs(raw: string | null): SiteAccessibilityPreferences {
  if (!raw) return { ...DEFAULT_SITE_ACCESSIBILITY_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<SiteAccessibilityPreferences>;
    return {
      showCardNamesBelowSearch:
        typeof parsed.showCardNamesBelowSearch === "boolean"
          ? parsed.showCardNamesBelowSearch
          : DEFAULT_SITE_ACCESSIBILITY_PREFS.showCardNamesBelowSearch,
      preferTextOverSymbols:
        typeof parsed.preferTextOverSymbols === "boolean"
          ? parsed.preferTextOverSymbols
          : DEFAULT_SITE_ACCESSIBILITY_PREFS.preferTextOverSymbols,
      cardDetailView: parseDetailView(parsed.cardDetailView),
      cardResultsView: parseResultsView(parsed.cardResultsView),
      deckListView: parseDeckListView(parsed.deckListView),
      deckGroupMode: parseDeckGroupMode(parsed.deckGroupMode),
      deckShowTags:
        typeof parsed.deckShowTags === "boolean"
          ? parsed.deckShowTags
          : DEFAULT_SITE_ACCESSIBILITY_PREFS.deckShowTags,
    };
  } catch {
    return { ...DEFAULT_SITE_ACCESSIBILITY_PREFS };
  }
}

export function readAccessibilityPrefsFromStorage(): SiteAccessibilityPreferences {
  try {
    return parseStoredAccessibilityPrefs(
      typeof window !== "undefined"
        ? window.localStorage.getItem(SITE_ACCESSIBILITY_STORAGE_KEY)
        : null,
    );
  } catch {
    return { ...DEFAULT_SITE_ACCESSIBILITY_PREFS };
  }
}

export function writeAccessibilityPrefsToStorage(prefs: SiteAccessibilityPreferences) {
  try {
    window.localStorage.setItem(SITE_ACCESSIBILITY_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore quota / private mode failures.
  }
}

export function clearAccessibilityPrefsStorage() {
  try {
    window.localStorage.removeItem(SITE_ACCESSIBILITY_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
