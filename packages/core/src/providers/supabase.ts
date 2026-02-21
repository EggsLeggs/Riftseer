/**
 * SupabaseCardProvider
 *
 * Reads card data from Supabase Postgres (populated by the ingest pipeline).
 * Builds an in-memory index (byId, byNorm, Fuse) for fast query serving.
 * Uses Redis as a warmup cache so restarts don't hit Postgres on every deploy.
 *
 * Enable with: CARD_PROVIDER=supabase
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: REDIS_URL (defaults to redis://localhost:6379), FUZZY_THRESHOLD,
 *           CACHE_REFRESH_INTERVAL_MS
 */

import Fuse from "fuse.js";
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
import { getRedisClient } from "../redis/client.ts";
import { normalizeCardName } from "../normalize.ts";

// ─── Configuration ────────────────────────────────────────────────────────────

const FUZZY_THRESHOLD = parseFloat(process.env.FUZZY_THRESHOLD ?? "0.4");
const REFRESH_INTERVAL_MS = parseInt(
  process.env.CACHE_REFRESH_INTERVAL_MS ?? "21600000",
  10,
);
const CARDS_PAGE_SIZE = 1000;

// ─── Redis keys ───────────────────────────────────────────────────────────────

const REDIS_SNAPSHOT_PREFIX = "riftseer:snapshot:";
const REDIS_SNAPSHOT_TTL = 86400; // 24 h — keyed by ingested_at, so stale keys expire naturally

function snapshotKey(ingestedAt: string): string {
  // Replace characters that are special in Redis key conventions
  return `${REDIS_SNAPSHOT_PREFIX}${ingestedAt.replace(/[:.]/g, "-")}`;
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
  is_token: boolean;
  updated_at: string;
  ingested_at: string;
  rulings_id: string | null;
  // Joined via FK
  sets: { set_code: string; set_name: string } | null;
  artists: { name: string } | null;
}

// ─── DB row → Card ───────────────────────────────────────────────────────────

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
    updated_at: row.updated_at,
    ingested_at: row.ingested_at,
  };
}

// ─── Redis helpers (silent failures — Redis is optional) ─────────────────────

async function redisSafeGet(key: string): Promise<string | null> {
  try {
    return await getRedisClient().get(key);
  } catch {
    return null;
  }
}

async function redisSafeSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    await getRedisClient().set(key, value, "EX", ttlSeconds);
  } catch {
    // Redis unavailable — continue without caching
  }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function getLatestIngestedAt(): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from("cards")
    .select("ingested_at")
    .order("ingested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to query latest ingested_at: ${error.message}`);
  return data?.ingested_at ?? null;
}

