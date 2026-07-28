/**
 * SupabaseCardProvider
 *
 * Reads card data from Supabase Postgres (populated by the ingest pipeline).
 * Name search uses Postgres full-text search (tsvector); no in-memory card index.
 *
 * Enable with: CARD_PROVIDER=supabase
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: CACHE_REFRESH_INTERVAL_MS (periodic stats refresh)
 */

import type { CardDataProvider } from "../provider.ts";
import type {
  Card,
  CardRequest,
  CardSearchOptions,
  CardSearchResult,
  ResolvedCard,
  CardAttributes,
  CardClassification,
  CardText,
  CardMedia,
  CardMetadata,
  CardPrices,
  CardPurchaseUris,
  CardExternalIds,
  RelatedCard,
  CardPriceEntry,
} from "../types.ts";
import { logger } from "../logger.ts";
import { getSupabaseClient } from "../supabase/client.ts";
import { normalizeCardName } from "../normalize.ts";
import { rankIds, type Nameable } from "../search.ts";
import {
  findTextLeafValue,
  isExactNameOnly,
  isLegacyTextOnly,
  parseCardSearchQuery,
  type CardSearchAst,
} from "../card-search-query.ts";

const REFRESH_INTERVAL_MS = parseInt(
  process.env.CACHE_REFRESH_INTERVAL_MS ?? "21600000",
  10,
);

const CARD_SELECT =
  "*, sets:set_id(set_code, set_name, set_uri, set_search_uri, is_promo, published_on, card_count), artists:artist_id(name)";

// `*` already covers public_slug, but we re-state it here so the dependency
// is greppable.

const SLIM_SELECT = "id, name, name_normalized";

/** PostgREST `in` filter URL limits — chunk large id lists. */
const ID_IN_CHUNK_SIZE = 100;

function chunkIds<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── DB row shape (cards joined with sets + artists) ─────────────────────────

interface DBCardRow {
  id: string;
  name: string;
  name_normalized: string;
  collector_number: string | null;
  released_at: string | null;
  set_id: string | null;
  artist_id: string | null;
  external_ids: CardExternalIds;
  attributes: CardAttributes;
  classification: CardClassification;
  text: CardText;
  metadata: CardMetadata;
  media: CardMedia;
  purchase_uris: CardPurchaseUris;
  prices: CardPrices;
  all_parts: RelatedCard[];
  used_by: RelatedCard[];
  related_champions: RelatedCard[];
  related_legends: RelatedCard[];
  related_signatures: RelatedCard[];
  related_printings: RelatedCard[];
  is_token: boolean;
  public_slug: string | null;
  updated_at: string;
  ingested_at: string;
  rulings_id: string | null;
  sets: {
    set_code: string;
    set_name: string;
    set_uri: string | null;
    set_search_uri: string | null;
    is_promo: boolean | null;
    published_on: string | null;
    card_count: number | null;
  } | null;
  artists: { name: string } | null;
}

function dbRowToCard(row: DBCardRow): Card {
  return {
    object: "card",
    id: row.id,
    name: row.name,
    name_normalized: row.name_normalized,
    collector_number: row.collector_number ?? undefined,
    released_at: row.released_at ?? undefined,
    external_ids: row.external_ids,
    set: row.sets
      ? {
          set_code: row.sets.set_code,
          set_id: row.set_id ?? undefined,
          set_name: row.sets.set_name,
          set_uri: row.sets.set_uri ?? undefined,
          set_search_uri: row.sets.set_search_uri ?? undefined,
          published_on: row.sets.published_on ?? undefined,
          card_count: row.sets.card_count ?? undefined,
        }
      : undefined,
    rulings: row.rulings_id ? { rulings_id: row.rulings_id } : undefined,
    attributes: row.attributes,
    classification: row.classification,
    text: row.text,
    artist: row.artists?.name,
    artist_id: row.artist_id ?? undefined,
    metadata: row.metadata,
    media: row.media,
    purchase_uris: row.purchase_uris,
    prices: row.prices,
    is_token: row.is_token,
    all_parts: row.all_parts ?? [],
    used_by: row.used_by ?? [],
    related_champions: row.related_champions ?? [],
    related_legends: row.related_legends ?? [],
    related_signatures: row.related_signatures ?? [],
    related_printings: row.related_printings ?? [],
    public_slug: row.public_slug ?? undefined,
    updated_at: row.updated_at,
    ingested_at: row.ingested_at,
  };
}

