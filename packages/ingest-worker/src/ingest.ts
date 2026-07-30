/**
 * Ingestion pipeline coordinator.
 *
 * Flow:
 *   1. Fetch RiftCodex /sets + /cards
 *   2. Normalize to IngestSet + Card; apply file overrides; collapse duplicates
 *   3. Enrich only from TCGPlayer (prices, purchase URIs, fallback images)
 *   4. Link tokens, champions/legends, signatures, related printings
 *   5. Overlay DB overrides (manual cards, patches, relationship edits, deletions)
 *   6. Preserve unchanged hosted media; prepare jobs for changed source URLs
 *   7. Atomic upsert + prune, then enqueue image jobs for the queue consumer
 */

import type { Env } from "./env.ts";
import { logger } from "./utils.ts";
import { fetchAllSets, fetchAllPages } from "./sources/riftcodex.ts";
import { fetchGroups, fetchAllGroupResults } from "./sources/tcgcsv.ts";
import { normalizeSets, normalizeCards } from "./pipeline/normalize.ts";
import { matchTcgGroupsToSets, buildProductMap, enrichCards } from "./pipeline/enrich.ts";
import { linkTokens, linkChampionsLegends, linkSignatures, linkRelatedPrintings } from "./pipeline/link.ts";
import { ingestCardData } from "./pipeline/db.ts";
import { collapseDuplicates } from "./pipeline/dedup.ts";
import {
  overlayDbOverrides,
  overlayDbSetOverrides,
} from "./pipeline/overrides-db.ts";
import { createSupabase } from "./supabase.ts";
import {
  enqueueCardImageCatalogJob,
  prepareCardImageJobs,
  type PreparedImageJobs,
} from "./images/catalog.ts";

export type { Env } from "./env.ts";

function getTimeoutMs(env: Env): number {
  const parsed = parseInt(env.UPSTREAM_TIMEOUT_MS ?? "30000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

export interface IngestResult {
  cardsCount: number;
  setsCount: number;
  imageJobsCount: number;
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
      const matchedGroupIds = new Set(setGroupMap.values());
      const matchedGroups = tcgGroups.filter((group) =>
        matchedGroupIds.has(group.groupId)
      );
      const groupResults = await fetchAllGroupResults(
        matchedGroups,
        timeoutMs,
      );
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

    // 5–7. Overlay DB overrides, preserve unchanged R2 media, then atomic
    // upsert + prune. Changed/missing images are processed asynchronously.
    const supabase = createSupabase(env);
    const finalSets = await overlayDbSetOverrides(supabase, ingestSets);
    const finalCards = await overlayDbOverrides(supabase, cards);

    // Image preparation is advisory next to the card upsert: it only carries
    // hosted URLs forward and hashes sources. A failure costs one cycle of
    // R2-hosted URLs — cards upsert with upstream media and no `source_hash`,
    // and the next run re-hashes and re-queues them — which is far cheaper than
    // discarding the authoritative RiftCodex data this run already fetched.
    let preparedImages: PreparedImageJobs = {
      jobs: [],
      reused: 0,
      withoutSource: 0,
      adminPreserved: 0,
    };
    try {
      preparedImages = await prepareCardImageJobs(
        supabase,
        finalCards,
        env.CARD_IMAGE_BASE_URL,
      );
    } catch (err) {
      logger.warn("Image preparation failed — upserting without media hashes", {
        error: String(err),
      });
    }

    await ingestCardData(supabase, finalSets, finalCards);

    // The card data is committed by this point. Enqueuing the catalogue scan is
    // only a prompt to go host images, and the next scheduled run re-sends it,
    // so a queue failure must not report an ingest that succeeded as failed.
    try {
      await enqueueCardImageCatalogJob(env.CARD_IMAGE_QUEUE);
    } catch (err) {
      logger.warn("Card image catalog enqueue failed — deferring to next run", {
        error: String(err),
      });
    }

    const elapsedMs = Date.now() - t0;
    logger.info("Ingestion complete", {
      sets: finalSets.length,
      cards: finalCards.length,
      imageJobs: preparedImages.jobs.length,
      reusedImages: preparedImages.reused,
      adminImagesPreserved: preparedImages.adminPreserved,
      cardsWithoutQueueSource: preparedImages.withoutSource,
      elapsedMs,
    });
    return {
      cardsCount: finalCards.length,
      setsCount: finalSets.length,
      imageJobsCount: preparedImages.jobs.length,
      elapsedMs,
      ok: true,
    };
  } catch (err) {
    const elapsedMs = Date.now() - t0;
    const error = err instanceof Error ? err.message : String(err);
    logger.error("Ingestion pipeline failed", { error });
    return {
      cardsCount: 0,
      setsCount: 0,
      imageJobsCount: 0,
      elapsedMs,
      ok: false,
      error,
    };
  }
}
