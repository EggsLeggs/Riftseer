/**
 * RiftSeer ingestion pipeline
 *
 * Run:
 *   bun packages/api/src/ingest.ts            # full ingest + write to Supabase
 *   bun packages/api/src/ingest.ts --dry-run   # fetch + transform, log only — no writes
 *
 * Pipeline:
 *   1. Fetch all cards from RiftCodex (reuses fetchAllPages + toCardV2 from core)
 *   2. Enrich with TCGPlayer prices via tcgcsv.com (match by normalized name)
 *   3. Derive all_parts / used_by from card ability text (token linking)
 *   4. Upsert sets, artists, cards into Supabase Postgres
 *
 * Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional env: RIFTCODEX_BASE_URL, UPSTREAM_TIMEOUT_MS
 */

import { normalizeCardName, logger, fetchAllPages, toCardV2 } from "@riftseer/core";
import { getSupabaseClient } from "@riftseer/core/server";
import type { CardV2, RelatedCard } from "@riftseer/core";

const DRY_RUN = process.argv.includes("--dry-run");

if (DRY_RUN) logger.info("DRY RUN — no data will be written to Supabase");

// ─── TCGPlayer config ─────────────────────────────────────────────────────────

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";
const TCGCSV_CATEGORY = 89; // Riftbound League of Legends Trading Card Game
const RIFTBOUND_GROUPS = [24344, 24439, 24502, 24519, 24528, 24552, 24560];
const TIMEOUT_MS = parseInt(process.env.UPSTREAM_TIMEOUT_MS ?? "30000", 10);
const CHUNK_SIZE = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

