import "server-only";
import { cache } from "react";

import { getSession } from "@/lib/session";
import { decksApi } from "./api";
import { decksServerApi } from "./server-api";
import type { DeckDetail } from "./types";

/**
 * The deck as *this* viewer sees it, for a server component.
 *
 * Two paths, because the two reads are genuinely different: a signed-in caller
 * must send their token or a deck shared with them answers 404, and an
 * anonymous caller has no token to send but may still hold the link to an
 * unlisted deck.
 *
 * `cache()` so `generateMetadata` and the page share one request, matching the
 * card route. `null` means "no deck for you" — a deck the caller may not read
 * answers 404, and the page must not distinguish that from "no such deck".
 */
export const loadDeckForViewer = cache(async (id: string): Promise<DeckDetail | null> => {
  const session = await getSession();
  if (!session) return decksApi.getDeck(id).catch(() => null);
  const result = await decksServerApi.getDeck(session.accessToken, id);
  return result.ok ? result.data : null;
});
