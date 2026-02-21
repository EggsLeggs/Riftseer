import type { CardV2, CardRequest, CardSearchOptions, ResolvedCard } from "./types.ts";

/**
 * The canonical provider interface.
 *
 * The rest of the app (API, bot) ONLY depends on this interface — not on any
 * concrete provider.  To swap RiftCodex for Riot's API, change only
 * packages/core/src/providers/index.ts (the factory) and add a new
 * RiotProvider class that satisfies this interface.
 */
export interface CardDataProvider {
  /**
   * Human-readable name of the upstream data source, e.g. "riftcodex".
   * Used in /meta responses and log output.
   */
  readonly sourceName: string;

  /**
   * Called once at startup.  Should:
   *   1. Load the card cache from SQLite (fast path).
   *   2. If the cache is stale or missing, call refresh().
   *   3. Schedule background refreshes.
   */
  warmup(): Promise<void>;

  /**
   * Pull fresh card data from the upstream API and rebuild the in-memory index.
   * Falls back to the existing cache if the upstream is unreachable.
   */
  refresh(): Promise<void>;

  /**
   * Look up a single card by its provider-assigned stable ID.
   * Returns null if not found.
   */
  getCardById(id: string): Promise<CardV2 | null>;

  /**
   * Full-text + optional set/collector search.
   * Performs exact match first; fuzzy fallback if opts.fuzzy !== false.
   */
  searchByName(q: string, opts?: CardSearchOptions): Promise<CardV2[]>;

  /**
   * Resolve a structured CardRequest to the single best matching printing.
   * Handles set/collector fallback logic.
   * Never throws — returns { card: null, matchType: "not-found" } on miss.
   */
  resolveRequest(req: CardRequest): Promise<ResolvedCard>;

  /**
   * Return all known sets with their code, name, and card count.
   * Optional — providers that don't support this may return [].
   */
  getSets(): Promise<Array<{ setCode: string; setName: string; cardCount: number }>>;

  /**
   * Return cards in a set, ordered by collector number.
   * Used when browsing a set without a name search.
   */
  getCardsBySet(setCode: string, opts?: { limit?: number }): Promise<CardV2[]>;

  /**
   * Return a single random card from the provider's index.
   * Returns null if the index is empty.
   */
  getRandomCard(): Promise<CardV2 | null>;

  /**
   * Return provider stats for the /meta endpoint.
   * lastRefresh is a Unix timestamp (seconds); cardCount is the index size.
   */
  getStats(): { lastRefresh: number; cardCount: number };
}
