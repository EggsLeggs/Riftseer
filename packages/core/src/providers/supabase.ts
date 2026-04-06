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
} from "../types.ts";
import { logger } from "../logger.ts";
import { getSupabaseClient } from "../supabase/client.ts";
import { normalizeCardName } from "../normalize.ts";
import { autocompleteSearch } from "../search.ts";

const REFRESH_INTERVAL_MS = parseInt(
  process.env.CACHE_REFRESH_INTERVAL_MS ?? "21600000",
  10,
);

const CARD_SELECT =
  "*, sets:set_id(set_code, set_name, set_uri, set_search_uri), artists:artist_id(name)";

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
  is_token: boolean;
  updated_at: string;
  ingested_at: string;
  rulings_id: string | null;
  sets: {
    set_code: string;
    set_name: string;
    set_uri: string | null;
    set_search_uri: string | null;
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

  async searchByName(q: string, opts: CardSearchOptions = {}): Promise<Card[]> {
    const limit = opts.limit ?? 10;
    const norm = normalizeCardName(q);
    if (norm.length === 0) return [];

    const supabase = getSupabaseClient();

    let setId: string | null = null;
    if (opts.set) {
      setId = await getSetIdByCode(opts.set);
      if (!setId) return [];
    }

    let exactQuery = supabase
      .from("cards")
      .select(CARD_SELECT)
      .eq("name_normalized", norm);
    if (setId) exactQuery = exactQuery.eq("set_id", setId);
    if (opts.collector !== undefined && opts.collector !== null) {
      exactQuery = exactQuery.eq("collector_number", String(opts.collector));
    }

    const { data: exactData, error: exactError } =
      await exactQuery.limit(limit);
    if (exactError)
      throw new Error(`searchByName exact failed: ${exactError.message}`);
    if (exactData && exactData.length > 0) {
      return (exactData as DBCardRow[]).map(dbRowToCard);
    }

    if (opts.fuzzy === false) return [];

    // Build a prefix tsquery so "bar" matches "bard", "barrage", etc.
    // Each normalized token gets a :* suffix; tokens are AND-joined.
    // Omitting `type` makes the client use to_tsquery() (raw syntax), which supports :*.
    const prefixQuery = norm
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `${w}:*`)
      .join(" & ");

    // Fetch more candidates than needed so the in-memory scorer can re-rank properly.
    // Use a slim projection here — scoreCard only needs id/name/name_normalized.
    const fetchLimit = Math.min(Math.max(limit * 20, 100), 500);

    let ftsQuery = supabase
      .from("cards")
      .select(CARD_SELECT)
      .textSearch("name_search", prefixQuery, { config: "simple" });

    if (setId) ftsQuery = ftsQuery.eq("set_id", setId);
    if (opts.collector !== undefined && opts.collector !== null) {
      ftsQuery = ftsQuery.eq("collector_number", String(opts.collector));
    }

    const { data: ftsData, error: ftsError } = await ftsQuery.limit(fetchLimit);
    if (ftsError)
      throw new Error(`searchByName FTS failed: ${ftsError.message}`);

    const candidates = ftsData ? (ftsData as DBCardRow[]).map(dbRowToCard) : [];
    return autocompleteSearch(candidates, q, limit);
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
    }

    if (candidates.length > 0) {
      return { request: req, card: candidates[0], matchType: "exact" };
    }

    // Skip global FTS when a set or collector scope was requested to avoid
    // returning unrelated cards for a scoped miss.
    if (req.set || req.collector) {
      return { request: req, card: null, matchType: "not-found" };
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
    Array<{ setCode: string; setName: string; cardCount: number }>
  > {
    const { data, error } = await getSupabaseClient()
      .from("sets")
      .select("set_code, set_name, card_count")
      .order("set_name");

    if (error) throw new Error(`getSets failed: ${error.message}`);
    if (!data) return [];

    return data.map((row) => ({
      setCode: row.set_code,
      setName: row.set_name,
      cardCount: row.card_count ?? 0,
    }));
  }

  async getCardsBySet(
    setCode: string,
    opts: { limit?: number } = {},
  ): Promise<Card[]> {
    const limit = opts.limit ?? 1000;
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

  /** @deprecated Use getStats() */
  getLastRefresh(): number {
    return this.lastRefresh;
  }

  /** @deprecated Use getStats() */
  getCacheSize(): number {
    return this.cardCount;
  }
}
