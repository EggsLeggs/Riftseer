import type { Card, CardDetail } from "@riftseer/types";
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

/** Hard ceiling enforced by the API/provider; we never request more than this per page. */
const MAX_SEARCH_LIMIT = 100;

export interface SearchByNameOptions {
  /** Page size. Clamped to [1, 100] by the API. */
  limit?: number;
  /** 0-based offset into the ranked result set. */
  offset?: number;
  /** Pass false to disable fuzzy/autocomplete fallback. Default: true. */
  fuzzy?: boolean;
  /** When true, includes price fields (USD/EUR sources) in each card. Default: false. */
  includePrices?: boolean;
  /**
   * Optional explicit type filter. Merged with the typed query as `AND t:value`
   * by the API. Wired up here so future UI chips can plug in without re-routing.
   */
  type?: string;
  /** Optional explicit artist filter (`AND a:value`). */
  artist?: string;
  /** Optional explicit rarity filter (`AND r:value`). */
  rarity?: string;
  /** Set code filter (`AND set:OGN`). Passed as `?set=` URL param. */
  set?: string;
  /** When true, skip deduplication and return all printings. */
  unique?: boolean;
}

export interface SearchByNameResult {
  /** Cards returned in this page. */
  count: number;
  cards: Card[];
  /** Total matches for the query (all pages). */
  total: number;
  offset: number;
  limit: number;
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

  /**
   * Fetch the card page payload — card plus expanded printings, tokens and
   * related cards. Pass either an `id` or `slug` segments; the API does all the
   * sorting and deduplication. Returns null on 404.
   */
  async getDetail(
    target: { id: string } | { slug: string[] },
  ): Promise<CardDetail | null> {
    const query =
      "id" in target
        ? { id: target.id, include: "prices" }
        : { slug: target.slug.join("/"), include: "prices" };
    try {
      const { data, error, status } = await cardsClient.api.v1.cards.detail.get({
        query,
        fetch: requestFetchInit(),
      });
      if (error != null) {
        if (status === 404) return null;
        throw new CardApiError(`Riftseer API ${status}`, "http", status);
      }
      return data as CardDetail;
    } catch (err) {
      handleRequestFailure(err);
    }
  },

  /**
   * Full-text card name search. Backed by `GET /api/v1/cards?name=…&limit=&offset=`.
   * Returns empty result for whitespace-only queries (the API 400s without `name`).
   */
  async searchByName(
    name: string,
    opts: SearchByNameOptions = {},
  ): Promise<SearchByNameResult> {
    const trimmed = name.trim();
    if (!trimmed) {
      return {
        count: 0,
        cards: [],
        total: 0,
        offset: 0,
        limit: Math.min(Math.max(Math.floor(opts.limit ?? 10), 1), MAX_SEARCH_LIMIT),
      };
    }
    const limit = Math.min(
      Math.max(Math.floor(opts.limit ?? 10), 1),
      MAX_SEARCH_LIMIT,
    );
    const offset = Math.max(0, Math.floor(opts.offset ?? 0));
    try {
      const { data, error, status } = await cardsClient.api.v1.cards.get({
        query: {
          name: trimmed,
          limit: String(limit),
          offset: String(offset),
          fuzzy: opts.fuzzy === false ? "false" : undefined,
          include: opts.includePrices ? "prices" : undefined,
          type: opts.type?.trim() || undefined,
          artist: opts.artist?.trim() || undefined,
          rarity: opts.rarity?.trim() || undefined,
          set: opts.set?.trim() || undefined,
          unique: opts.unique ? "prints" : undefined,
        },
        fetch: requestFetchInit(),
      });
      if (error != null) {
        const detail =
          typeof (error as Record<string, unknown>)?.error === "string"
            ? (error as Record<string, unknown>).error as string
            : undefined;
        throw new CardApiError(`Riftseer API ${status}`, "http", status, detail);
      }
      return data as SearchByNameResult;
    } catch (err) {
      handleRequestFailure(err);
    }
  },

