/**
 * RiftCodex provider
 *
 * Upstream: https://api.riftcodex.com
 * Docs:     https://riftcodex.com/docs/category/riftcodex-api
 *
 * API behaviour (as observed 2026-02):
 *   GET /cards?page=N&size=100  →  { items: RawCard[], total, page, size, pages }
 *   GET /cards/{id}             →  RawCard (flat, not wrapped)
 *   Max usable page size: 100
 *   No server-side name search; we fetch all cards and build an in-memory index.
 */

import Fuse from "fuse.js";
import type { CardDataProvider } from "../provider.ts";
import type { CardV2, CardRequest, CardSearchOptions, ResolvedCard } from "../types.ts";
import { normalizeCardName } from "../normalize.ts";
import { getCachedCards, setCachedCards } from "../db.ts";
import { logger } from "../logger.ts";

// ─── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = (process.env.RIFTCODEX_BASE_URL ?? "https://api.riftcodex.com").replace(/\/$/, "");
const REFRESH_INTERVAL_MS = parseInt(process.env.CACHE_REFRESH_INTERVAL_MS ?? "21600000", 10);
const TIMEOUT_MS = parseInt(process.env.UPSTREAM_TIMEOUT_MS ?? "15000", 10);
const FUZZY_THRESHOLD = parseFloat(process.env.FUZZY_THRESHOLD ?? "0.4");
const PAGE_SIZE = 100;

// ─── Raw upstream shapes ───────────────────────────────────────────────────────

interface RawAttributes {
  energy: number | null;
  might: number | null;
  power: number | null;
}

interface RawClassification {
  type: string;
  supertype: string | null;
  rarity: string;
  domain: string[];
}

interface RawText {
  rich: string;
  plain: string;
}

interface RawSet {
  set_id: string;
  /** Full set name (e.g. "Origins: Proving Grounds") */
  name?: string;
  /** Short label (e.g. "Proving Grounds") */
  label: string;
}

interface RawMedia {
  image_url: string;
  artist: string;
  accessibility_text: string;
}

interface RawMetadata {
  clean_name: string;
  alternate_art: boolean;
  overnumbered: boolean;
  signature: boolean;
}

interface RawCard {
  id: string;
  name: string;
  riftbound_id: string;
  tcgplayer_id?: string;
  public_code: string;
  collector_number: number;
  attributes: RawAttributes;
  classification: RawClassification;
  text: RawText;
  set: RawSet;
  media: RawMedia;
  tags: string[];
  orientation: string;
  metadata: RawMetadata;
  [k: string]: unknown;
}

