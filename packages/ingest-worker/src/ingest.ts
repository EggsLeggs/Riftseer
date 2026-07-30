/**
 * Ingestion pipeline coordinator.
 *
 * Flow:
 *   1. Fetch RiftCodex /sets + /cards
 *   2. Normalize to IngestSet + Card; apply file overrides; collapse duplicates
 *   3. Enrich only from TCGPlayer (prices, purchase URIs, fallback images)
 *   4. Link tokens, champions/legends, signatures, related printings
 *   5. Overlay DB overrides (manual cards, patches, relationship edits, deletions)
 *   6. File unmatched TCGPlayer products and field disagreements for admin review
 *   7. Preserve unchanged hosted media; prepare jobs for changed source URLs
 *   8. Atomic upsert + prune
 *   9. Re-match rule-scoped rulings, then enqueue image jobs for the consumer
 */

import type { Env } from "./env.ts";
import { logger } from "./utils.ts";
import { fetchAllSets, fetchAllPages } from "./sources/riftcodex.ts";
import { fetchGroups, fetchAllGroupResults } from "./sources/tcgcsv.ts";
import { normalizeSets, normalizeCards } from "./pipeline/normalize.ts";
import {
  backfillLinkedPrices,
  buildProductMap,
  enrichCards,
  matchTcgGroupsToSets,
  type ProductMaps,
} from "./pipeline/enrich.ts";
import {
  buildReconciliationEntries,
  syncReconciliationQueue,
} from "./pipeline/reconcile.ts";
import { linkTokens, linkChampionsLegends, linkSignatures, linkRelatedPrintings } from "./pipeline/link.ts";
import { ingestCardData, refreshRulingRuleMatches } from "./pipeline/db.ts";
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
  /** Unmatched TCGPlayer products and field disagreements awaiting admin review. */
  reviewEntriesCount: number;
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
    // The product map is kept so step 6 can review what enrichment could not
    // reconcile; a failure here leaves it null and skips that step entirely.
    let productMap: ProductMaps | null = null;
    let setGroupMap = new Map<string, number>();
    try {
      const tcgGroups = await fetchGroups(timeoutMs);
      setGroupMap = matchTcgGroupsToSets(ingestSets, tcgGroups);
      const matchedGroupIds = new Set(setGroupMap.values());
      const matchedGroups = tcgGroups.filter((group) =>
        matchedGroupIds.has(group.groupId)
      );
      const groupResults = await fetchAllGroupResults(
        matchedGroups,
        timeoutMs,
      );
      productMap = buildProductMap(groupResults);
      const enrichment = enrichCards(cards, productMap, setGroupMap);
      logger.info("TCGPlayer enrichment complete", enrichment);
    } catch (err) {
      productMap = null;
      logger.warn("TCGPlayer enrichment failed — continuing without prices", {
        error: String(err),
      });
    }

    // 4. Link relationships
    linkTokens(cards);
    linkChampionsLegends(cards);
    linkSignatures(cards);
    linkRelatedPrintings(cards);

    // 5–8. Overlay DB overrides, review what TCGPlayer could not be reconciled
    // with, preserve unchanged R2 media, then atomic upsert + prune.
    // Changed/missing images are processed asynchronously.
    const supabase = createSupabase(env);
    // Independent reads over different tables — no ordering between them.
    const [finalSets, finalCards] = await Promise.all([
      overlayDbSetOverrides(supabase, ingestSets),
      overlayDbOverrides(supabase, cards),
    ]);

    // 6. Reconciliation runs on the final cards so it sees admin-confirmed
    // links, which is what stops a confirmed entry re-surfacing next run. Those
    // links land too late for enrichment, so their prices are backfilled here.
    // The whole step is advisory — a failure must not cost us the ingest.
    let reviewEntriesCount = 0;
    if (productMap) {
      backfillLinkedPrices(finalCards, productMap);
      try {
        const entries = buildReconciliationEntries(
          finalCards,
          productMap,
          setGroupMap,
        );
        await syncReconciliationQueue(supabase, entries, true);
        reviewEntriesCount = entries.length;
      } catch (err) {
        logger.warn("Reconciliation queue sync failed — continuing", {
          error: String(err),
        });
      }
    }

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

    // 9. Rule-scoped rulings are re-materialised against the catalogue we just
    // wrote, so a rule written months ago picks up this run's new printings.
    // Must follow the upsert — it reads `cards`, not the in-memory list.
    const ruleMatches = await refreshRulingRuleMatches(supabase);

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
      reviewEntries: reviewEntriesCount,
      rulingRuleTargets: ruleMatches?.targets ?? 0,
      rulingRuleMatches: ruleMatches?.matches ?? 0,
      elapsedMs,
    });
    return {
      cardsCount: finalCards.length,
      setsCount: finalSets.length,
      imageJobsCount: preparedImages.jobs.length,
      reviewEntriesCount,
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
      reviewEntriesCount: 0,
      elapsedMs,
      ok: false,
      error,
    };
  }
}