  /**
   * Fetch all cards for a set (all printings, sorted by collector number).
   * Backed by `GET /api/v1/cards?set=CODE&limit=2000`.
   */
  async getSetCards(
    setCode: string,
    opts: { includePrices?: boolean } = {},
  ): Promise<SearchByNameResult> {
    try {
      const { data, error, status } = await cardsClient.api.v1.cards.get({
        query: {
          set: setCode.toUpperCase(),
          limit: "2000",
          include: opts.includePrices ? "prices" : undefined,
        },
        fetch: requestFetchInit(),
      });
      if (error != null) {
        throw new CardApiError(`Riftseer API ${status}`, "http", status);
      }
      const result = data as { count: number; cards: Card[] };
      return { count: result.count, cards: result.cards, total: result.count, offset: 0, limit: 2000 };
    } catch (err) {
      handleRequestFailure(err);
    }
  },

  /**
   * Browse all cards paginated (no search term required).
   * Backed by `GET /api/v1/cards?browse=all`.
   */
  async browseAll(
    opts: { limit?: number; offset?: number; includePrices?: boolean } = {},
  ): Promise<SearchByNameResult> {
    const limit = Math.min(Math.max(Math.floor(opts.limit ?? 60), 1), MAX_SEARCH_LIMIT);
    const offset = Math.max(0, Math.floor(opts.offset ?? 0));
    try {
      const { data, error, status } = await cardsClient.api.v1.cards.get({
        query: {
          browse: "all",
          limit: String(limit),
          offset: String(offset),
          include: opts.includePrices ? "prices" : undefined,
        },
        fetch: requestFetchInit(),
      });
      if (error != null) {
        throw new CardApiError(`Riftseer API ${status}`, "http", status);
      }
      return data as SearchByNameResult;
    } catch (err) {
      handleRequestFailure(err);
    }
  },

  /** Fetch a random card. Returns null when no cards exist. */
  async getRandom(): Promise<Card | null> {
    return getJsonFromTreaty(() =>
      cardsClient.api.v1.cards.random.get({ fetch: requestFetchInit() }),
    );
  },
};

/** Absolute API URLs for the copy-pasteable exports offered on the card page. */
export const cardExportUrls = {
  text: (id: string) => `${API_BASE}/api/v1/cards/${encodeURIComponent(id)}/text`,
  json: (id: string) => `${API_BASE}/api/v1/cards/${encodeURIComponent(id)}?include=prices`,
};

/**
 * Fetch a card export (see {@link cardExportUrls}) as raw text for the clipboard.
 * Uses the shared no-store + timeout init so a hung request can't wedge the UI.
 */
export async function fetchCardExportText(url: string): Promise<string> {
  const res = await fetch(url, requestFetchInit());
  if (!res.ok) throw new CardApiError(`Riftseer API ${res.status}`, "http", res.status);
  return res.text();
}

/** TanStack Query keys for card fetches. */
export const cardsQueryKeys = {
  all: ["cards"] as const,
  /**
   * Admin relationship picker lookups. Lives here, under the `all` prefix, so
   * card mutations invalidate it like every other card read — a key owned by
   * the panel and prefixed with `admin` would never have matched.
   */
  relationshipSearch: (name: string) =>
    ["cards", "relationship-search", name] as const,
  detail: (target: { id: string } | { slug: string[] }) =>
    [
      "cards",
      "detail",
      "id" in target ? `id:${target.id}` : `slug:${target.slug.join("/")}`,
    ] as const,
  search: (
    name: string,
    limit: number,
    offset: number,
    includePrices = false,
    extras: Pick<SearchByNameOptions, "type" | "artist" | "rarity" | "set" | "unique"> = {},
  ) =>
    [
      "cards",
      "search",
      name,
      limit,
      offset,
      includePrices,
      extras.type ?? "",
      extras.artist ?? "",
      extras.rarity ?? "",
      extras.set ?? "",
      extras.unique ?? false,
    ] as const,
  setCards: (setCode: string, includePrices = false) =>
    ["cards", "set", setCode, includePrices] as const,
  browse: (limit: number, offset: number, includePrices = false) =>
    ["cards", "browse", limit, offset, includePrices] as const,
};
