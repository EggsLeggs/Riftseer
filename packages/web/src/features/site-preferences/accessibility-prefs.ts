/** Persisted only when the user has granted functional cookies (c15t). */
export const SITE_ACCESSIBILITY_STORAGE_KEY = "riftseer.prefs.accessibility";

export type SiteAccessibilityPreferences = {
  /** When true, card search grid shows names under thumbnails instead of selectable overlay text on art. */
  showCardNamesBelowSearch: boolean;
};

export const DEFAULT_SITE_ACCESSIBILITY_PREFS: SiteAccessibilityPreferences = {
  showCardNamesBelowSearch: false,
};

export function parseStoredAccessibilityPrefs(
  raw: string | null,
): SiteAccessibilityPreferences {
  if (!raw) return { ...DEFAULT_SITE_ACCESSIBILITY_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<SiteAccessibilityPreferences>;
    if (typeof parsed.showCardNamesBelowSearch !== "boolean") {
      return { ...DEFAULT_SITE_ACCESSIBILITY_PREFS };
    }
    return {
      showCardNamesBelowSearch: parsed.showCardNamesBelowSearch,
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