async function loadAllCardsFromDB(): Promise<DBCardRow[]> {
  const supabase = getSupabaseClient();
  const all: DBCardRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("cards")
      .select("*, sets:set_id(set_code, set_name), artists:artist_id(name)")
      .range(from, from + CARDS_PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to load cards from Supabase: ${error.message}`);
    if (!data || data.length === 0) break;

    all.push(...(data as DBCardRow[]));
    if (data.length < CARDS_PAGE_SIZE) break;
    from += CARDS_PAGE_SIZE;
  }

  return all;
}

// ─── Filter helper (shared with index queries) ────────────────────────────────

function applyFilters(cards: Card[], opts: CardSearchOptions): Card[] {
  return cards.filter((c) => {
    if (opts.set && c.set?.set_code !== opts.set.toUpperCase()) return false;
    if (opts.collector && c.collector_number !== String(opts.collector)) return false;
    return true;
  });
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class SupabaseCardProvider implements CardDataProvider {
  readonly sourceName = "supabase";

  private byId = new Map<string, Card>();
  private byNorm = new Map<string, Card[]>();
  private fuse: Fuse<Card> | null = null;
  private lastRefresh = 0;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async warmup(): Promise<void> {
    logger.info("Supabase provider warming up");
    await this.loadAndIndex();

    this.refreshTimer = setInterval(() => {
      this.refresh().catch((err) =>
        logger.error("Scheduled refresh failed", { error: String(err) }),
      );
    }, REFRESH_INTERVAL_MS);
    this.refreshTimer.unref?.();
  }

  async refresh(): Promise<void> {
    logger.info("Refreshing card data from Supabase");
    await this.loadAndIndex();
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // ── Load + index ─────────────────────────────────────────────────────────────

  private async loadAndIndex(): Promise<void> {
    try {
      // 1. Find the current ingested_at timestamp (cheap single-row query)
      const ingestedAt = await getLatestIngestedAt();

      if (!ingestedAt) {
        logger.warn("Supabase has no cards — has the ingest pipeline run?");
        return;
      }

      // 2. Try Redis snapshot keyed by ingested_at (fast path)
      const cached = await redisSafeGet(snapshotKey(ingestedAt));
      let rows: DBCardRow[];

      if (cached) {
        logger.info("Loading cards from Redis snapshot", { ingestedAt });
        rows = JSON.parse(cached) as DBCardRow[];
      } else {
        // 3. Slow path: load from Supabase, then cache in Redis
        logger.info("Loading cards from Supabase", { ingestedAt });
        rows = await loadAllCardsFromDB();
        await redisSafeSet(snapshotKey(ingestedAt), JSON.stringify(rows), REDIS_SNAPSHOT_TTL);
      }

      const cards = rows.map(dbRowToCard);
      this.buildIndex(cards);
      this.lastRefresh = Math.floor(Date.now() / 1000);

      logger.info("Supabase provider ready", {
        count: cards.length,
        ingestedAt,
        source: cached ? "redis" : "supabase",
      });
    } catch (err) {
      // If we already have data in memory, keep serving it rather than crashing
      if (this.byId.size > 0) {
        logger.error("Reload failed — continuing with stale index", { error: String(err) });
      } else {
        logger.error("Warmup failed — provider has no data", { error: String(err) });
      }
    }
  }

  private buildIndex(cards: Card[]): void {
    this.byId.clear();
    this.byNorm.clear();

    for (const card of cards) {
      this.byId.set(card.id, card);
      const key = card.name_normalized;
      if (!this.byNorm.has(key)) this.byNorm.set(key, []);
      this.byNorm.get(key)!.push(card);
    }

    this.fuse = new Fuse(cards, {
      keys: [
        { name: "name", weight: 0.7 },
        { name: "name_normalized", weight: 0.3 },
      ],
      threshold: FUZZY_THRESHOLD,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });

    logger.debug("Index built", { uniqueIds: this.byId.size, uniqueNames: this.byNorm.size });
  }

  // ── CardDataProvider implementation ──────────────────────────────────────────

  async getCardById(id: string): Promise<Card | null> {
    return this.byId.get(id) ?? null;
  }

  async searchByName(q: string, opts: CardSearchOptions = {}): Promise<Card[]> {
    const limit = opts.limit ?? 10;
    const norm = normalizeCardName(q);

    let results = this.byNorm.get(norm) ?? [];

    if (opts.set || opts.collector) {
      results = applyFilters(results, opts);
    }

    if (results.length === 0 && opts.fuzzy !== false && this.fuse) {
      const hits = this.fuse.search(q, { limit: limit * 2 });
      let fuzzy = hits.map((h) => h.item);
      if (opts.set || opts.collector) {
        const filtered = applyFilters(fuzzy, opts);
        if (filtered.length > 0) fuzzy = filtered;
      }
      results = fuzzy;
    }

    return results.slice(0, limit);
  }

  async resolveRequest(req: CardRequest): Promise<ResolvedCard> {
    const norm = normalizeCardName(req.name);
    const candidates = this.byNorm.get(norm) ?? [];

    if (req.set && req.collector) {
      const exact = candidates.find(
        (c) => c.set?.set_code === req.set!.toUpperCase() && c.collector_number === req.collector,
      );
      if (exact) return { request: req, card: exact, matchType: "exact" };
    }

    if (req.set) {
      const withSet = candidates.filter((c) => c.set?.set_code === req.set!.toUpperCase());
      if (withSet.length > 0) return { request: req, card: withSet[0], matchType: "exact" };
      if (candidates.length > 0) {
        logger.debug("Requested set not found; falling back to default printing", {
          name: req.name,
          set: req.set,
        });
      }
    }

    if (candidates.length > 0) {
      return { request: req, card: candidates[0], matchType: "exact" };
    }

    if (this.fuse) {
      const hits = this.fuse.search(req.name, { limit: 1 });
      if (hits.length > 0) {
        return { request: req, card: hits[0].item, matchType: "fuzzy", score: hits[0].score };
      }
    }

    return { request: req, card: null, matchType: "not-found" };
  }

  async getSets(): Promise<Array<{ setCode: string; setName: string; cardCount: number }>> {
    const setMap = new Map<string, { setCode: string; setName: string; cardCount: number }>();
    for (const card of this.byId.values()) {
      if (!card.set?.set_code) continue;
      const existing = setMap.get(card.set.set_code);
      if (existing) {
        existing.cardCount++;
      } else {
        setMap.set(card.set.set_code, {
          setCode: card.set.set_code,
          setName: card.set.set_name ?? card.set.set_code,
          cardCount: 1,
        });
      }
    }
    return Array.from(setMap.values()).sort((a, b) => a.setName.localeCompare(b.setName));
  }

  async getCardsBySet(setCode: string, opts: { limit?: number } = {}): Promise<Card[]> {
    const limit = opts.limit ?? 1000;
    const upper = setCode.toUpperCase();
    const cards = Array.from(this.byId.values()).filter((c) => c.set?.set_code === upper);
    cards.sort((a, b) => {
      const na = a.collector_number ?? "";
      const nb = b.collector_number ?? "";
      const numA = parseInt(na, 10);
      const numB = parseInt(nb, 10);
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
      return na.localeCompare(nb, undefined, { numeric: true });
    });
    return cards.slice(0, limit);
  }

  async getRandomCard(): Promise<Card | null> {
    const keys = Array.from(this.byId.keys());
    if (keys.length === 0) return null;
    return this.byId.get(keys[Math.floor(Math.random() * keys.length)]) ?? null;
  }

  getStats(): { lastRefresh: number; cardCount: number } {
    return { lastRefresh: this.lastRefresh, cardCount: this.byId.size };
  }

  /** @deprecated Use getStats() */
  getLastRefresh(): number {
    return this.lastRefresh;
  }

  /** @deprecated Use getStats() */
  getCacheSize(): number {
    return this.byId.size;
  }
}
