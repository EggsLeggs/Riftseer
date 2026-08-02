import type { CardSearchAst } from "./card-search-query.ts";
import type {
  CardLegality,
  CardRequest,
  CardRuling,
  CardSearchOptions,
  Format,
  Oracle,
  OracleSearchResult,
  Printing,
  PrintingSearchResult,
  ResolvedCard,
  SimplifiedDeck,
} from "./types.ts";

/**
 * The canonical provider interface.
 *
 * The rest of the app (API, bots) depends ONLY on this interface, never on a
 * concrete provider. The only implementation is SupabaseCardProvider.
 *
 * Read it as two families:
 *
 *   getOracle*   "what is this card"     — the rules object
 *   getPrinting* "this piece of cardboard" — one physical printing
 *
 * Search is oracle-shaped by default: a result row is a card, carrying its
 * preferred printing. `searchPrintings` is the escape hatch for genuinely
 * printing-level questions (`is:alternate`, a set/collector filter).
 */
export interface CardDataProvider {
  /**
   * Human-readable name of the upstream data source, e.g. "riftcodex".
   * Used in /meta responses and log output.
   */
  readonly sourceName: string;

  /** Called once at startup; verifies connectivity and seeds cached stats. */
  warmup(): Promise<void>;

  /** Re-read cached stats from upstream. */
  refresh(): Promise<void>;

  // ── Oracles ────────────────────────────────────────────────────────────────

  /** Look up one oracle by its surrogate id. */
  getOracleById(id: string): Promise<Oracle | null>;

  /**
   * Look up one oracle by its name-derived lookup key. Distinct from
   * `getOracleBySlug`: the key is `oracleKeyForName(name)`, the slug is a
   * URL segment that may carry a collision suffix.
   */
  getOracleByKey(oracleKey: string): Promise<Oracle | null>;

  /** Look up one oracle by its public slug, e.g. "brush". */
  getOracleBySlug(slug: string): Promise<Oracle | null>;

  /**
   * Fetch many oracles in one round-trip, in the order the ids were given.
   * Unknown ids are omitted rather than returned as null.
   */
  getOraclesByIds(ids: string[]): Promise<Oracle[]>;

  /**
   * Every printing of one oracle, oldest set first. This is a plain foreign-key
   * traversal — it is what replaced the denormalised `related_printings` array.
   */
  getPrintingsForOracle(oracleId: string): Promise<Printing[]>;

  /** The oracles on the other end of this oracle's relationship edges. */
  getOracleRelationships(oracleId: string): Promise<{
    makes_tokens: Oracle[];
    used_by: Oracle[];
    characters: Oracle[];
    signatures: Oracle[];
  }>;

  // ── Printings ──────────────────────────────────────────────────────────────

  /** Look up one printing by its RiftCodex ObjectId. */
  getPrintingById(id: string): Promise<Printing | null>;

  /**
   * Look up one printing by its pinned public slug (relative path, no leading
   * slash, e.g. "ogn/12a/signature/sun-disc").
   */
  getPrintingBySlug(slug: string): Promise<Printing | null>;

  /** Fetch many printings in one round-trip, in the order the ids were given. */
  getPrintingsByIds(ids: string[]): Promise<Printing[]>;

  /** Printings in a set, ordered by collector number. */
  getPrintingsBySet(setCode: string, opts?: { limit?: number }): Promise<Printing[]>;

  // ── Search ─────────────────────────────────────────────────────────────────

  /**
   * Raw-query search. Parses with {@link parseCardSearchQuery} and delegates to
   * {@link searchOraclesByAst}.
   */
  searchOracles(q: string, opts?: CardSearchOptions): Promise<OracleSearchResult>;

  /**
   * Structured-AST search returning one row per card, each carrying the
   * matching printing (the preferred one when it matched).
   */
  searchOraclesByAst(
    ast: CardSearchAst,
    opts?: CardSearchOptions,
  ): Promise<OracleSearchResult>;

  /** Structured-AST search returning one row per matching printing. */
  searchPrintingsByAst(
    ast: CardSearchAst,
    opts?: CardSearchOptions,
  ): Promise<PrintingSearchResult>;

  /**
   * Resolve a `[[Name|SET-123]]` request.
   *
   * This is an *oracle* lookup that also picks a printing: the one the request
   * named, or the oracle's preferred one. Never throws — returns
   * `{ oracle: null, printing: null, matchType: "not-found" }` on a miss.
   */
  resolveRequest(req: CardRequest): Promise<ResolvedCard>;

  /** All oracles, paginated, for the browse-everything view. */
  browseOracles(opts: { limit: number; offset: number }): Promise<OracleSearchResult>;

  /** One random oracle, or null when the catalogue is empty. */
  getRandomOracle(): Promise<Oracle | null>;

  // ── Sets, formats, rulings ─────────────────────────────────────────────────

  getSets(): Promise<
    Array<{
      setCode: string;
      setName: string;
      cardCount: number;
      isPromo: boolean;
      publishedOn: string | null;
    }>
  >;

  /**
   * Return the admin-managed play formats in display order. Retired
   * (`active: false`) formats are omitted unless `includeInactive` is set.
   */
  getFormats(opts?: { includeInactive?: boolean }): Promise<Format[]>;

  /**
   * Resolve one printing's legality in every active format, with precedence
   * printing → oracle → default `legal`. Every active format is represented,
   * so callers never have to assume.
   */
  getLegalities(printingId: string): Promise<CardLegality[]>;

  /**
   * Rulings and notes visible on one printing: those scoped to its oracle,
   * those scoped to the printing, and every rule that matches it — oldest
   * first.
   */
  getRulings(printingId: string): Promise<CardRuling[]>;

  /**
   * Provider stats for the /meta endpoint. `lastRefresh` is a Unix timestamp
   * in seconds; `oracleCount` and `printingCount` are catalogue sizes.
   */
  getStats(): { lastRefresh: number; oracleCount: number; printingCount: number };
}

export interface SimplifiedDeckProvider {
  /**
   * Add printings to the deck given by deckShortForm, or create a new deck if
   * not provided. Returns the updated deck and a new shortForm.
   */
  addCards(
    cards: { id: string; quantity: number }[],
    deckShortForm?: string,
  ): Promise<{ deck: SimplifiedDeck; shortForm: string }>;
  /**
   * Remove printings from the deck given by deckShortForm. Returns the updated
   * deck and a new shortForm.
   */
  removeCards(
    cards: { id: string; quantity: number }[],
    deckShortForm: string,
  ): Promise<{ deck: SimplifiedDeck; shortForm: string }>;
  /**
   * Get the deck represented by the shortForm string. Returns the deck and the
   * same shortForm if valid.
   */
  getDeckFromShortForm(
    deckShortForm: string,
  ): Promise<{ deck: SimplifiedDeck; shortForm: string }>;
}
