/**
 * Calls the RiftSeer Elysia API to resolve card requests and builds the
 * Reddit reply string.
 *
 * The Devvit app does NOT embed provider logic — it delegates to the external
 * API.  This keeps the Devvit bundle small and the API as the single source
 * of truth for card data, fuzzy matching, and caching.
 */

import type { CardRequest } from "./parser.js";

// ─── API response types (mirror of packages/core/src/types.ts, without raw) ──

interface ApiCard {
  id: string;
  name: string;
  setCode?: string;
  collectorNumber?: string;
  imageUrl?: string;
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
  siteBaseUrl: string
): Promise<string | null> {
  if (requests.length === 0) return null;

  const api = apiBaseUrl.replace(/\/$/, "");
  const site = siteBaseUrl.replace(/\/$/, "");

  // Send the raw token strings so the API re-parses them (handles [[Name|SET-123]] format)
  const rawStrings = requests.map((r) => r.raw);

  let data: ApiResolveResponse;
  try {
    const res = await fetch(`${api}/api/v1/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: rawStrings }),
    });

    if (!res.ok) {
      console.error(`[RiftSeer] API returned HTTP ${res.status}`);
      return null;
    }

    data = (await res.json()) as ApiResolveResponse;
  } catch (err) {
    console.error(`[RiftSeer] API fetch failed: ${err}`);
    return null;
  }

  if (!data.results?.length) return null;

  const lines = data.results.map((r) => formatCard(r, api, site));

  return [
    ...lines,
    "",
    "---",
    "*^(I am a bot | Riftbound card data via [RiftCodex](https://riftcodex.com))*",
  ].join("\n");
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format one resolved card as a Reddit Markdown line.
 *
 * Found:      **[Card Name](imgUrl)** — [img](...), [api](...), [site](...), [txt](...)
 * Not found:  **Card Name** — not found.
 * Fuzzy:      **[Card Name](imgUrl)** *(fuzzy: Actual Name)* — ...
 */
function formatCard(result: ApiResolvedCard, apiBase: string, siteBase: string): string {
  const displayName = result.request.name;

  if (!result.card) {
    return `**${esc(displayName)}** — not found.`;
  }

  const { id, name: cardName, imageUrl } = result.card;
  const img = imageUrl ?? "";
  const apiUrl = `${apiBase}/api/v1/cards/${id}`;
  const siteUrl = `${siteBase}/card/${id}`;
  const txtUrl = `${siteBase}/card/${id}/text`;

  const nameLink = img ? `[${esc(displayName)}](${img})` : esc(displayName);
  const fuzzyNote =
    result.matchType === "fuzzy" ? ` *(fuzzy: ${esc(cardName)})*` : "";

  return (
    `**${nameLink}**${fuzzyNote} — ` +
    (img ? `[img](${img}), ` : "") +
    `[api](${apiUrl}), [site](${siteUrl}), [txt](${txtUrl})`
  );
}

function esc(text: string): string {
  return text.replace(/([[\]()\\*_`~])/g, "\\$1");
}
