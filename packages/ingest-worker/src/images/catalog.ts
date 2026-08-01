import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../utils.ts";
import type { IngestPrinting } from "../pipeline/types.ts";
import {
  hasLockedImage,
  isHosted,
  toImageProvider,
  type DurablePrinting,
} from "../pipeline/durable.ts";
import {
  createImageJob,
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

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export interface PreparedImageJobs {
  jobs: CardImageJob[];
  reused: number;
  withoutSource: number;
  /** Printings whose admin-curated image outranked the upstream source. */
  adminPreserved: number;
}

/**
 * Attach source hashes before the catalogue upsert, and decide what to queue.
 *
 * Hosted URLs are derived from the printing id, so there is nothing to carry
 * forward: `image_hosted_at` says the full R2 set exists and `image_source_hash`
 * says which source it was built from. An unchanged hash on a hosted row is
 * already done; anything else is a job.
 */
export async function preparePrintingImageJobs(
  printings: IngestPrinting[],
  durable: Map<string, DurablePrinting>,
  imageBaseUrl: string,
): Promise<PreparedImageJobs> {
  const jobs: CardImageJob[] = [];
  let reused = 0;
  let withoutSource = 0;
  let adminPreserved = 0;

  await Promise.all(
    printings.map(async (printing) => {
      const previous = durable.get(printing.id);

      // An admin upload is a deliberate choice and holds the `image` lock. The
      // ingest RPC would keep the stored source regardless of what we send, but
      // sending an upstream URL anyway would leave this run's in-memory row
      // disagreeing with the database — and only this producer can queue the
      // upload's variants when they are not built yet.
      if (previous && hasLockedImage(previous)) {
        printing.image_source_url = previous.image_source_url ?? undefined;
        printing.image_source_hash = previous.image_source_hash ?? undefined;
        printing.image_source_provider = toImageProvider(
          previous.image_source_provider,
        );
        adminPreserved++;
        if (
          previous.image_source_url &&
          previous.image_source_hash &&
          !isHosted(previous)
        ) {
          jobs.push(
            createImageJob(
              printing.id,
              {
                url: previous.image_source_url,
                provider:
                  toImageProvider(previous.image_source_provider) ?? "admin",
              },
              previous.image_source_hash,
            ),
          );
        }
        return;
      }

      const source = selectBestImageSource(printing, imageBaseUrl);
      if (!source) {
        withoutSource++;
        return;
      }

      const sourceHash = await hashImageSourceUrl(source.url);
      printing.image_source_url = source.url;
      printing.image_source_hash = sourceHash;
      printing.image_source_provider = source.provider;

      if (previous?.image_source_hash === sourceHash && isHosted(previous)) {
        reused++;
        return;
      }
      jobs.push(createImageJob(printing.id, source, sourceHash));
    }),
  );

  jobs.sort((left, right) => left.printingId.localeCompare(right.printingId));
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

/**
 * Every printing that has a source but no hosted variants — the fan-out the
 * queue consumer performs when it receives a catalogue job.
 */
export async function loadPendingCardImageJobs(
  supabase: SupabaseClient,
): Promise<CardImageJob[]> {
  const jobs: CardImageJob[] = [];

  for (let from = 0; ; from += DATABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("printings")
      .select(
        "id, image_source_url, image_source_hash, image_source_provider",
      )
      .is("image_hosted_at", null)
      .order("id")
      .range(from, from + DATABASE_PAGE_SIZE - 1);
    if (error) {
      throw new Error(`load pending printing images failed: ${error.message}`);
    }

    const rows = (data ?? []) as Array<{
      id: string;
      image_source_url: string | null;
      image_source_hash: string | null;
      image_source_provider: string | null;
    }>;
    for (const row of rows) {
      const sourceProvider = toImageProvider(row.image_source_provider);
      if (
        !row.image_source_url ||
        !row.image_source_hash ||
        !SOURCE_HASH_PATTERN.test(row.image_source_hash) ||
        !sourceProvider
      ) {
        continue;
      }
      jobs.push({
        version: CARD_IMAGE_JOB_VERSION,
        printingId: row.id,
        sourceUrl: row.image_source_url,
        sourceHash: row.image_source_hash,
        sourceProvider,
      });
    }

    if (rows.length < DATABASE_PAGE_SIZE) break;
  }

  jobs.sort((left, right) => left.printingId.localeCompare(right.printingId));
  return jobs;
}
