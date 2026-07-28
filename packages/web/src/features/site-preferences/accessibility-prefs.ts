/** Persisted only when the user has granted functional cookies (c15t). */
export const SITE_ACCESSIBILITY_STORAGE_KEY = "riftseer.prefs.accessibility";

export const CARD_DETAIL_VIEW_OPTIONS = ["detailed", "simple"] as const;
export type CardDetailViewPreference = (typeof CARD_DETAIL_VIEW_OPTIONS)[number];

export const CARD_RESULTS_VIEW_OPTIONS = ["details", "images", "table"] as const;
export type CardResultsViewPreference = (typeof CARD_RESULTS_VIEW_OPTIONS)[number];

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
};

export const DEFAULT_SITE_ACCESSIBILITY_PREFS: SiteAccessibilityPreferences = {
  showCardNamesBelowSearch: false,
  preferTextOverSymbols: false,
  cardDetailView: "detailed",
  cardResultsView: "images",
};

function parseDetailView(raw: unknown): CardDetailViewPreference {
  if (
    typeof raw === "string" &&
    (CARD_DETAIL_VIEW_OPTIONS as readonly string[]).includes(raw)
  ) {
    return raw as CardDetailViewPreference;
  }
  return DEFAULT_SITE_ACCESSIBILITY_PREFS.cardDetailView;
}

function parseResultsView(raw: unknown): CardResultsViewPreference {
  if (
    typeof raw === "string" &&
    (CARD_RESULTS_VIEW_OPTIONS as readonly string[]).includes(raw)
  ) {
    return raw as CardResultsViewPreference;
  }
  return DEFAULT_SITE_ACCESSIBILITY_PREFS.cardResultsView;
}

export function parseStoredAccessibilityPrefs(
  raw: string | null,
): SiteAccessibilityPreferences {
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

export function writeAccessibilityPrefsToStorage(
  prefs: SiteAccessibilityPreferences,
) {
  try {
    window.localStorage.setItem(
      SITE_ACCESSIBILITY_STORAGE_KEY,
      JSON.stringify(prefs),
    );
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
