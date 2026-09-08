/**
 * Resolves card requests through the Riftseer API and builds the Reddit reply.
 *
 * The Devvit app carries no card data or matching of its own: the API is the
 * one source of truth for names, fuzzy matching and images, which also keeps
 * the Devvit bundle small.
 */

import type { CardRequest, ResolvedCard } from "@riftseer/types";
import { cardSiteUrl, normalizeSiteOrigin, printingImageUrl } from "@riftseer/types";
import { createRiftseerClient } from "@riftseer/types/client";

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Resolve `requests` via the API and build a Markdown reply.
 * Returns null if the API call fails or no cards could be resolved.
 */
export async function buildReply(
  requests: CardRequest[],
  apiBaseUrl: string,
  siteBaseUrl: string,
): Promise<string | null> {
  if (requests.length === 0) return null;

  const api = normalizeSiteOrigin(apiBaseUrl);
  const client = createRiftseerClient({ baseUrl: api });

  // Preserve the token contents so the API can choose a requested printing,
  // including prefixed collector tracks such as VEN-SP3 and OGN-T03.
  const result = await client.cards.resolve({ requests: requests.map((r) => r.raw) });
  if (!result.ok) {
    // Status 0 is the client's own code for a request that never reached the
    // API. Only the status and code are logged: the message can be a raw
    // response body, and a bounded log line is enough to diagnose the failure.
    console.error(`[Riftseer] resolve failed: HTTP ${result.status} ${result.error.code}`);
    return null;
  }

  if (result.data.results.length === 0) return null;

  const lines = result.data.results.map((r) => formatCard(r, siteBaseUrl, api));

  return [
    ...lines,
    "",
    "---",
    `*[info](${normalizeSiteOrigin(siteBaseUrl)}/docs/reddit-bot)*`,
  ].join("\n");
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format one resolved card as a Reddit Markdown line.
 *
 * Found:      [Card Name](image) *(fuzzy: Actual Name)* — [(RS)](...), [(txt)](...)
 * Not found:  Card Name — not found.
 */
function formatCard(result: ResolvedCard, siteBase: string, apiBase: string): string {
  const displayName = result.request.name;

  if (!result.oracle) {
    return `${esc(displayName)} — not found.`;
  }

  const { id, name: cardName } = result.oracle;
  const imageUrl = printingImageUrl(result.printing, "normal");
  const siteUrl = cardSiteUrl(result.oracle, result.printing, siteBase);
  const txtUrl = `${apiBase}/api/v1/cards/${id}/text`;

  const fuzzyNote = result.matchType === "fuzzy" ? ` *(fuzzy: ${esc(cardName)})*` : "";

  const namePart = imageUrl ? `[${esc(displayName)}](${imageUrl})` : esc(displayName);

  return `${namePart}${fuzzyNote} — [(RS)](${siteUrl}), [(txt)](${txtUrl})`;
}

function esc(text: string): string {
  return text.replace(/([[\]()\\*_`~])/g, "\\$1");
}
