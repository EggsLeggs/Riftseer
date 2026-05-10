import type { Card } from "@riftseer/types";
import { env } from "@/lib/env";
import { createApiClient } from "@/lib/api/client";

import { CardApiError } from "./errors";

export { CardApiError } from "./errors";

/** Default ceiling so a hung API / DB never leaves the page spinning forever. */
const DEFAULT_FETCH_TIMEOUT_MS = 12_000;

const cardsClient = createApiClient();

const API_BASE = env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");

function requestFetchInit(): RequestInit {
  return {
    cache: "no-store",
    signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS),
  };
}

function handleRequestFailure(err: unknown): never {
  if (err instanceof CardApiError) throw err;
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

/** Eden-backed GET; used where Treaty builds correct paths (e.g. `/cards/:id`). */
async function getJsonFromTreaty(
  run: () => Promise<{ data: unknown; error: unknown; status: number }>,
): Promise<Card | null> {
  try {
    const { data, error, status } = await run();
    if (error != null) {
      if (status === 404) return null;
      throw new CardApiError(`Riftseer API ${status}`, "http", status);
    }
    return data as Card;
  } catch (err) {
    handleRequestFailure(err);
  }
}

/**
 * Raw GET for `/cards/by-slug/…`: Eden Treaty currently resolves wildcard slug
 * routes to a path containing a literal `*` segment, which this API does not
 * serve — keep fetch here until that client mapping matches the Worker router.
 */
async function getJsonFromFetch(url: string): Promise<Card | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      ...requestFetchInit(),
    });
  } catch (err) {
    handleRequestFailure(err);
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new CardApiError(
      `Riftseer API ${res.status} ${res.statusText}`,
      "http",
      res.status,
    );
  }
  return (await res.json()) as Card;
}

export const cardsApi = {
  /** Fetch a card by its stable id. Returns null on 404. */
  async getById(id: string): Promise<Card | null> {
    const safe = encodeURIComponent(id);
    return getJsonFromTreaty(() =>
      cardsClient.api.v1.cards({ id: safe }).get({ fetch: requestFetchInit() }),
    );
  },

  /**
   * Fetch a card by its persisted public_slug — segments joined by `/`,
   * e.g. ["ogn","12a","sun-disc"] → /api/v1/cards/by-slug/ogn/12a/sun-disc.
   */
  async getByPublicSlug(segments: string[]): Promise<Card | null> {
    const path = segments.map((s) => encodeURIComponent(s)).join("/");
    return getJsonFromFetch(`${API_BASE}/api/v1/cards/by-slug/${path}`);
  },
};
