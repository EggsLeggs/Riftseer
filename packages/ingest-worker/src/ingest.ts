/**
 * Ingestion pipeline for the ingest worker (no Elysia dependency).
 * Pipeline: RiftCodex → TCG enrich → token linking → Supabase upsert.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeCardName, logger } from "@riftseer/core";
import type { Card, RelatedCard } from "@riftseer/core";
import { fetchAllPages, rawToCard } from "./riftcodex.ts";

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";
const TCGCSV_CATEGORY = 89;
const RIFTBOUND_GROUPS = [24344, 24439, 24502, 24519, 24528, 24552, 24560];
const CHUNK_SIZE = 100;

const TOKEN_REF_RE = /\b([A-Z][A-Za-z\s]+?)\s+[Tt]okens?\b/g;

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RIFTCODEX_BASE_URL?: string;
  RIFTCODEX_API_KEY?: string;
  UPSTREAM_TIMEOUT_MS?: string;
}

interface TCGProduct {
  productId: number;
  url: string;
  usdMarket: number | null;
  usdLow: number | null;
  usdFoilMarket: number | null;
  usdFoilLow: number | null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function getTimeoutMs(env: Env): number {
  return parseInt(env.UPSTREAM_TIMEOUT_MS ?? "30000", 10);
}

function createSupabase(env: Env): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function fetchRiftCodexCards(env: Env): Promise<Card[]> {
  logger.info("Fetching cards from RiftCodex...");
  const rawCards = await fetchAllPages({
    baseUrl: env.RIFTCODEX_BASE_URL ?? "https://api.riftcodex.com",
    apiKey: env.RIFTCODEX_API_KEY,
    timeoutMs: getTimeoutMs(env),
  });
  const cards = rawCards.map(rawToCard);
  logger.info("Fetched from RiftCodex", { count: cards.length });
  return cards;
}

async function loadTCGProducts(timeoutMs: number): Promise<Map<string, TCGProduct>> {
  logger.info("Loading TCGPlayer products from tcgcsv.com...");
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);

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
        if (
          !Number.isFinite(product.productId) ||
          typeof product.cleanName !== "string" ||
          !product.cleanName.trim() ||
          typeof product.url !== "string" ||
          !product.url.trim()
        ) {
          logger.warn("Skipping malformed TCGPlayer product", { product });
          continue;
        }
        const normal = normalById.get(product.productId);
        if (!normal) continue;
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
  cards: Card[],
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
    logger.debug("Unmatched TCGPlayer products", { unmatchedCount });
  }
  return { enriched, unmatchedCount };
}

function linkTokens(cards: Card[]): void {
  const tokenByNorm = new Map<string, Card>();
  for (const card of cards) {
    if (card.is_token) tokenByNorm.set(card.name_normalized, card);
  }

  if (tokenByNorm.size === 0) {
    logger.info("No token cards found — skipping token linking");
    return;
  }

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

async function upsertSets(supabase: SupabaseClient, cards: Card[]): Promise<Map<string, string>> {
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

  const { data, error } = await supabase
    .from("sets")
    .upsert(rows, { onConflict: "set_code" })
    .select("id, set_code");
  if (error) throw new Error(`upsertSets: ${error.message}`);

  return new Map((data ?? []).map((r: { id: string; set_code: string }) => [r.set_code, r.id]));
}

async function upsertArtists(supabase: SupabaseClient, cards: Card[]): Promise<Map<string, string>> {
  const names = new Set<string>();
  for (const card of cards) {
    if (card.artist) names.add(card.artist);
  }

  const rows = Array.from(names).map((name) => ({ name }));
  logger.info("Upserting artists", { count: rows.length });

  const { data, error } = await supabase
    .from("artists")
    .upsert(rows, { onConflict: "name" })
    .select("id, name");
  if (error) throw new Error(`upsertArtists: ${error.message}`);

  return new Map((data ?? []).map((r: { id: string; name: string }) => [r.name, r.id]));
}

async function upsertCards(
  supabase: SupabaseClient,
  cards: Card[],
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

  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const { error } = await supabase.from("cards").upsert(batch, { onConflict: "id" });
    if (error) throw new Error(`upsertCards batch: ${error.message}`);
    logger.debug("Upserted card batch", { count: batch.length });
  }
}

export interface IngestResult {
  cardsCount: number;
  elapsedMs: number;
  ok: boolean;
  error?: string;
}

export async function runIngest(env: Env): Promise<IngestResult> {
  const t0 = Date.now();
  logger.info("Ingestion pipeline starting");

  try {
    const cards = await fetchRiftCodexCards(env);

    try {
      const tcgMap = await loadTCGProducts(getTimeoutMs(env));
      const { enriched, unmatchedCount } = enrichWithTCG(cards, tcgMap);
      logger.info("TCGPlayer enrichment done", { enriched, unmatchedCount });
    } catch (err) {
      logger.warn("TCGPlayer enrichment failed — continuing without prices", {
        error: String(err),
      });
    }

    linkTokens(cards);

    const supabase = createSupabase(env);
    const setIds = await upsertSets(supabase, cards);
    const artistIds = await upsertArtists(supabase, cards);
    await upsertCards(supabase, cards, setIds, artistIds);

    const elapsedMs = Date.now() - t0;
    logger.info("Ingestion complete", { cards: cards.length, elapsedMs });
    return { cardsCount: cards.length, elapsedMs, ok: true };
  } catch (err) {
    const elapsedMs = Date.now() - t0;
    const error = err instanceof Error ? err.message : String(err);
    logger.error("Ingestion pipeline failed", { error });
    return { cardsCount: 0, elapsedMs, ok: false, error };
  }
}
