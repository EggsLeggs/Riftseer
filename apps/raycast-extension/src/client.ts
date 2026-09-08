import { getPreferenceValues } from "@raycast/api";
import { createRiftseerClient } from "@riftseer/types";

/**
 * The typed API client, pointed at the user's configured API origin, and the
 * site origin card links open on. Both are Raycast preferences.
 */
export function riftseer() {
  const prefs = getPreferenceValues<Preferences>();
  return {
    client: createRiftseerClient({ baseUrl: prefs.apiBaseUrl }),
    siteBaseUrl: prefs.siteBaseUrl,
    maxRecentHistory: prefs.maxRecentHistory,
  };
}
