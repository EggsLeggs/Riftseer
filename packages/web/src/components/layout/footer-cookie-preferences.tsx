"use client";

import { ConsentDialogLink, useConsentManager } from "@c15t/nextjs";

/**
 * Footer link to reopen the cookie preference dialog.
 * Shown only where c15t assigns a regulated jurisdiction (not `NONE`), i.e. where
 * users get a meaningful CMP / cookie choice flow—not in “rest of world” regions.
 */
export function FooterCookiePreferencesLink() {
  const { locationInfo, hasFetchedBanner, isLoadingConsentInfo } = useConsentManager();

  const jurisdiction = locationInfo?.jurisdiction;
  const canChooseCookies =
    !isLoadingConsentInfo &&
    hasFetchedBanner &&
    jurisdiction != null &&
    jurisdiction !== "NONE";

  if (!canChooseCookies) {
    return null;
  }

  return (
    <ConsentDialogLink className="text-muted-foreground transition-colors hover:text-foreground hover:underline underline-offset-4">
      Cookie preferences
    </ConsentDialogLink>
  );
}
