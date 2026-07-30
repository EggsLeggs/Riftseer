/**
 * Ingestion pipeline coordinator.
 *
 * Flow:
 *   1. Fetch RiftCodex /sets + /cards
 *   2. Normalize to IngestSet + Card; apply file overrides; collapse duplicates
 *   3. Enrich only from TCGPlayer (prices, purchase URIs, fallback images)
 *   4. Link tokens, champions/legends, signatures, related printings
 *   5. Overlay DB overrides (manual cards, patches, relationship edits, deletions)
 *   6. Atomic upsert + prune via ingest_card_data_v2 Postgres RPC
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./utils.ts";
import { fetchAllSets, fetchAllPages } from "./sources/riftcodex.ts";
import { fetchGroups, fetchAllGroupResults } from "./sources/tcgcsv.ts";
import { normalizeSets, normalizeCards } from "./pipeline/normalize.ts";
import { matchTcgGroupsToSets, buildProductMap, enrichCards } from "./pipeline/enrich.ts";
import { linkTokens, linkChampionsLegends, linkSignatures, linkRelatedPrintings } from "./pipeline/link.ts";
import { ingestCardData } from "./pipeline/db.ts";
import { collapseDuplicates } from "./pipeline/dedup.ts";
import { overlayDbOverrides } from "./pipeline/overrides-db.ts";

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

    // 2. Normalize + collapse genuine upstream duplicate printings
    const ingestSets = normalizeSets(rawSets);
    const cards = collapseDuplicates(normalizeCards(rawCards));
    logger.info("Normalized RiftCodex data", {
      sets: ingestSets.length,
      rawCards: rawCards.length,
      cards: cards.length,
    });

    // 3. TCGPlayer enrichment (non-fatal if it fails). TCGPlayer never creates
    // sets or cards; it only enriches the RiftCodex-authoritative records.
    try {
      const tcgGroups = await fetchGroups(timeoutMs);
      const setGroupMap = matchTcgGroupsToSets(ingestSets, tcgGroups);
      const groupResults = await fetchAllGroupResults(tcgGroups, timeoutMs);
      const productMap = buildProductMap(groupResults);
      const enrichment = enrichCards(cards, productMap, setGroupMap);
      logger.info("TCGPlayer enrichment complete", enrichment);
    } catch (err) {
      logger.warn("TCGPlayer enrichment failed — continuing without prices", {
        error: String(err),
      });
    }

    // 4. Link relationships
    linkTokens(cards);
    linkChampionsLegends(cards);
    linkSignatures(cards);
    linkRelatedPrintings(cards);

    // 5–6. Overlay DB overrides, then atomic upsert + prune
    const supabase = createSupabase(env);
    const finalCards = await overlayDbOverrides(supabase, cards);
    await ingestCardData(supabase, ingestSets, finalCards);

    const elapsedMs = Date.now() - t0;
    logger.info("Ingestion complete", {
      sets: ingestSets.length,
      cards: finalCards.length,
      elapsedMs,
    });
    return {
      cardsCount: finalCards.length,
      setsCount: ingestSets.length,
      elapsedMs,
      ok: true,
    };
  } catch (err) {
    const elapsedMs = Date.now() - t0;
    const error = err instanceof Error ? err.message : String(err);
    logger.error("Ingestion pipeline failed", { error });
    return { cardsCount: 0, setsCount: 0, elapsedMs, ok: false, error };
  }
}
