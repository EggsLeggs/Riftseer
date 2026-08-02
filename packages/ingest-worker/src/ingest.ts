/**
 * Ingestion pipeline coordinator.
 *
 * Flow:
 *   1. Fetch RiftCodex /sets + /cards
 *   2. Normalize to IngestSet + IngestPrinting; apply file overrides; collapse
 *      genuine upstream duplicates
 *   3. Seed admin-confirmed TCGPlayer links from the durable printing rows
 *   4. Enrich only from TCGPlayer (prices, purchase URIs, fallback images)
 *   5. Group printings into oracles; record what they disagree about as deltas
 *   6. Write the official gallery's equipment onto the oracles
 *   7. Link tokens, characters and signatures as oracle → oracle edges
 *   8. Hash image sources; leave hosted art alone; queue the rest
 *   9. Batched catalogue upsert, then a final prune carrying the relationships
 *  10. File what could not be reconciled for admin review
 *  11. Re-match rule-scoped rulings, then enqueue the image catalogue scan
 */

import type { Env } from "./env.ts";
import { logger } from "./utils.ts";
import { fetchAllSets, fetchAllPages } from "./sources/riftcodex.ts";
import { fetchGroups, fetchAllGroupResults } from "./sources/tcgcsv.ts";
import { fetchGalleryCards } from "./sources/riftbound-gallery.ts";
import {
  applyGalleryEquipment,
  buildGalleryIndex,
  type GalleryIndex,
} from "./pipeline/gallery.ts";
import { normalizeSets, normalizePrintings } from "./pipeline/normalize.ts";
import {
  buildProductMap,
  enrichPrintings,
  matchTcgGroupsToSets,
  type ProductMaps,
} from "./pipeline/enrich.ts";
import {
  attachProposedOracleIds,
  buildGalleryReconciliationEntries,
  buildReconciliationEntries,
  syncReconciliationQueue,
} from "./pipeline/reconcile.ts";
import { linkOracles } from "./pipeline/link.ts";
import { buildOracles } from "./pipeline/oracles.ts";
import {
  ingestCatalogue,
  loadOracleIdsByKey,
  refreshRulingRuleMatches,
} from "./pipeline/db.ts";
import { collapseDuplicates } from "./pipeline/dedup.ts";
import {
  applyLockedProductLinks,
  loadDurablePrintings,
  type DurablePrinting,
} from "./pipeline/durable.ts";
import { createSupabase } from "./supabase.ts";
import {
  enqueueCardImageCatalogJob,
  preparePrintingImageJobs,
  type PreparedImageJobs,
} from "./images/catalog.ts";

export type { Env } from "./env.ts";

/** Riot's publishing CMS, which serves playriftbound.com's card gallery. */
const DEFAULT_GALLERY_BASE_URL = "https://content.publishing.riotgames.com";