async function getSetIdByCode(setCode: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from("sets")
    .select("id")
    .eq("set_code", setCode.toUpperCase())
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve set code: ${error.message}`);
  return data?.id ?? null;
}

// ─── Search-result dedup: one representative printing per card name ──────────

const RARITY_RANK: Record<string, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  Epic: 3,
  Legendary: 4,
};

/**
 * Strip trailing parenthetical suffixes — e.g. "(Signature)", "(Alternate Art)",
 * "(Overnumbered)" — then normalize.  Cards that share the same base name are
 * treated as variant printings of the same card.
 */
function baseNormalized(name: string): string {
  return normalizeCardName(name.replace(/\s*\(.*?\)\s*$/, ""));
}

/**
 * From a group of same-base-name rows, pick the representative printing.
 * Priority: non-promo → lowest rarity → newest release →
 *           non-alt-art → non-signature → non-overnumbered.
 */
function pickPreferredPrinting(rows: DBCardRow[]): DBCardRow {
  if (rows.length === 1) return rows[0];

  const nonPromo = rows.filter((r) => !r.sets?.is_promo);
  const candidates = nonPromo.length > 0 ? nonPromo : rows;

  candidates.sort((a, b) => {
    const rarA = RARITY_RANK[a.classification?.rarity ?? ""] ?? 99;
    const rarB = RARITY_RANK[b.classification?.rarity ?? ""] ?? 99;
    if (rarA !== rarB) return rarA - rarB;

    const dateA = a.released_at ?? "";
    const dateB = b.released_at ?? "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);

    const altA = a.metadata?.alternate_art ? 1 : 0;
    const altB = b.metadata?.alternate_art ? 1 : 0;
    if (altA !== altB) return altA - altB;

    const sigA = a.metadata?.signature ? 1 : 0;
    const sigB = b.metadata?.signature ? 1 : 0;
    if (sigA !== sigB) return sigA - sigB;

    const overA = a.metadata?.overnumbered ? 1 : 0;
    const overB = b.metadata?.overnumbered ? 1 : 0;
    return overA - overB;
  });

  return candidates[0];
}

/**
 * Collapse rows into one per unique base card name, preserving encounter order,
 * returning every group — used for search pagination (slice after dedup).
 */
function deduplicateRowsAll(rows: DBCardRow[]): DBCardRow[] {
  const groups = new Map<string, DBCardRow[]>();
  const nameOrder: string[] = [];

  for (const row of rows) {
    const key = baseNormalized(row.name);
    if (!groups.has(key)) {
      groups.set(key, [row]);
      nameOrder.push(key);
    } else {
      groups.get(key)!.push(row);
    }
  }

  return nameOrder.map((key) => pickPreferredPrinting(groups.get(key)!));
}

function sortCardsByCollector(a: Card, b: Card): number {
  const na = a.collector_number ?? "";
  const nb = b.collector_number ?? "";
  const matchA = /^(\d+)(.*)$/.exec(na);
  const matchB = /^(\d+)(.*)$/.exec(nb);
  if (matchA && matchB) {
    const numA = parseInt(matchA[1], 10);
    const numB = parseInt(matchB[1], 10);
    if (numA !== numB) return numA - numB;
    return matchA[2].localeCompare(matchB[2], undefined, {
      numeric: false,
      sensitivity: "variant",
    });
  }
  return na.localeCompare(nb, undefined, { numeric: true });
}

export class SupabaseCardProvider implements CardDataProvider {
  readonly sourceName = "supabase";

  private lastRefresh = 0;
  private cardCount = 0;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  async warmup(): Promise<void> {
    logger.info("Supabase provider warming up", {
      url: process.env.SUPABASE_URL,
    });
    await this.touchSupabase();

    this.refreshTimer = setInterval(() => {
      this.refresh().catch((err) =>
        logger.error("Scheduled refresh failed", { error: String(err) }),
      );
    }, REFRESH_INTERVAL_MS);
    this.refreshTimer.unref?.();
  }

  async refresh(): Promise<void> {
    logger.info("Refreshing provider stats from Supabase");
    await this.touchSupabase();
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private async touchSupabase(): Promise<void> {
    const supabase = getSupabaseClient();
    const { count, error } = await supabase
      .from("cards")
      .select("*", { count: "exact", head: true });

    if (error) throw new Error(error.message);

    this.cardCount = count ?? 0;
    this.lastRefresh = Math.floor(Date.now() / 1000);

    logger.info("Supabase provider ready", { cardCount: this.cardCount });
  }

  async getCardById(id: string): Promise<Card | null> {
    const { data, error } = await getSupabaseClient()
      .from("cards")
      .select(CARD_SELECT)
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`getCardById failed: ${error.message}`);
    return data ? dbRowToCard(data as DBCardRow) : null;
  }

  async getCardByPublicSlug(slug: string): Promise<Card | null> {
    const trimmed = slug.replace(/^\/+|\/+$/g, "");
    if (!trimmed) return null;
    const { data, error } = await getSupabaseClient()
      .from("cards")
      .select(CARD_SELECT)
      .eq("public_slug", trimmed)
      .maybeSingle();

    if (error) throw new Error(`getCardByPublicSlug failed: ${error.message}`);
    return data ? dbRowToCard(data as DBCardRow) : null;
  }

  async getPublicSlugsByIds(ids: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (unique.length === 0) return result;

    for (const idChunk of chunkIds(unique, ID_IN_CHUNK_SIZE)) {
      const { data, error } = await getSupabaseClient()
        .from("cards")
        .select("id, public_slug")
        .in("id", idChunk);

      if (error) throw new Error(`getPublicSlugsByIds failed: ${error.message}`);
      for (const row of (data ?? []) as Array<{ id: string; public_slug: string | null }>) {
        if (row.public_slug) result.set(row.id, row.public_slug);
      }
    }
    return result;
  }

  async getCardsByIds(ids: string[]): Promise<Card[]> {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (unique.length === 0) return [];
    const rows = await this.hydrateRowsInOrder(unique);
    return rows.map(dbRowToCard);
  }

  async searchByName(q: string, opts: CardSearchOptions = {}): Promise<CardSearchResult> {
    const { ast } = parseCardSearchQuery(q);
    if (!ast) return { cards: [], total: 0 };
    return this.searchByAst(ast, opts);
  }

  /**
   * Structured-AST entry point. Routes between three execution paths:
   *
   *   - **ExactNameOnly** — single `exact_name` leaf → `name_normalized` lookup.
   *   - **LegacyTextOnly** — single `text` leaf → existing exact-then-FTS path
   *     (preserves current ranking and dedup behavior for the common case).
   *   - **RPC** — anything else (filters, OR, NOT, grouping, text+filters)
   *     → `search_card_ids` RPC with the AST as JSONB; results hydrated and
   *     deduped in TS to match the legacy semantics.
   */
  async searchByAst(
    ast: CardSearchAst,
    opts: CardSearchOptions = {},
  ): Promise<CardSearchResult> {
    const pageLimit = Math.min(
      Math.max(Math.floor(Number(opts.limit ?? 10)), 1),
      100,
    );
    const offset = Math.max(0, Math.floor(Number(opts.offset ?? 0)));

    const setId = await this.resolveSetIdOrNull(opts.set);
    if (opts.set && setId === null) return { cards: [], total: 0 };

    if (isExactNameOnly(ast)) {
      return this.exactNameSearch(ast.value, setId, opts, pageLimit, offset);
    }

    if (isLegacyTextOnly(ast)) {
      return this.legacyTextSearch(ast.value, setId, opts, pageLimit, offset);
    }

    return this.rpcSearch(ast, opts, pageLimit, offset);
  }

  private async resolveSetIdOrNull(setCode?: string): Promise<string | null> {
    if (!setCode) return null;
    return await getSetIdByCode(setCode);
  }

  /**
   * Single normalized-name lookup with optional set/collector. Used when the
   * AST is a lone `!exact-name` leaf — the cheapest possible search.
   */
  private async exactNameSearch(
    normalizedName: string,
    setId: string | null,
    opts: CardSearchOptions,
    pageLimit: number,
    offset: number,
  ): Promise<CardSearchResult> {
    const supabase = getSupabaseClient();
    let q = supabase
      .from("cards")
      .select(CARD_SELECT)
      .eq("name_normalized", normalizedName);
    if (setId) q = q.eq("set_id", setId);
    if (opts.collector !== undefined && opts.collector !== null) {
      q = q.eq("collector_number", String(opts.collector));
    }
    const exactFetchCap = Math.min(5000, Math.max(200, (offset + pageLimit) * 25));
    const { data, error } = await q.limit(exactFetchCap);
    if (error) throw new Error(`exactNameSearch failed: ${error.message}`);
    if (!data || data.length === 0) return { cards: [], total: 0 };
    const rows = data as DBCardRow[];
    const result = opts.unique ? rows : deduplicateRowsAll(rows);
    return {
      cards: result.slice(offset, offset + pageLimit).map(dbRowToCard),
      total: result.length,
    };
  }

  /**
   * The legacy free-text path: exact `name_normalized` first; if no rows and
   * fuzzy is allowed, fall back to FTS, rank in TS, hydrate, dedupe, paginate.
   * Behavior identical to the pre-AST `searchByName` so existing callers and
   * tests are unaffected.
   */
  private async legacyTextSearch(
    text: string,
    setId: string | null,
    opts: CardSearchOptions,
    pageLimit: number,
    offset: number,
  ): Promise<CardSearchResult> {
    const norm = normalizeCardName(text);
    if (norm.length === 0) return { cards: [], total: 0 };

    const supabase = getSupabaseClient();

    const exactFetchCap = Math.min(5000, Math.max(200, (offset + pageLimit) * 25));

    let exactQuery = supabase
      .from("cards")
      .select(CARD_SELECT)
      .eq("name_normalized", norm);
    if (setId) exactQuery = exactQuery.eq("set_id", setId);
    if (opts.collector !== undefined && opts.collector !== null) {
      exactQuery = exactQuery.eq("collector_number", String(opts.collector));
    }

    const { data: exactData, error: exactError } =
      await exactQuery.limit(exactFetchCap);
    if (exactError)
      throw new Error(`legacyTextSearch exact failed: ${exactError.message}`);
    if (exactData && exactData.length > 0) {
      const rows = exactData as DBCardRow[];
      const result = opts.unique ? rows : deduplicateRowsAll(rows);
      return {
        cards: result.slice(offset, offset + pageLimit).map(dbRowToCard),
        total: result.length,
      };
    }

    if (opts.fuzzy === false) return { cards: [], total: 0 };

    const prefixQuery = norm
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `${w}:*`)
      .join(" & ");

    const fetchLimit = Math.min(
      Math.max((offset + pageLimit) * 20, 100),
      500,
    );

    let ftsDataQuery = supabase
      .from("cards")
      .select(SLIM_SELECT)
      .textSearch("name_search", prefixQuery, { config: "simple" });

    if (setId) ftsDataQuery = ftsDataQuery.eq("set_id", setId);
    if (opts.collector !== undefined && opts.collector !== null) {
      ftsDataQuery = ftsDataQuery.eq(
        "collector_number",
        String(opts.collector),
      );
    }

    let ftsCountQuery = supabase
      .from("cards")
      .select("id", { count: "exact", head: true })
      .textSearch("name_search", prefixQuery, { config: "simple" });

    if (setId) ftsCountQuery = ftsCountQuery.eq("set_id", setId);
    if (opts.collector !== undefined && opts.collector !== null) {
      ftsCountQuery = ftsCountQuery.eq(
        "collector_number",
        String(opts.collector),
      );
    }

    const [{ count: ftsMatchCount, error: ftsCountError }, { data: ftsData, error: ftsError }] =
      await Promise.all([ftsCountQuery, ftsDataQuery.limit(fetchLimit)]);
    if (ftsError)
      throw new Error(`legacyTextSearch FTS failed: ${ftsError.message}`);

    const ftsRows = (ftsData ?? []) as Nameable[];
    const topIds = rankIds(ftsRows, text, ftsRows.length);
    const totalFromCount =
      !ftsCountError &&
      ftsMatchCount !== null &&
      ftsMatchCount !== undefined
        ? ftsMatchCount
        : null;
    if (topIds.length === 0) {
      return { cards: [], total: totalFromCount ?? 0 };
    }

    const orderedRows = await this.hydrateRowsInOrder(topIds);
    const result = opts.unique ? orderedRows : deduplicateRowsAll(orderedRows);
    return {
      cards: result.slice(offset, offset + pageLimit).map(dbRowToCard),
      total: totalFromCount ?? result.length,
    };
  }

  /**
   * RPC path: serialize the AST to JSONB and call `search_card_ids`, which
   * returns a capped id list plus the unfiltered total. We hydrate, optionally
   * re-rank against the AST's first text leaf to keep autocomplete behavior
   * for queries like `bard t:legend`, then dedupe and paginate.
   */
  private async rpcSearch(
    ast: CardSearchAst,
    opts: CardSearchOptions,
    pageLimit: number,
    offset: number,
  ): Promise<CardSearchResult> {
    const supabase = getSupabaseClient();
    const maxIds = Math.min(5000, Math.max(200, (offset + pageLimit) * 25));

    const setCode = opts.set ?? null;
    const collector =
      opts.collector !== undefined && opts.collector !== null
        ? String(opts.collector)
        : null;

    const { data, error } = await supabase.rpc("search_card_ids", {
      p_ast: ast as unknown as Record<string, unknown>,
      p_set: setCode,
      p_collector: collector,
      p_max_ids: maxIds,
    });

    if (error) throw new Error(`searchByAst RPC failed: ${error.message}`);

    const payload = (data ?? { ids: [], total: 0 }) as {
      ids?: string[];
      total?: number;
    };
    const ids = Array.isArray(payload.ids) ? payload.ids : [];
    if (ids.length === 0) return { cards: [], total: payload.total ?? 0 };

    const rows = await this.hydrateRowsInOrder(ids);
    const textValue = findTextLeafValue(ast);
    let ordered: DBCardRow[] = rows;
    if (textValue) {
      const ranked = rankIds(rows as Nameable[], textValue, rows.length);
      const rowMap = new Map(rows.map((r) => [r.id, r]));
      // Append any rows the ranker dropped (below MIN_AUTOCOMPLETE_SCORE) so
      // filtered matches without a name signal still appear, just at the end.
      const seen = new Set(ranked);
      const tail = rows.filter((r) => !seen.has(r.id));
      ordered = [
        ...ranked.flatMap((id) => {
          const r = rowMap.get(id);
          return r ? [r] : [];
        }),
        ...tail,
      ];
    }
    const result = opts.unique ? ordered : deduplicateRowsAll(ordered);
    // Pagination total matches other search paths: one row per base name after
    // deduplicateRowsAll (`result`), not `payload.total` from the RPC (raw SQL
    // row count before variant merging). Slice/`dbRowToCard` use the same list.
    return {
      cards: result.slice(offset, offset + pageLimit).map(dbRowToCard),
      total: result.length,
    };
  }

  private async hydrateRowsInOrder(ids: string[]): Promise<DBCardRow[]> {
    if (ids.length === 0) return [];
    const supabase = getSupabaseClient();
    const all: DBCardRow[] = [];
    for (const chunk of chunkIds(ids, ID_IN_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from("cards")
        .select(CARD_SELECT)
        .in("id", chunk);
      if (error)
        throw new Error(`hydrateRowsInOrder failed: ${error.message}`);
      if (data) all.push(...(data as DBCardRow[]));
    }
    const rowMap = new Map(all.map((r) => [r.id, r]));
    return ids.flatMap((id) => {
      const r = rowMap.get(id);
      return r ? [r] : [];
    });
  }

  async resolveRequest(req: CardRequest): Promise<ResolvedCard> {
    const norm = normalizeCardName(req.name);
    if (norm.length === 0) {
      return { request: req, card: null, matchType: "not-found" };
    }

    const supabase = getSupabaseClient();

    const { data: exactRows, error: exactError } = await supabase
      .from("cards")
      .select(CARD_SELECT)
      .eq("name_normalized", norm);

    if (exactError) {
      logger.error("resolveRequest exact query failed", {
        error: exactError.message,
      });
      throw new Error(
        `resolveRequest exact query failed: ${exactError.message}`,
      );
    }

    const candidates =
      (exactRows as DBCardRow[] | null)?.map(dbRowToCard) ?? [];

    if (req.set && req.collector) {
      const exact = candidates.find(
        (c) =>
          c.set?.set_code === req.set!.toUpperCase() &&
          c.collector_number === req.collector,
      );
      if (exact) return { request: req, card: exact, matchType: "exact" };
      return { request: req, card: null, matchType: "not-found" };
    }

    if (req.set) {
      const withSet = candidates.filter(
        (c) => c.set?.set_code === req.set!.toUpperCase(),
      );
      if (withSet.length > 0)
        return { request: req, card: withSet[0], matchType: "exact" };
      if (candidates.length > 0) {
        logger.debug(
          "Requested set not found; falling back to default printing",
          {
            name: req.name,
            set: req.set,
          },
        );
      }
      return { request: req, card: null, matchType: "not-found" };
    }

    if (req.collector) {
      const withCollector = candidates.find(
        (c) => c.collector_number === req.collector,
      );
      if (withCollector)
        return { request: req, card: withCollector, matchType: "exact" };
      return { request: req, card: null, matchType: "not-found" };
    }

    if (candidates.length > 0) {
      return { request: req, card: candidates[0], matchType: "exact" };
    }

    const { data: ftsRows, error: ftsError } = await supabase
      .from("cards")
      .select(CARD_SELECT)
      .textSearch("name_search", norm, { type: "websearch", config: "simple" })
      .limit(1);

    if (ftsError) {
      logger.error("resolveRequest FTS failed", { error: ftsError.message });
      throw new Error(`resolveRequest FTS failed: ${ftsError.message}`);
    }

    const first = ftsRows?.[0] as DBCardRow | undefined;
    if (first) {
      return { request: req, card: dbRowToCard(first), matchType: "fuzzy" };
    }

    return { request: req, card: null, matchType: "not-found" };
  }

  async getSets(): Promise<
    Array<{ setCode: string; setName: string; cardCount: number; isPromo: boolean; publishedOn: string | null }>
  > {
    const { data, error } = await getSupabaseClient()
      .from("sets")
      .select("set_code, set_name, card_count, is_promo, published_on")
      .order("set_name");

    if (error) throw new Error(`getSets failed: ${error.message}`);
    if (!data) return [];

    return data.map((row) => ({
      setCode: row.set_code,
      setName: row.set_name,
      cardCount: row.card_count ?? 0,
      isPromo: row.is_promo ?? false,
      publishedOn: row.published_on ?? null,
    }));
  }

  async getCardsBySet(
    setCode: string,
    opts: { limit?: number } = {},
  ): Promise<Card[]> {
    const limit = Math.min(Math.max(Math.floor(Number(opts.limit ?? 1000)), 0), 1000);
    const setId = await getSetIdByCode(setCode);
    if (!setId) return [];

    const { data, error } = await getSupabaseClient()
      .from("cards")
      .select(CARD_SELECT)
      .eq("set_id", setId);

    if (error) throw new Error(`getCardsBySet failed: ${error.message}`);
    const cards = (data as DBCardRow[]).map(dbRowToCard);
    cards.sort(sortCardsByCollector);
    return cards.slice(0, limit);
  }

  async browseCards(opts: { limit: number; offset: number }): Promise<{ cards: Card[]; total: number }> {
    const limit = Math.min(Math.max(Math.floor(Number(opts.limit ?? 60)), 1), 100);
    const offset = Math.max(0, Math.floor(Number(opts.offset ?? 0)));

    const supabase = getSupabaseClient();
    const { data, count, error } = await supabase
      .from("cards")
      .select(CARD_SELECT, { count: "exact" })
      .order("released_at", { ascending: true, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`browseCards failed: ${error.message}`);
    const cards = ((data ?? []) as DBCardRow[]).map(dbRowToCard);
    return { cards, total: count ?? 0 };
  }

  async getRandomCard(): Promise<Card | null> {
    const supabase = getSupabaseClient();
    const { count, error: countError } = await supabase
      .from("cards")
      .select("*", { count: "exact", head: true });

    if (countError)
      throw new Error(`getRandomCard count failed: ${countError.message}`);
    const n = count ?? 0;
    if (n === 0) return null;

    const offset = Math.floor(Math.random() * n);
    const { data, error } = await supabase
      .from("cards")
      .select(CARD_SELECT)
      .range(offset, offset);

    if (error) throw new Error(`getRandomCard failed: ${error.message}`);
    const row = data?.[0] as DBCardRow | undefined;
    return row ? dbRowToCard(row) : null;
  }

  getStats(): { lastRefresh: number; cardCount: number } {
    return { lastRefresh: this.lastRefresh, cardCount: this.cardCount };
  }
}
