"use client";

import * as React from "react";
import { useConsentManager } from "@c15t/nextjs";

import {
  clearAccessibilityPrefsStorage,
  DEFAULT_SITE_ACCESSIBILITY_PREFS,
  readAccessibilityPrefsFromStorage,
  type SiteAccessibilityPreferences,
  writeAccessibilityPrefsToStorage,
} from "./accessibility-prefs";

type SitePreferencesContextValue = {
  /** Effective preference for UI. Falls back to defaults when functional cookies are off. */
  accessibility: SiteAccessibilityPreferences;
  /** Whether preferences may be read from and written to browser storage. */
  canPersistAccessibility: boolean;
  /** Whether consent state has finished loading. */
  consentReady: boolean;
  patchAccessibility: (
    patch: Partial<SiteAccessibilityPreferences>,
  ) => void;
};

const SitePreferencesContext = React.createContext<
  SitePreferencesContextValue | undefined
>(undefined);

export function SitePreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { has, hasFetchedBanner } = useConsentManager();
  const canPersistAccessibility =
    hasFetchedBanner && has("functionality");

  const [accessibility, setAccessibility] =
    React.useState<SiteAccessibilityPreferences>(DEFAULT_SITE_ACCESSIBILITY_PREFS);

  React.useEffect(() => {
    if (!hasFetchedBanner) return;

    if (!canPersistAccessibility) {
      clearAccessibilityPrefsStorage();
      setAccessibility({ ...DEFAULT_SITE_ACCESSIBILITY_PREFS });
      return;
    }

    setAccessibility(readAccessibilityPrefsFromStorage());
  }, [canPersistAccessibility, hasFetchedBanner]);

  const patchAccessibility = React.useCallback(
    (patch: Partial<SiteAccessibilityPreferences>) => {
      if (!hasFetchedBanner || !has("functionality")) return;

      setAccessibility((prev) => {
        const next = { ...prev, ...patch };
        writeAccessibilityPrefsToStorage(next);
        return next;
      });
    },
    [has, hasFetchedBanner],
  );

  const value = React.useMemo(
    () =>
      ({
        accessibility,
        canPersistAccessibility,
        consentReady: hasFetchedBanner,
        patchAccessibility,
      }) satisfies SitePreferencesContextValue,
    [
      accessibility,
      canPersistAccessibility,
      hasFetchedBanner,
      patchAccessibility,
    ],
  );

  return (
    <SitePreferencesContext.Provider value={value}>
      {children}
    </SitePreferencesContext.Provider>
  );
}

export function useSitePreferences() {
  const ctx = React.useContext(SitePreferencesContext);
  if (!ctx) {
    throw new Error("useSitePreferences must be used within SitePreferencesProvider");
  }
  return ctx;
}