function getTimeoutMs(env: Env): number {
  const parsed = parseInt(env.UPSTREAM_TIMEOUT_MS ?? "30000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

export interface IngestResult {
  oraclesCount: number;
  printingsCount: number;
  setsCount: number;
  imageJobsCount: number;
  /** Fields where printings of one card disagree about the card itself. */
  divergenceCount: number;
  /** Unmatched products, catalogue gaps and field diffs awaiting review. */
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
    const sets = normalizeSets(rawSets);
    const printings = collapseDuplicates(normalizePrintings(rawCards));
    logger.info("Normalized RiftCodex data", {
      sets: sets.length,
      rawCards: rawCards.length,
      printings: printings.length,
    });

    const supabase = createSupabase(env);

    // 3. The durable admin layer. Nearly all of it is enforced inside the ingest
    // RPC by `locked_fields`; the two locks ingest must *read* are the confirmed
    // TCGPlayer link — upstream does not know it, so enrichment cannot match
    // without it — and an admin image upload, handled at step 8. Non-fatal: the
    // run proceeds on upstream data alone, which the locks protect at write time
    // regardless.
    let durable = new Map<string, DurablePrinting>();
    try {
      durable = await loadDurablePrintings(supabase);
      applyLockedProductLinks(printings, durable);
    } catch (err) {
      logger.warn("Durable printing state unavailable — continuing", {
        error: String(err),
      });
    }

    // 4. TCGPlayer enrichment (non-fatal if it fails). TCGPlayer never creates
    // sets or printings; it only enriches the RiftCodex-authoritative records.
    // The product map is kept so step 10 can review what enrichment could not
    // reconcile; a failure here leaves it null and skips that half entirely.
    let productMap: ProductMaps | null = null;
    let setGroupMap = new Map<string, number>();
    try {
      const tcgGroups = await fetchGroups(timeoutMs);
      setGroupMap = matchTcgGroupsToSets(sets, tcgGroups);
      const matchedGroupIds = new Set(setGroupMap.values());
      const matchedGroups = tcgGroups.filter((group) =>
        matchedGroupIds.has(group.groupId)
      );
      const groupResults = await fetchAllGroupResults(matchedGroups, timeoutMs);
      productMap = buildProductMap(groupResults);
      const enrichment = enrichPrintings(printings, productMap, setGroupMap);
      logger.info("TCGPlayer enrichment complete", enrichment);
    } catch (err) {
      productMap = null;
      logger.warn("TCGPlayer enrichment failed — continuing without prices", {
        error: String(err),
      });
    }

    // 5. Group into oracles. Every printing restates the whole card upstream, so
    // this is where the rules object is separated from the cardboard — and where
    // printings that disagree about the card are recorded as deltas.
    const { oracles, deltas, divergences } = buildOracles(printings);

    // 6. Official gallery: the equipment section RiftCodex has no field for,
    // plus the index step 10 uses to spot cards we are missing. Non-fatal for
    // the same reason TCGPlayer is — an outage upstream must not cost us the
    // authoritative card data this run already fetched.
    let galleryIndex: GalleryIndex | null = null;
    try {
      const galleryCards = await fetchGalleryCards({
        baseUrl: env.RIFTBOUND_GALLERY_BASE_URL ?? DEFAULT_GALLERY_BASE_URL,
        timeoutMs,
      });
      galleryIndex = buildGalleryIndex(galleryCards);
      applyGalleryEquipment(oracles, galleryIndex);
    } catch (err) {
      galleryIndex = null;
      logger.warn("Official gallery unavailable — continuing without it", {
        error: String(err),
      });
    }

    // 7. Relationships, as oracle → oracle edges.
    const relationships = linkOracles(oracles);

    // 8. Image preparation is advisory next to the catalogue upsert: it only
    // hashes sources and decides what to queue. A failure costs one cycle of
    // R2-hosted art — printings upsert with upstream sources and no hash, and
    // the next run re-hashes and re-queues them — which is far cheaper than
    // discarding the authoritative RiftCodex data this run already fetched.
    let preparedImages: PreparedImageJobs = {
      jobs: [],
      reused: 0,
      withoutSource: 0,
      adminPreserved: 0,
    };
    try {
      preparedImages = await preparePrintingImageJobs(
        printings,
        durable,
        env.CARD_IMAGE_BASE_URL,
      );
    } catch (err) {
      logger.warn("Image preparation failed — upserting without image hashes", {
        error: String(err),
      });
    }

    // 9. The one step that must succeed.
    const written = await ingestCatalogue(
      supabase,
      sets,
      oracles,
      deltas,
      relationships,
    );

    // 10. Reconciliation runs after the upsert: `proposed_oracle_id` is a uuid,
    // and an oracle this run created has none until it commits. Both observers
    // fail independently, and the whole step is advisory — a failure must not
    // cost us an ingest that already committed.
    let reviewEntriesCount = 0;
    // The queue prune is queue-wide: it drops every pending row this run did not
    // re-observe. Pruning on one source's findings would therefore delete the
    // other's, so it runs only when both reported.
    const observedBothSources = Boolean(productMap && galleryIndex);
    if (productMap || galleryIndex) {
      try {
        const entries = [
          ...(productMap
            ? buildReconciliationEntries(printings, productMap, setGroupMap)
            : []),
          ...(galleryIndex
            ? buildGalleryReconciliationEntries(printings, galleryIndex)
            : []),
        ];
        const proposedKeys = entries
          .map((entry) => entry.payload.oracle_key)
          .filter((key): key is string => Boolean(key));
        if (proposedKeys.length > 0) {
          attachProposedOracleIds(
            entries,
            await loadOracleIdsByKey(supabase, proposedKeys),
          );
        }
        await syncReconciliationQueue(supabase, entries, observedBothSources);
        reviewEntriesCount = entries.length;
      } catch (err) {
        logger.warn("Reconciliation queue sync failed — continuing", {
          error: String(err),
        });
      }
    }

    // 11. Rule-scoped rulings are re-materialised against the catalogue we just
    // wrote, so a rule written months ago picks up this run's new printings.
    // Must follow the upsert — it reads the projection, not the in-memory list.
    const ruleMatches = await refreshRulingRuleMatches(supabase);

    // The catalogue is committed by this point. Enqueuing the scan is only a
    // prompt to go host images, and the next scheduled run re-sends it, so a
    // queue failure must not report an ingest that succeeded as failed.
    try {
      await enqueueCardImageCatalogJob(env.CARD_IMAGE_QUEUE);
    } catch (err) {
      logger.warn("Card image catalog enqueue failed — deferring to next run", {
        error: String(err),
      });
    }

    const elapsedMs = Date.now() - t0;
    logger.info("Ingestion complete", {
      sets: sets.length,
      oracles: written.oracles,
      printings: written.printings,
      deltas: deltas.length,
      divergences: divergences.length,
      relationships: relationships.length,
      imageJobs: preparedImages.jobs.length,
      reusedImages: preparedImages.reused,
      adminImagesPreserved: preparedImages.adminPreserved,
      printingsWithoutQueueSource: preparedImages.withoutSource,
      reviewEntries: reviewEntriesCount,
      rulingRuleTargets: ruleMatches?.targets ?? 0,
      rulingRuleMatches: ruleMatches?.matches ?? 0,
      elapsedMs,
    });
    return {
      oraclesCount: written.oracles,
      printingsCount: written.printings,
      setsCount: sets.length,
      imageJobsCount: preparedImages.jobs.length,
      divergenceCount: divergences.length,
      reviewEntriesCount,
      elapsedMs,
      ok: true,
    };
  } catch (err) {
    const elapsedMs = Date.now() - t0;
    const error = err instanceof Error ? err.message : String(err);
    logger.error("Ingestion pipeline failed", { error });
    return {
      oraclesCount: 0,
      printingsCount: 0,
      setsCount: 0,
      imageJobsCount: 0,
      divergenceCount: 0,
      reviewEntriesCount: 0,
      elapsedMs,
      ok: false,
      error,
    };
  }
}
