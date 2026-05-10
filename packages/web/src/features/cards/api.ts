import type { Card } from "@riftseer/types";
import { env } from "@/lib/env";

import { CardApiError } from "./errors";

export { CardApiError } from "./errors";

const API_BASE = env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");

/** Default ceiling so a hung API / DB never leaves the page spinning forever. */
const DEFAULT_FETCH_TIMEOUT_MS = 12_000;

async function getJson<T>(url: string): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new CardApiError(
        `Request timed out after ${DEFAULT_FETCH_TIMEOUT_MS}ms`,
        "timeout",
      );
    }
    throw new CardApiError(
      err instanceof Error ? err.message : String(err),
      "network",
    );
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new CardApiError(
      `Riftseer API ${res.status} ${res.statusText}`,
      "http",
      res.status,
    );
  }
  return (await res.json()) as T;
}

export const cardsApi = {
  /** Fetch a card by its stable id. Returns null on 404. */
  async getById(id: string): Promise<Card | null> {
    const safe = encodeURIComponent(id);
    return getJson<Card>(`${API_BASE}/api/v1/cards/${safe}`);
  },

  /**
   * Fetch a card by its persisted public_slug — segments joined by `/`,
   * e.g. ["ogn","12a","sun-disc"] → /api/v1/cards/by-slug/ogn/12a/sun-disc.
   */
  async getByPublicSlug(segments: string[]): Promise<Card | null> {
    const path = segments
      .map((s) => encodeURIComponent(s))
      .join("/");
    return getJson<Card>(`${API_BASE}/api/v1/cards/by-slug/${path}`);
  },
};
