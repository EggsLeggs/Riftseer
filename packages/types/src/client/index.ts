/**
 * A typed fetch client for the public Riftseer API.
 *
 * The wire types below are the shapes the API's TypeBox schemas produce: the
 * card, printing, format and detail halves are this package's own types, and
 * the envelopes (`count`, `cards`, `results`, …) are declared once here.
 * `apps/api/src/__tests__/client-contract.test.ts` runs this client against
 * the real route table in memory and asserts every shape in both directions,
 * so a route change this file does not follow fails CI.
 *
 * Zero dependencies: `fetch`, `Response` and `URLSearchParams` are globals in
 * Workers, Devvit, Raycast's Node and every browser. There are no account
 * methods yet; the satellites and the mobile app only read.
 */

import type { Format, Oracle, Printing, ResolvedCard, SearchUniqueMode } from "../card.ts";
import type { OracleDetail } from "../card-detail.ts";

// ─── Wire shapes ──────────────────────────────────────────────────────────────

/** Every non-2xx body the API returns. `code` is stable; `error` is prose. */
export interface ApiError {
  error: string;
  code: string;
}

/** Field groups a read may opt into. `prices` adds marketplace prices to printings. */
export type ApiInclude = "prices";

/**
 * One page of `GET /cards`. `unique` says which array carries the rows; the
 * other is empty. In `prints` mode `cards` holds the owning oracles so a client
 * can render a type line beside each printing without a request per row.
 */
export interface CardSearchResponse {
  unique: SearchUniqueMode;
  count: number;
  cards: Oracle[];
  printings: Printing[];
  total?: number;
  offset?: number;
  limit?: number;
}

/** `POST /cards/resolve`: one result per request, in request order. */
export interface CardResolveResponse {
  count: number;
  results: ResolvedCard[];
}

/**
 * One row of `GET /sets`. Camel-cased where every other payload is
 * snake-cased; the list predates the oracle model and no client has asked for
 * it to change. Distinct from `CardSet`, the shape a printing embeds.
 */
export interface SetSummary {
  setCode: string;
  setName: string;
  cardCount: number;
  isPromo: boolean;
  publishedOn: string | null;
}

export interface SetListResponse {
  count: number;
  sets: SetSummary[];
}

export interface FormatListResponse {
  count: number;
  formats: Format[];
}

// ─── Requests ─────────────────────────────────────────────────────────────────

/** `GET /cards` parameters. `q` is the search grammar; the rest are AND filters. */
export interface CardSearchParams {
  q?: string;
  type?: string;
  artist?: string;
  rarity?: string;
  set?: string;
  collector?: string;
  /** `false` disables fuzzy and autocomplete matching. The API defaults to fuzzy. */
  fuzzy?: boolean;
  unique?: SearchUniqueMode;
  /** Every card, no search term. */
  browse?: "all";
  limit?: number;
  offset?: number;
  include?: ApiInclude;
}

/** Exactly one of the three identifies the card page. */
export type CardDetailLookup = { oracle: string } | { printing: string } | { slug: string };

export interface CardResolveParams {
  /** Token contents (`Brush`, `Vayne|VEN-SP3`), with or without the brackets. Up to 20. */
  requests: readonly string[];
  include?: ApiInclude;
}

// ─── Results ──────────────────────────────────────────────────────────────────

/**
 * Every method answers a result and never throws. `status` is the HTTP
 * status, or `0` when the request never reached the API.
 */
export type ClientResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiError };

/** `code` values the client itself produces, beside the API's own. */
export const CLIENT_ERROR_CODES = {
  network: "NETWORK_ERROR",
  unexpectedResponse: "UNEXPECTED_RESPONSE",
} as const;

// ─── Client ───────────────────────────────────────────────────────────────────

/** The one seam: tests hand in `app.handle`; runtimes hand in nothing. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface RiftseerClientOptions {
  /** API origin, e.g. `https://api.riftseer.com`. `/api/v1` is appended here. */
  baseUrl: string;
  fetch?: FetchLike;
}

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "error") === "string" &&
    typeof Reflect.get(value, "code") === "string"
  );
}

type QueryValue = string | number | boolean | undefined;

function queryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}

export function createRiftseerClient(options: RiftseerClientOptions) {
  const root = `${options.baseUrl.replace(/\/+$/, "")}/api/v1`;
  const send: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));

  async function request<T>(path: string, init: RequestInit): Promise<ClientResult<T>> {
    let response: Response;
    try {
      response = await send(`${root}${path}`, init);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, status: 0, error: { error: message, code: CLIENT_ERROR_CODES.network } };
    }

    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }

    if (!response.ok) {
      const error = isApiError(body)
        ? body
        : { error: text || response.statusText, code: CLIENT_ERROR_CODES.unexpectedResponse };
      return { ok: false, status: response.status, error };
    }

    if (typeof body !== "object" || body === null) {
      return {
        ok: false,
        status: response.status,
        error: {
          error: "Response was not a JSON object",
          code: CLIENT_ERROR_CODES.unexpectedResponse,
        },
      };
    }

    // The route's response schema is the contract for what `body` holds, and
    // the contract test in apps/api asserts each schema against `T` in both
    // directions. Re-validating here would restate that schema in a package
    // that has no schema library.
    return { ok: true, status: response.status, data: body as T };
  }

  function get<T>(path: string, params: Record<string, QueryValue> = {}) {
    return request<T>(`${path}${queryString(params)}`, { method: "GET" });
  }

  function post<T>(path: string, payload: unknown) {
    return request<T>(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  return {
    cards: {
      search(params: CardSearchParams = {}) {
        return get<CardSearchResponse>("/cards", { ...params });
      },
      /** By oracle UUID, `oracle_key` or single-segment slug. */
      get(id: string, params: { include?: ApiInclude } = {}) {
        return get<Oracle>(`/cards/${encodeURIComponent(id)}`, { ...params });
      },
      /** By oracle slug or printing slug; a printing slug becomes `preferred_printing`. */
      bySlug(slug: string, params: { include?: ApiInclude } = {}) {
        const path = slug
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("/");
        return get<Oracle>(`/cards/by-slug/${path}`, { ...params });
      },
      /** The card page payload: oracle, printings, relationships, rulings, legalities. */
      detail(lookup: CardDetailLookup, params: { include?: ApiInclude } = {}) {
        return get<OracleDetail>("/cards/detail", { ...lookup, ...params });
      },
      random(params: { include?: ApiInclude } = {}) {
        return get<Oracle>("/cards/random", { ...params });
      },
      resolve(params: CardResolveParams) {
        return post<CardResolveResponse>("/cards/resolve", params);
      },
    },
    sets: {
      list() {
        return get<SetListResponse>("/sets");
      },
    },
    formats: {
      list() {
        return get<FormatListResponse>("/formats");
      },
    },
  };
}

export type RiftseerClient = ReturnType<typeof createRiftseerClient>;