interface TCGProduct {
  productId: number;
  url: string;
  usdMarket: number | null;
  usdLow: number | null;
  usdFoilMarket: number | null;
  usdFoilLow: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function timedFetch(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ─── Step 1: Fetch RiftCodex ──────────────────────────────────────────────────

async function fetchRiftCodexCards(): Promise<CardV2[]> {
  logger.info("Fetching cards from RiftCodex...");
  const rawCards = await fetchAllPages();
  const cards = rawCards.map(toCardV2);
  logger.info("Fetched from RiftCodex", { count: cards.length });
  return cards;
}

// ─── Step 2: TCGPlayer enrichment ────────────────────────────────────────────

async function loadTCGProducts(): Promise<Map<string, TCGProduct>> {
  logger.info("Loading TCGPlayer products from tcgcsv.com...");
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const groupResults = await Promise.all(
      RIFTBOUND_GROUPS.map(async (groupId) => {
        const base = `${TCGCSV_BASE}/${TCGCSV_CATEGORY}/${groupId}`;
        const [productsRes, pricesRes] = await Promise.all([
          fetch(`${base}/products`, { signal: ctrl.signal }),
          fetch(`${base}/prices`, { signal: ctrl.signal }),
        ]);
        if (!productsRes.ok || !pricesRes.ok) {
          logger.warn("Skipping TCGPlayer group — fetch failed", { groupId });
          return { products: [], prices: [] };
        }
        const productsRaw: unknown = await productsRes.json();
        const pricesRaw: unknown = await pricesRes.json();
        // tcgcsv returns plain arrays; guard against unexpected shapes
        const products = Array.isArray(productsRaw)
          ? (productsRaw as Array<{ productId: number; cleanName: string; url: string }>)
          : [];
        const prices = Array.isArray(pricesRaw)
          ? (pricesRaw as Array<{
              productId: number;
              lowPrice: number | null;
              marketPrice: number | null;
              subTypeName: string;
            }>)
          : [];
        return { products, prices };
      }),
    );

    const map = new Map<string, TCGProduct>();
    for (const { products, prices } of groupResults) {
      const normalById = new Map(
        prices
          .filter((p) => p.subTypeName === "Normal")
          .map((p) => [p.productId, { usdMarket: p.marketPrice, usdLow: p.lowPrice }]),
      );
      const foilById = new Map(
        prices
          .filter((p) => p.subTypeName === "Foil")
          .map((p) => [p.productId, { usdMarket: p.marketPrice, usdLow: p.lowPrice }]),
      );
      for (const product of products) {
        // Guard against malformed rows from external API
        if (
          !Number.isFinite(product.productId) ||
          typeof product.cleanName !== "string" || !product.cleanName.trim() ||
          typeof product.url !== "string" || !product.url.trim()
        ) {
          logger.warn("Skipping malformed TCGPlayer product", { product });
          continue;
        }
        const normal = normalById.get(product.productId);
        if (!normal) continue; // skip sealed products (no Normal price)
        const foil = foilById.get(product.productId);
        const key = normalizeCardName(product.cleanName);
        if (!map.has(key)) {
          map.set(key, {
            productId: product.productId,
            url: product.url,
            usdMarket: normal.usdMarket,
            usdLow: normal.usdLow,
            usdFoilMarket: foil?.usdMarket ?? null,
            usdFoilLow: foil?.usdLow ?? null,
          });
        }
      }
    }

    logger.info("Loaded TCGPlayer products", { count: map.size });
    return map;
  } finally {
    clearTimeout(timeout);
  }
}

function enrichWithTCG(
  cards: CardV2[],
  tcgMap: Map<string, TCGProduct>,
): { enriched: number; unmatchedCount: number } {
  let enriched = 0;
  const matchedKeys = new Set<string>();

  for (const card of cards) {
    const tcg = tcgMap.get(card.name_normalized);
    if (!tcg) continue;

    card.external_ids = { ...card.external_ids, tcgplayer_id: String(tcg.productId) };
    card.purchase_uris = { ...card.purchase_uris, tcgplayer: tcg.url };
    card.prices = {
      usd: tcg.usdMarket,
      usd_foil: tcg.usdFoilMarket,
    };
    matchedKeys.add(card.name_normalized);
    enriched++;
  }

  const unmatchedCount = Array.from(tcgMap.keys()).filter((k) => !matchedKeys.has(k)).length;
  if (unmatchedCount > 0) {
    logger.debug("Unmatched TCGPlayer products (not in RiftCodex; may be tokens or promos)", {
      unmatchedCount,
    });
  }
  return { enriched, unmatchedCount };
}

// ─── Step 3: Token linking ────────────────────────────────────────────────────

// Matches capitalized phrases directly before "Token" / "Tokens", e.g.:
//   "create a Poro Token"  →  "Poro"
//   "summon a Radiant Guardian Token"  →  "Radiant Guardian"
const TOKEN_REF_RE = /\b([A-Z][A-Za-z\s]+?)\s+[Tt]okens?\b/g;

function linkTokens(cards: CardV2[]): void {
  const tokenByNorm = new Map<string, CardV2>();
  for (const card of cards) {
    if (card.is_token) tokenByNorm.set(card.name_normalized, card);
  }

  if (tokenByNorm.size === 0) {
    logger.info("No token cards found — skipping token linking");
    return;
  }

  // tokenId → list of non-token cards that reference it
  const usedByAccum = new Map<string, RelatedCard[]>();

  for (const card of cards) {
    if (card.is_token) continue;
    const text = card.text?.plain ?? "";
    if (!text) continue;

    const seen = new Set<string>();
    for (const match of text.matchAll(TOKEN_REF_RE)) {
      const tokenNorm = normalizeCardName(match[1].trim());
      const token = tokenByNorm.get(tokenNorm);
      if (!token || seen.has(token.id)) continue;
      seen.add(token.id);

      card.all_parts.push({
        object: "related_card",
        id: token.id,
        name: token.name,
        component: "token",
        uri: `/api/v1/cards/${token.id}`,
      });

      if (!usedByAccum.has(token.id)) usedByAccum.set(token.id, []);
      usedByAccum.get(token.id)!.push({
        object: "related_card",
        id: card.id,
        name: card.name,
        component: "token_of",
        uri: `/api/v1/cards/${card.id}`,
      });
    }
  }

  for (const card of cards) {
    if (!card.is_token) continue;
    const refs = usedByAccum.get(card.id);
    if (refs) card.used_by = refs;
  }

  logger.info("Token linking complete", {
    tokens: tokenByNorm.size,
    linkedTokens: usedByAccum.size,
  });
}

// ─── Step 4: Upsert to Supabase ───────────────────────────────────────────────

async function upsertSets(cards: CardV2[]): Promise<Map<string, string>> {
  const deduped = new Map<string, { set_code: string; set_name: string }>();
  for (const card of cards) {
    if (card.set?.set_code && !deduped.has(card.set.set_code)) {
      deduped.set(card.set.set_code, {
        set_code: card.set.set_code,
        set_name: card.set.set_name,
      });
    }
  }

  const rows = Array.from(deduped.values());
  logger.info("Upserting sets", { count: rows.length });

  if (DRY_RUN) {
    logger.info("[DRY RUN] Sets", { sets: rows.map((r) => r.set_code) });
    return new Map(rows.map((r, i) => [r.set_code, `dry-set-${i}`]));
  }

  const { data, error } = await getSupabaseClient()
    .from("sets")
    .upsert(rows, { onConflict: "set_code" })
    .select("id, set_code");
  if (error) throw new Error(`upsertSets: ${error.message}`);

  return new Map((data ?? []).map((r: { id: string; set_code: string }) => [r.set_code, r.id]));
}

async function upsertArtists(cards: CardV2[]): Promise<Map<string, string>> {
  const names = new Set<string>();
  for (const card of cards) {
    if (card.artist) names.add(card.artist);
  }

  const rows = Array.from(names).map((name) => ({ name }));
  logger.info("Upserting artists", { count: rows.length });

  if (DRY_RUN) {
    logger.info("[DRY RUN] Artists", { count: rows.length });
    return new Map(rows.map((r, i) => [r.name, `dry-artist-${i}`]));
  }

  const { data, error } = await getSupabaseClient()
    .from("artists")
    .upsert(rows, { onConflict: "name" })
    .select("id, name");
  if (error) throw new Error(`upsertArtists: ${error.message}`);

  return new Map((data ?? []).map((r: { id: string; name: string }) => [r.name, r.id]));
}

async function upsertCards(
  cards: CardV2[],
  setIds: Map<string, string>,
  artistIds: Map<string, string>,
): Promise<void> {
  const now = new Date().toISOString();

  const rows = cards.map((card) => ({
    id: card.id,
    name: card.name,
    name_normalized: card.name_normalized,
    collector_number: card.collector_number ?? null,
    released_at: card.released_at ?? null,
    set_id: card.set?.set_code ? (setIds.get(card.set.set_code) ?? null) : null,
    artist_id: card.artist ? (artistIds.get(card.artist) ?? null) : null,
    external_ids: card.external_ids ?? {},
    attributes: card.attributes ?? {},
    classification: card.classification ?? {},
    text: card.text ?? {},
    metadata: card.metadata ?? {},
    media: card.media ?? {},
    purchase_uris: card.purchase_uris ?? {},
    prices: card.prices ?? {},
    all_parts: card.all_parts,
    used_by: card.used_by,
    is_token: card.is_token,
    ingested_at: now,
  }));

  logger.info("Upserting cards", { count: rows.length });

  if (DRY_RUN) {
    logger.info("[DRY RUN] Cards", { count: rows.length, sample: rows[0] });
    return;
  }

  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const { error } = await getSupabaseClient()
      .from("cards")
      .upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`upsertCards batch: ${error.message}`);
    logger.debug("Upserted card batch", { count: batch.length });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  logger.info("Ingestion pipeline starting", { dryRun: DRY_RUN });
  const t0 = Date.now();

  // 1. RiftCodex
  const cards = await fetchRiftCodexCards();

  // 2. TCGPlayer enrichment (non-fatal — continue without prices if it fails)
  try {
    const tcgMap = await loadTCGProducts();
    const { enriched, unmatchedCount } = enrichWithTCG(cards, tcgMap);
    logger.info("TCGPlayer enrichment done", { enriched, unmatchedCount });
  } catch (err) {
    logger.warn("TCGPlayer enrichment failed — continuing without prices", {
      error: String(err),
    });
  }

  // 3. Token linking
  linkTokens(cards);

  // 4. Upsert to Supabase
  const setIds = await upsertSets(cards);
  const artistIds = await upsertArtists(cards);
  await upsertCards(cards, setIds, artistIds);

  logger.info("Ingestion complete", { cards: cards.length, elapsedMs: Date.now() - t0 });
}

main().catch((err) => {
  logger.error("Ingestion pipeline failed", { error: String(err) });
  process.exit(1);
});
