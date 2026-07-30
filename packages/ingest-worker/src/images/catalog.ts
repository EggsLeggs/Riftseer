import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card, CardMedia } from "@riftseer/types";
import { logger } from "../utils.ts";
import {
  createImageJob,
  hasCompleteHostedMedia,
  hashImageSourceUrl,
  selectBestImageSource,
} from "./model.ts";
import {
  CARD_IMAGE_CATALOG_JOB_VERSION,
  CARD_IMAGE_JOB_VERSION,
  SOURCE_HASH_PATTERN,
  type CardImageJob,
} from "./types.ts";

const DATABASE_PAGE_SIZE = 1000;
const QUEUE_BATCH_SIZE = 100;
/** PostgREST `in` filter URL limits — chunk large id lists. */
const ID_IN_CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Fetch the stored media of exactly the cards in this batch. Scoping the query
 * to the requested ids keeps the read proportional to the batch rather than to
 * the whole catalogue.
 */
async function loadExistingMedia(
  supabase: SupabaseClient,
  cardIds: string[],
): Promise<Map<string, CardMedia>> {
  const existing = new Map<string, CardMedia>();
  const wantedIds = [...new Set(cardIds)];

  for (const idChunk of chunk(wantedIds, ID_IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, media")
      .in("id", idChunk);
    if (error) {
      throw new Error(`load existing card media failed: ${error.message}`);
    }
    const rows = (data ?? []) as Array<{
      id: string;
      media: CardMedia | null;
    }>;
    for (const row of rows) {
      if (row.media) existing.set(row.id, row.media);
    }
  }
  return existing;
}

export interface PreparedImageJobs {
  jobs: CardImageJob[];
  reused: number;
  withoutSource: number;
  /** Cards whose admin-curated image outranked the upstream source. */
  adminPreserved: number;
}

/**
 * Attach source hashes before the card upsert. When the previous DB row has a
 * complete R2 set for the same hash, carry those URLs forward so ingest does
 * not replace them with upstream URLs.
 */
export async function prepareCardImageJobs(
  supabase: SupabaseClient,
  cards: Card[],
  imageBaseUrl: string,
): Promise<PreparedImageJobs> {
  // Degrade rather than throw: skipping preparation entirely would upsert cards
  // with no `source_hash`, which the catalogue scan ignores — they would never
  // be hosted. Without the previous rows we cannot prove media is unchanged, so
  // every card is re-hashed and re-queued instead of failing the whole ingest.
  let existingById: Map<string, CardMedia>;
  try {
    existingById = await loadExistingMedia(
      supabase,
      cards.map((card) => card.id),
    );
  } catch (error) {
    logger.warn("Existing card media unavailable — re-queuing every image", {
      error: error instanceof Error ? error.message : String(error),
    });
    existingById = new Map();
  }

  const jobs: CardImageJob[] = [];
  let reused = 0;
  let withoutSource = 0;
  let adminPreserved = 0;

  await Promise.all(
    cards.map(async (card) => {
      const source = selectBestImageSource(card, imageBaseUrl);
      if (!source) {
        withoutSource++;
        return;
      }

      const previousMedia = existingById.get(card.id);

      // An admin-curated image outranks anything upstream offers. The queue
      // consumer already refuses to overwrite admin media, but that guard reads
      // the row this ingest is about to write — so the provenance has to survive
      // here too, or the upsert would launder the admin image into an upstream
      // one before the job ever runs.
      if (
        previousMedia?.source_provider === "admin" &&
        source.provider !== "admin"
      ) {
        card.media = previousMedia;
        adminPreserved++;
        const adminUrl = previousMedia.source_url;
        const adminHash = previousMedia.source_hash;
        if (
          adminUrl &&
          adminHash &&
          !hasCompleteHostedMedia(previousMedia, imageBaseUrl)
        ) {
          jobs.push(
            createImageJob(
              card.id,
              { url: adminUrl, provider: "admin" },
              adminHash,
            ),
          );
        }
        return;
      }

      const sourceHash = await hashImageSourceUrl(source.url);
      const currentMedia = card.media ?? {};
      const sourceMetadata: CardMedia = {
        ...currentMedia,
        source_url: source.url,
        source_hash: sourceHash,
        source_provider: source.provider,
      };

      if (
        previousMedia?.source_hash === sourceHash &&
        hasCompleteHostedMedia(previousMedia, imageBaseUrl)
      ) {
        card.media = {
          ...sourceMetadata,
          orientation: previousMedia.orientation ?? currentMedia.orientation,
          media_urls: previousMedia.media_urls,
        };
        reused++;
        return;
      }

      card.media = sourceMetadata;
      jobs.push(createImageJob(card.id, source, sourceHash));
    }),
  );

  jobs.sort((left, right) => left.cardId.localeCompare(right.cardId));
  return { jobs, reused, withoutSource, adminPreserved };
}

export async function enqueueCardImageJobs(
  queue: Queue,
  jobs: CardImageJob[],
): Promise<void> {
  for (const jobChunk of chunk(jobs, QUEUE_BATCH_SIZE)) {
    await queue.sendBatch(
      jobChunk.map((job) => ({
        body: job,
        contentType: "json" as const,
      })),
    );
  }
  logger.info("Card image jobs enqueued", { jobs: jobs.length });
}

export async function enqueueCardImageCatalogJob(
  queue: Queue,
): Promise<void> {
  await queue.send({
    version: CARD_IMAGE_CATALOG_JOB_VERSION,
    type: "catalog",
  });
  logger.info("Card image catalog job enqueued");
}

export async function loadPendingCardImageJobs(
  supabase: SupabaseClient,
  imageBaseUrl: string,
): Promise<CardImageJob[]> {
  const jobs: CardImageJob[] = [];

  for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, media")
      .order("id")
      .range(from, from + DATABASE_PAGE_SIZE - 1);
    if (error) {
      throw new Error(`load pending card images failed: ${error.message}`);
    }

    const rows = (data ?? []) as Array<{
      id: string;
      media: CardMedia | null;
    }>;
    for (const row of rows) {
      const media = row.media ?? {};
      const sourceUrl = media.source_url;
      const sourceHash = media.source_hash;
      const sourceProvider = media.source_provider;
      if (
        typeof sourceUrl !== "string" ||
        typeof sourceHash !== "string" ||
        !SOURCE_HASH_PATTERN.test(sourceHash) ||
        (sourceProvider !== "riftcodex" &&
          sourceProvider !== "tcgplayer" &&
          sourceProvider !== "admin") ||
        hasCompleteHostedMedia(media, imageBaseUrl)
      ) {
        continue;
      }
      jobs.push({
        version: CARD_IMAGE_JOB_VERSION,
        cardId: row.id,
        sourceUrl,
        sourceHash,
        sourceProvider,
      });
    }

    if (rows.length < DATABASE_PAGE_SIZE) break;
  }

  jobs.sort((left, right) => left.cardId.localeCompare(right.cardId));
  return jobs;
}
