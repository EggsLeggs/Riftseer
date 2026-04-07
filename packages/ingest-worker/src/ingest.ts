/**
 * Ingestion pipeline coordinator.
 *
 * Flow:
 *   1. Fetch RiftCodex /sets + /cards
 *   2. Normalize to IngestSet + Card; apply overrides
 *   3. Clear duplicate images on alt-art/signature cards (so TCGPlayer fallback works)
 *   4. Fetch TCGCSV groups
 *   5. Reconcile sets (match by tcgplayer_group_id; create promo sets for unmatched groups)
 *   6. Fetch TCGCSV products + prices for all groups
 *   7. Enrich cards with TCGPlayer prices, purchase URIs, and fallback images
 *   8. Link tokens, champions/legends, related printings
 *   9. Atomic upsert via ingest_card_data Postgres RPC
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./utils.ts";
import { fetchAllSets, fetchAllPages } from "./sources/riftcodex.ts";
import { fetchGroups, fetchAllGroupResults } from "./sources/tcgcsv.ts";
import { normalizeSets, normalizeCards } from "./pipeline/normalize.ts";
import { reconcileSets, buildProductMap, enrichCards, clearDuplicateImages } from "./pipeline/enrich.ts";
import { linkTokens, linkChampionsLegends, linkRelatedPrintings } from "./pipeline/link.ts";
import { ingestCardData } from "./pipeline/db.ts";

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RIFTCODEX_BASE_URL?: string;
  RIFTCODEX_API_KEY?: string;
  UPSTREAM_TIMEOUT_MS?: string;
  INGEST_SECRET?: string;
}

function getTimeoutMs(env: Env): number {
  const parsed = parseInt(env.UPSTREAM_TIMEOUT_MS ?? "30000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

function createSupabase(env: Env): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export interface IngestResult {
  cardsCount: number;
  setsCount: number;
  elapsedMs: number;
  ok: boolean;
  error?: string;
}

export async function runIngest(env: Env): Promise<IngestResult> {
  const t0 = Date.now();
  logger.info("Ingestion pipeline starting");

  try {
    const timeoutMs = getTimeoutMs(env);
    const riftcodexConfig = {
      baseUrl: env.RIFTCODEX_BASE_URL ?? "https://api.riftcodex.com",
      apiKey: env.RIFTCODEX_API_KEY,
      timeoutMs,
    };

    // 1. Fetch RiftCodex data in parallel
    logger.info("Fetching RiftCodex sets and cards...");
    const [rawSets, rawCards] = await Promise.all([
      fetchAllSets(riftcodexConfig),
      fetchAllPages(riftcodexConfig),
    ]);

    // 2. Normalize
    const ingestSets = normalizeSets(rawSets);
    const cards = normalizeCards(rawCards);
    logger.info("Normalized RiftCodex data", {
      sets: ingestSets.length,
      cards: cards.length,
    });

    // 3. Clear duplicate images (alt-art within set + cross-set reprints)
    clearDuplicateImages(cards);

    // 4–7. TCGPlayer enrichment (non-fatal if it fails)
    let finalSets = ingestSets;
    try {
      const tcgGroups = await fetchGroups(timeoutMs);

      // 5. Reconcile sets
      finalSets = reconcileSets(ingestSets, tcgGroups);

      // 6. Fetch products+prices for all groups
      const groupResults = await fetchAllGroupResults(tcgGroups, timeoutMs);

      // 7. Enrich cards
      const productMap = buildProductMap(groupResults);
      const { enriched, unmatched } = enrichCards(cards, productMap);
      logger.info("TCGPlayer enrichment complete", { enriched, unmatched });
    } catch (err) {
      logger.warn("TCGPlayer enrichment failed — continuing without prices", {
        error: String(err),
      });
    }

    // 8. Link relationships
    linkTokens(cards);
    linkChampionsLegends(cards);
    linkRelatedPrintings(cards);

    // 9. Atomic upsert
    const supabase = createSupabase(env);
    await ingestCardData(supabase, finalSets, cards);

    const elapsedMs = Date.now() - t0;
    logger.info("Ingestion complete", {
      sets: finalSets.length,
      cards: cards.length,
      elapsedMs,
    });
    return { cardsCount: cards.length, setsCount: finalSets.length, elapsedMs, ok: true };
  } catch (err) {
    const elapsedMs = Date.now() - t0;
    const error = err instanceof Error ? err.message : String(err);
    logger.error("Ingestion pipeline failed", { error });
    return { cardsCount: 0, setsCount: 0, elapsedMs, ok: false, error };
  }
}
