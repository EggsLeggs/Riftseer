/**
 * Calls the Riftseer Elysia API to resolve card requests and builds the
 * Reddit reply string.
 *
 * The Devvit app does NOT embed provider logic — it delegates to the external
 * API.  This keeps the Devvit bundle small and the API as the single source
 * of truth for card data, fuzzy matching, and caching.
 */

import type { CardRequest } from "@riftseer/types";

// ─── API response types (mirror of Card shape from packages/core/src/types.ts) ──

interface ApiCard {
  id: string;
  name: string;
  set?: { set_code?: string };
  media?: {
    media_urls?: {
      normal?: string;
    };
  };
}

interface ApiResolvedCard {
  request: { raw: string; name: string; set?: string; collector?: string };
  card: ApiCard | null;
  matchType: "exact" | "fuzzy" | "not-found";
  score?: number;
}

interface ApiResolveResponse {
  count: number;
  results: ApiResolvedCard[];
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Resolve `requests` via the external API and build a Markdown reply.
 * Returns null if the API call fails or no cards could be resolved.
 */
export async function buildReply(
  requests: CardRequest[],
  apiBaseUrl: string,
  siteBaseUrl: string,
): Promise<string | null> {
  if (requests.length === 0) return null;

  const api = apiBaseUrl.replace(/\/$/, "");
  const site = siteBaseUrl.replace(/\/$/, "");

  // Send the raw token strings so the API re-parses them (handles [[Name|SET-123]] format)
  const rawStrings = requests.map((r) => r.raw);

  let data: ApiResolveResponse;
  try {
    const res = await fetch(`${api}/api/v1/cards/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: rawStrings }),
    });

    if (!res.ok) {
      console.error(`[Riftseer] API returned HTTP ${res.status}`);
      return null;
    }

    data = (await res.json()) as ApiResolveResponse;
  } catch (err) {
    console.error(`[Riftseer] API fetch failed: ${err}`);
    return null;
  }

  if (!data.results?.length) return null;

  const lines = data.results.map((r) => formatCard(r, site, api));

  return [
    ...lines,
    "",
    "---",
    `*[info](${site}/docs/reddit-bot)*`,
  ].join("\n");
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format one resolved card as a Reddit Markdown line.
 *
 * Found:      [Card Name](image) *(fuzzy: Actual Name)* — [(RS)](...), [(txt)](...)
 * Not found:  Card Name — not found.
 */
function formatCard(
  result: ApiResolvedCard,
  siteBase: string,
  apiBase: string,
): string {
  const displayName = result.request.name;

  if (!result.card) {
    return `${esc(displayName)} — not found.`;
  }

  const { id, name: cardName } = result.card;
  const imageUrl = result.card.media?.media_urls?.normal;
  const siteUrl = `${siteBase}/card/${id}`;
  const txtUrl = `${apiBase}/api/v1/cards/${id}/text`;

  const fuzzyNote =
    result.matchType === "fuzzy" ? ` *(fuzzy: ${esc(cardName)})*` : "";

  const namePart = imageUrl
    ? `[${esc(displayName)}](${imageUrl})`
    : esc(displayName);

  return `${namePart}${fuzzyNote} — [(RS)](${siteUrl}), [(txt)](${txtUrl})`;
}

function esc(text: string): string {
  return text.replace(/([[\]()\\*_`~])/g, "\\$1");
}
