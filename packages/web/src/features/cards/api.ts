import type { Oracle, OracleDetail, Printing } from "@riftseer/types";
import { env } from "@/lib/env";
import { createApiClient } from "@/lib/api/client";

import { CardApiError } from "./errors";

export { CardApiError } from "./errors";

const DEFAULT_FETCH_TIMEOUT_MS = 12_000;
const MAX_SEARCH_LIMIT = 100;

const cardsClient = createApiClient();
const API_BASE = env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");

export interface CardResult {
  oracle: Oracle;
  printing: Printing;
}

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

async function getJsonFromTreaty<T>(
  run: () => Promise<{ data: unknown; error: unknown; status: number }>,
): Promise<T | null> {
  try {
    const { data, error, status } = await run();
    if (error != null) {
      if (status === 404) return null;
      throw new CardApiError(`Riftseer API ${status}`, "http", status);
    }
    return data as T;
  } catch (err) {
    handleRequestFailure(err);
  }
}

/**
 * Eden Treaty maps this wildcard route to a literal `*` path segment. Keep the
 * raw fetch until its route mapping matches the Worker router.
 */
async function getJsonFromSlugFetch(url: string): Promise<Oracle | null> {
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
  return (await res.json()) as Oracle;
}

function oracleResult(oracle: Oracle): CardResult | null {
  return oracle.preferred_printing
    ? { oracle, printing: oracle.preferred_printing }
    : null;
}

async function hydratePrintings(printings: Printing[]): Promise<CardResult[]> {
  const owners = new Map<string, Promise<Oracle | null>>();
  const ownerFor = (oracleId: string) => {
    const existing = owners.get(oracleId);
    if (existing) return existing;
    const request = cardsApi.getOracle(oracleId);
    owners.set(oracleId, request);
    return request;
  };

  const results = await Promise.all(
    printings.map(async (printing) => {
      const oracle = await ownerFor(printing.oracle_id);
      return oracle ? { oracle, printing } : null;
    }),
  );
  return results.filter((result): result is CardResult => result != null);
}

export interface SearchByNameOptions {
  limit?: number;
  offset?: number;
  fuzzy?: boolean;
  includePrices?: boolean;
  type?: string;
  artist?: string;
  rarity?: string;
  set?: string;
  /** Return every matching physical printing rather than one row per oracle. */
  unique?: boolean;
}

export interface SearchByNameResult {
  count: number;
  cards: CardResult[];
  total: number;
  offset: number;
  limit: number;
}

export const cardsApi = {
  async getOracle(id: string): Promise<Oracle | null> {
    const safe = encodeURIComponent(id);
    return getJsonFromTreaty<Oracle>(() =>
      cardsClient.api.v1.cards({ id: safe }).get({ fetch: requestFetchInit() }),
    );
  },

  async getPrinting(id: string): Promise<Printing | null> {
    const safe = encodeURIComponent(id);
    return getJsonFromTreaty<Printing>(() =>
      cardsClient.api.v1.printings({ id: safe }).get({ fetch: requestFetchInit() }),
    );
  },

  async getByPublicSlug(segments: string[]): Promise<Oracle | null> {
    const path = segments.map((segment) => encodeURIComponent(segment)).join("/");
    return getJsonFromSlugFetch(`${API_BASE}/api/v1/cards/by-slug/${path}`);
  },

  async getDetail(
    target:
      | { oracle: string }
      | { printing: string }
      | { slug: string[] },
  ): Promise<OracleDetail | null> {
    const query =
      "oracle" in target
        ? { oracle: target.oracle, include: "prices" }
        : "printing" in target
          ? { printing: target.printing, include: "prices" }
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
      return data as OracleDetail;
    } catch (err) {
      handleRequestFailure(err);
    }
  },

  async searchByName(
    name: string,
    opts: SearchByNameOptions = {},
  ): Promise<SearchByNameResult> {
    const trimmed = name.trim();
    const limit = Math.min(
      Math.max(Math.floor(opts.limit ?? 10), 1),
      MAX_SEARCH_LIMIT,
    );
    const offset = Math.max(0, Math.floor(opts.offset ?? 0));
    if (!trimmed && !opts.set) {
      return { count: 0, cards: [], total: 0, offset: 0, limit };
    }

    try {
      const { data, error, status } = await cardsClient.api.v1.cards.get({
        query: {
          name: trimmed || undefined,
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

      const result = data as {
        count: number;
        total?: number;
        cards: Oracle[];
        printings: Printing[];
      };
      const cards = result.printings.length > 0
        ? await hydratePrintings(result.printings)
        : result.cards.flatMap((oracle) => {
            const row = oracleResult(oracle);
            return row ? [row] : [];
          });
      return {
        count: cards.length,
        cards,
        total: result.total ?? result.count,
        offset,
        limit,
      };
    } catch (err) {
      handleRequestFailure(err);
    }
  },

  async getSetCards(
    setCode: string,
    opts: { includePrices?: boolean } = {},
  ): Promise<SearchByNameResult> {
    return cardsApi.searchByName("", {
      set: setCode.toUpperCase(),
      limit: MAX_SEARCH_LIMIT,
      includePrices: opts.includePrices,
      unique: true,
    });
  },

  async browseAll(
    opts: { limit?: number; offset?: number; includePrices?: boolean } = {},
  ): Promise<SearchByNameResult> {
    const limit = Math.min(
      Math.max(Math.floor(opts.limit ?? 60), 1),
      MAX_SEARCH_LIMIT,
    );
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
      const result = data as { count: number; total?: number; cards: Oracle[] };
      const cards = result.cards.flatMap((oracle) => {
        const row = oracleResult(oracle);
        return row ? [row] : [];
      });
      return {
        count: cards.length,
        cards,
        total: result.total ?? result.count,
        offset,
        limit,
      };
    } catch (err) {
      handleRequestFailure(err);
    }
  },

  async getRandom(): Promise<Oracle | null> {
    return getJsonFromTreaty<Oracle>(() =>
      cardsClient.api.v1.cards.random.get({ fetch: requestFetchInit() }),
    );
  },
};

export const cardExportUrls = {
  text: (oracleId: string) =>
    `${API_BASE}/api/v1/cards/${encodeURIComponent(oracleId)}/text`,
  json: (oracleId: string) =>
    `${API_BASE}/api/v1/cards/${encodeURIComponent(oracleId)}?include=prices`,
};

export async function fetchCardExportText(url: string): Promise<string> {
  const res = await fetch(url, requestFetchInit());
  if (!res.ok) {
    throw new CardApiError(`Riftseer API ${res.status}`, "http", res.status);
  }
  return res.text();
}

export const cardsQueryKeys = {
  all: ["cards"] as const,
  oracle: (id: string) => ["cards", "oracle", id] as const,
  printing: (id: string) => ["cards", "printing", id] as const,
  relationshipSearch: (name: string) =>
    ["cards", "relationship-search", name] as const,
  detail: (
    target:
      | { oracle: string }
      | { printing: string }
      | { slug: string[] },
  ) => [
    "cards",
    "detail",
    "oracle" in target
      ? `oracle:${target.oracle}`
      : "printing" in target
        ? `printing:${target.printing}`
        : `slug:${target.slug.join("/")}`,
  ] as const,
  search: (
    name: string,
    limit: number,
    offset: number,
    includePrices = false,
    extras: Pick<SearchByNameOptions, "type" | "artist" | "rarity" | "set" | "unique"> = {},
  ) => [
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