interface PagedResponse {
  items: RawCard[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export { normalizeCardName } from "../normalize.ts";

// ─── Raw → CardV2 mapping ──────────────────────────────────────────────────────

export function toCardV2(raw: RawCard): CardV2 {
  const setCode = raw.set?.set_id?.toUpperCase();
  return {
    object: "card",
    id: raw.id,
    name: raw.name,
    // Always normalise through normalizeCardName so the in-memory index key matches
    name_normalized: normalizeCardName(raw.metadata?.clean_name || raw.name),
    collector_number: String(raw.collector_number),
    external_ids: {
      riftcodex_id: raw.id,
      riftbound_id: raw.riftbound_id || undefined,
      tcgplayer_id: raw.tcgplayer_id || undefined,
    },
    set: setCode
      ? {
          set_code: setCode,
          set_id: raw.set?.set_id,
          set_name: raw.set?.name ?? raw.set?.label ?? setCode,
        }
      : undefined,
    attributes: {
      energy: raw.attributes?.energy ?? null,
      might: raw.attributes?.might ?? null,
      power: raw.attributes?.power ?? null,
    },
    classification: {
      type: raw.classification?.type,
      supertype: raw.classification?.supertype,
      rarity: raw.classification?.rarity,
      tags: raw.tags?.length ? raw.tags : undefined,
      domains: raw.classification?.domain?.length ? raw.classification.domain : undefined,
    },
    text: {
      rich: raw.text?.rich || undefined,
      plain: raw.text?.plain || undefined,
    },
    artist: raw.media?.artist || undefined,
    metadata: {
      alternate_art: raw.metadata?.alternate_art ?? false,
      overnumbered: raw.metadata?.overnumbered ?? false,
      signature: raw.metadata?.signature ?? false,
    },
    media: {
      orientation: raw.orientation || undefined,
      accessibility_text: raw.media?.accessibility_text || undefined,
      media_urls: raw.media?.image_url
        ? { normal: raw.media.image_url }
        : undefined,
    },
    is_token:
      raw.classification?.type?.toLowerCase() === "token" ||
      raw.classification?.supertype?.toLowerCase() === "token" ||
      false,
    all_parts: [],
    used_by: [],
  };
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────────

async function timedFetch(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "riftseer-bot/0.1",
        "Accept": "application/json",
        ...(process.env.RIFTCODEX_API_KEY
          ? { Authorization: `Bearer ${process.env.RIFTCODEX_API_KEY}` }
          : {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchAllPages(): Promise<RawCard[]> {
  const all: RawCard[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = `${BASE_URL}/cards?page=${page}&size=${PAGE_SIZE}`;
    logger.debug("Fetching page", { url });

    let res: Response;
    try {
      res = await timedFetch(url);
    } catch (err) {
      throw new Error(`Network error fetching ${url}: ${err}`);
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
      logger.warn("Rate limited by upstream, waiting", { retryAfterSec: retryAfter });
      await sleep(retryAfter * 1000);
      continue; // retry same page
    }

    if (!res.ok) {
      throw new Error(`Upstream returned ${res.status} ${res.statusText} for ${url}`);
    }

    const body = (await res.json()) as PagedResponse;
    all.push(...(body.items ?? []));

    totalPages = body.pages ?? 1;
    logger.debug("Fetched page", { page, total: body.total, pages: body.pages });
    page++;
  }

  return all;
}

// ─── Provider class ────────────────────────────────────────────────────────────

export class RiftCodexProvider implements CardDataProvider {
  readonly sourceName = "riftcodex";

  private byId = new Map<string, CardV2>();
  private byNorm = new Map<string, CardV2[]>(); // name_normalized → cards
  private fuse: Fuse<CardV2> | null = null;
  private lastRefresh = 0;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async warmup(): Promise<void> {
    logger.info("RiftCodex provider warming up");

    const { cards: rawCards, lastRefresh } = getCachedCards(this.sourceName);
    const ageMs = Date.now() - lastRefresh * 1000;

    // Detect pre-MR7 cache (flat Card format — missing name_normalized)
    const firstCard = rawCards[0] as { name_normalized?: unknown } | undefined;
    const isCardV2 = !firstCard || typeof firstCard.name_normalized === "string";

    if (rawCards.length > 0 && isCardV2 && ageMs < REFRESH_INTERVAL_MS) {
      logger.info("Loaded cards from cache", { count: rawCards.length, ageMs });
      this.buildIndex(rawCards as unknown as CardV2[]);
      this.lastRefresh = lastRefresh;
    } else {
      if (rawCards.length > 0 && !isCardV2) {
        logger.info("Cache format outdated (pre-MR7 flat shape) — refreshing");
      }
      await this.refresh();
    }

    // Schedule periodic background refresh
    this.refreshTimer = setInterval(() => {
      this.refresh().catch((err) =>
        logger.error("Scheduled refresh failed", { error: String(err) })
      );
    }, REFRESH_INTERVAL_MS);
    // Don't prevent process exit if bot/api stops
    this.refreshTimer.unref?.();
  }

  async refresh(): Promise<void> {
    logger.info("Refreshing card data from RiftCodex");
    try {
      const rawCards = await fetchAllPages();
      const cards = rawCards.map(toCardV2);

      setCachedCards(this.sourceName, cards as unknown as Record<string, unknown>[]);
      this.buildIndex(cards);
      this.lastRefresh = Math.floor(Date.now() / 1000);

      logger.info("Card data refreshed", { count: cards.length });
    } catch (err) {
      logger.error("Upstream refresh failed, attempting to use stale cache", {
        error: String(err),
      });

      const { cards: rawCards } = getCachedCards(this.sourceName);
      if (rawCards.length > 0) {
        logger.warn("Using stale cache as fallback", { count: rawCards.length });
        this.buildIndex(rawCards as unknown as CardV2[]);
      } else {
        logger.error("No cache available — provider has no data");
      }
    }
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // ── Index ────────────────────────────────────────────────────────────────────

  private buildIndex(cards: CardV2[]): void {
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

    logger.debug("Index built", {
      uniqueIds: this.byId.size,
      uniqueNames: this.byNorm.size,
    });
  }

  // ── CardDataProvider implementation ──────────────────────────────────────────

  async getCardById(id: string): Promise<CardV2 | null> {
    const cached = this.byId.get(id);
    if (cached) return cached;

    // Try live fetch as fallback (e.g. very new card not yet in cache)
    try {
      const res = await timedFetch(`${BASE_URL}/cards/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const raw = (await res.json()) as RawCard;
      const card = toCardV2(raw);
      // Warm the index so subsequent hits are fast
      this.byId.set(card.id, card);
      return card;
    } catch {
      return null;
    }
  }

  async searchByName(q: string, opts: CardSearchOptions = {}): Promise<CardV2[]> {
    const limit = opts.limit ?? 10;
    const norm = normalizeCardName(q);

    // Exact normalised-name match
    let results = this.byNorm.get(norm) ?? [];

    // Apply optional set / collector filters
    if (opts.set || opts.collector) {
      results = applyFilters(results, opts);
    }

    // Fuzzy fallback
    if (results.length === 0 && opts.fuzzy !== false && this.fuse) {
      const hits = this.fuse.search(q, { limit: limit * 2 });
      let fuzzy = hits.map((h) => h.item);
      if (opts.set || opts.collector) {
        const filtered = applyFilters(fuzzy, opts);
        // Only use the filtered set if it's non-empty; otherwise ignore the filter
        if (filtered.length > 0) fuzzy = filtered;
      }
      results = fuzzy;
    }

    return results.slice(0, limit);
  }

  async resolveRequest(req: CardRequest): Promise<ResolvedCard> {
    const norm = normalizeCardName(req.name);
    const candidates = this.byNorm.get(norm) ?? [];

    // 1. Exact name + set + collector
    if (req.set && req.collector) {
      const exact = candidates.find(
        (c) =>
          c.set?.set_code === req.set!.toUpperCase() &&
          c.collector_number === req.collector
      );
      if (exact) return { request: req, card: exact, matchType: "exact" };
    }

    // 2. Exact name + set
    if (req.set) {
      const withSet = candidates.filter(
        (c) => c.set?.set_code === req.set!.toUpperCase()
      );
      if (withSet.length > 0)
        return { request: req, card: withSet[0], matchType: "exact" };

      // Set specified but not found → fall back to any printing with a log
      if (candidates.length > 0) {
        logger.debug("Requested set not found; falling back to default printing", {
          name: req.name,
          set: req.set,
        });
      }
    }

    // 3. Exact name, any printing
    if (candidates.length > 0) {
      return { request: req, card: candidates[0], matchType: "exact" };
    }

    // 4. Fuzzy fallback
    if (this.fuse) {
      const hits = this.fuse.search(req.name, { limit: 1 });
      if (hits.length > 0) {
        return {
          request: req,
          card: hits[0].item,
          matchType: "fuzzy",
          score: hits[0].score,
        };
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

  async getCardsBySet(setCode: string, opts: { limit?: number } = {}): Promise<CardV2[]> {
    const limit = opts.limit ?? 1000;
    const upper = setCode.toUpperCase();
    const cards = Array.from(this.byId.values()).filter(
      (c) => c.set?.set_code === upper
    );
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

  async getRandomCard(): Promise<CardV2 | null> {
    const keys = Array.from(this.byId.keys());
    if (keys.length === 0) return null;
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    return this.byId.get(randomKey) ?? null;
  }

  // ── Metadata (used by API /meta via getStats()) ───────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyFilters(cards: CardV2[], opts: CardSearchOptions): CardV2[] {
  return cards.filter((c) => {
    if (opts.set && c.set?.set_code !== opts.set.toUpperCase()) return false;
    if (opts.collector && c.collector_number !== String(opts.collector)) return false;
    return true;
  });
}
