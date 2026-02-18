import type { Card, CardRequest, CardSearchOptions, ResolvedCard } from "./types.ts";

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
  getCardById(id: string): Promise<Card | null>;

  /**
   * Full-text + optional set/collector search.
   * Performs exact match first; fuzzy fallback if opts.fuzzy !== false.
   */
  searchByName(q: string, opts?: CardSearchOptions): Promise<Card[]>;

  /**
   * Resolve a structured CardRequest to the single best matching printing.
   * Handles set/collector fallback logic.
   * Never throws — returns { card: null, matchType: "not-found" } on miss.
   */
  resolveRequest(req: CardRequest): Promise<ResolvedCard>;
}
