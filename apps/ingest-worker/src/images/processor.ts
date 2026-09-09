import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CARD_IMAGE_VARIANTS,
  hostedObjectKeyFromUrl,
  printingImageObjectKeys,
  type CardImageSize,
} from "@riftseer/types/card-image";
import type { Env } from "../env.ts";
import { createSupabase } from "../supabase.ts";
import { logger } from "../utils.ts";
import { enqueueCardImageJobs, loadPendingCardImageJobs } from "./catalog.ts";
import {
  CARD_IMAGE_JOB_VERSION,
  isCardImageCatalogJob,
  isCardImageJob,
  isCardImageVariantJob,
  type CardImageJob,
  type CardImageQueueJob,
  type CardImageVariantJob,
} from "./types.ts";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const CACHE_CONTROL = "public, max-age=31536000, immutable";

class PermanentImageError extends Error {}

/** The image state of one printing, as stored. */
interface CurrentPrintingImage {
  sourceUrl: string | null;
  sourceHash: string | null;
  sourceProvider: string | null;
  orientation: string | null;
  hosted: boolean;
}

/**
 * Every object a printing must have in R2 before it may be published, in one
 * fixed order. `original` counts: it is the URL the download action hands out,
 * so a variant set without it is not a hosted printing.
 */
const HOSTED_IMAGE_SIZES: readonly CardImageSize[] = [
  "original",
  ...CARD_IMAGE_VARIANTS.map((variant) => variant.name),
];

/**
 * True when R2 holds the whole set *and* every object was built from this
 * source.
 *
 * Object keys are stable across source changes, so finding all four keys proves
 * nothing on its own: any of them may still hold bytes transcoded from the
 * previous source. Each has to name this exact hash.
 */
export function hasCompleteCurrentImageSet(
  objects: Array<Pick<R2Object, "customMetadata"> | null>,
  sourceHash: string,
): boolean {
  return (
    objects.length === HOSTED_IMAGE_SIZES.length &&
    objects.every((object) => object?.customMetadata?.sourceHash === sourceHash)
  );
}

function headHostedImageSet(
  bucket: R2Bucket,
  keys: Record<CardImageSize, string>,
): Promise<Array<R2Object | null>> {
  return Promise.all(HOSTED_IMAGE_SIZES.map((size) => bucket.head(keys[size])));
}

/**
 * Stamp `image_hosted_at`, the one act that turns R2 objects into public URLs.
 *
 * Hash-guarded inside the RPC as well: the row must still point at the source
 * these objects were built from, so a run that raced a source change publishes
 * nothing rather than the wrong art. `false` means it lost that race.
 */
async function publishHostedMedia(
  supabase: SupabaseClient,
  printing: {
    printingId: string;
    sourceHash: string;
    sourceUrl: string;
    sourceProvider: string;
    orientation: string | null;
  },
): Promise<boolean> {
  const { data, error } = await supabase.rpc("apply_printing_hosted_media", {
    p_printing_id: printing.printingId,
    p_source_hash: printing.sourceHash,
    p_source_url: printing.sourceUrl,
    p_source_provider: printing.sourceProvider,
    p_orientation: printing.orientation,
    p_alt_text: null,
  });
  if (error) {
    throw new Error(`apply_printing_hosted_media failed: ${error.message}`);
  }
  return data === true;
}

async function loadCurrentPrintingImage(
  supabase: SupabaseClient,
  printingId: string,
): Promise<CurrentPrintingImage | null> {
  const { data, error } = await supabase
    .from("printings")
    .select(
      "image_source_url, image_source_hash, image_source_provider, image_orientation, image_hosted_at",
    )
    .eq("id", printingId)
    .limit(1);
  if (error) {
    throw new Error(`load printing image failed: ${error.message}`);
  }
  const row = (data?.[0] ?? null) as {
    image_source_url: string | null;
    image_source_hash: string | null;
    image_source_provider: string | null;
    image_orientation: string | null;
    image_hosted_at: string | null;
  } | null;
  if (!row) return null;
  return {
    sourceUrl: row.image_source_url,
    sourceHash: row.image_source_hash,
    sourceProvider: row.image_source_provider,
    orientation: row.image_orientation,
    hosted: row.image_hosted_at !== null,
  };
}

interface DownloadedImage {
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  /** True once the byte cap tripped mid-stream, failing every consumer. */
  oversized: () => boolean;
}

/**
 * Cap the stream itself. `Content-Length` is advertised by the origin and may be
 * absent or wrong, so without this an oversized (or endless) body would still be
 * fed to `IMAGES.info()` and `CARD_IMAGES.put()`.
 */
function limitStreamBytes(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Pick<DownloadedImage, "body" | "oversized"> {
  let seen = 0;
  let tripped = false;
  const limited = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > maxBytes) {
          tripped = true;
          controller.error(new PermanentImageError(`image exceeds ${maxBytes} bytes`));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
  return { body: limited, oversized: () => tripped };
}

async function downloadImage(sourceUrl: string, timeoutMs: number): Promise<DownloadedImage> {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new PermanentImageError("image source URL is invalid");
  }
  if (parsed.protocol !== "https:") {
    throw new PermanentImageError("image source URL must use HTTPS");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(parsed, {
      signal: controller.signal,
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
        "User-Agent": "riftseer-image-worker/0.1",
      },
    });
    if (!response.ok) {
      if (response.status !== 408 && response.status !== 429 && response.status < 500) {
        throw new PermanentImageError(`image source returned ${response.status}`);
      }
      throw new Error(`image source returned ${response.status}`);
    }
    if (!response.body) {
      throw new PermanentImageError("image source returned an empty body");
    }

    const advertisedLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(advertisedLength) && advertisedLength > MAX_SOURCE_BYTES) {
      throw new PermanentImageError(`image advertises ${advertisedLength} bytes`);
    }

    const contentType = response.headers.get("content-type")?.split(";")[0];
    return {
      ...limitStreamBytes(response.body, MAX_SOURCE_BYTES),
      contentType: contentType?.startsWith("image/") ? contentType : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * `IMAGES.input` / `IMAGES.info` require a stream with a known length.
 * R2 bodies (and anything piped through `TransformStream`) do not advertise
 * one, so buffer into a Blob whose `.stream()` does.
 */
function blobStream(bytes: Uint8Array, type?: string): ReadableStream<Uint8Array> {
  return new Blob([bytes], type ? { type } : undefined).stream();
}

/**
 * Load the bytes the image job should transform.
 *
 * Hosted admin uploads live in the same R2 bucket under
 * `cards/<id>/uploads/…`. Pull those through the binding — never HTTP — so
 * local wrangler (local R2 + production CDN hostname) and production both
 * resolve the object that was just written.
 */
async function loadImageSource(
  env: Env,
  sourceUrl: string,
  timeoutMs: number,
): Promise<DownloadedImage> {
  const key = hostedObjectKeyFromUrl(sourceUrl, env.CARD_IMAGE_BASE_URL);
  if (!key) {
    return downloadImage(sourceUrl, timeoutMs);
  }

  const object = await env.CARD_IMAGES.get(key);
  if (!object?.body) {
    throw new PermanentImageError("image source returned 404");
  }
  if (typeof object.size === "number" && object.size > MAX_SOURCE_BYTES) {
    throw new PermanentImageError(`image source exceeds ${MAX_SOURCE_BYTES} bytes`);
  }

  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw new PermanentImageError("image source returned 404");
  }
  if (bytes.byteLength > MAX_SOURCE_BYTES) {
    throw new PermanentImageError(`image source exceeds ${MAX_SOURCE_BYTES} bytes`);
  }

  const contentType = object.httpMetadata?.contentType?.split(";")[0];
  const imageType = contentType?.startsWith("image/") ? contentType : undefined;
  return {
    body: blobStream(bytes, imageType),
    contentType: imageType,
    oversized: () => false,
  };
}

async function writeVariant(
  env: Env,
  source: ReadableStream<Uint8Array>,
  key: string,
  width: number,
  quality: number,
  metadata: Record<string, string>,
): Promise<void> {
  const bytes = new Uint8Array(await new Response(source).arrayBuffer());
  const transformed = await env.IMAGES.input(blobStream(bytes))
    .transform({ width, fit: "scale-down" })
    .output({ format: "image/webp", quality, anim: false });
  const response = transformed.response();
  if (!response.ok) {
    throw new Error(`image transform failed with ${response.status}`);
  }
  if (!response.body) {
    throw new Error("image transform returned an empty body");
  }
  await env.CARD_IMAGES.put(key, response.body, {
    httpMetadata: {
      contentType: "image/webp",
      cacheControl: CACHE_CONTROL,
    },
    customMetadata: metadata,
  });
}

function isImagesInputError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return (error as { code?: unknown }).code === 9412;
}

export async function processCardImageJob(
  supabase: SupabaseClient,
  env: Env,
  job: CardImageJob,
): Promise<"queued" | "adopted" | "stale" | "unchanged" | "missing"> {
  const current = await loadCurrentPrintingImage(supabase, job.printingId);
  if (!current) return "missing";

  if (
    current.sourceHash !== job.sourceHash ||
    (current.sourceUrl && current.sourceUrl !== job.sourceUrl) ||
    (current.sourceProvider === "admin" && job.sourceProvider !== "admin")
  ) {
    return "stale";
  }
  if (current.hosted) return "unchanged";

  const keys = printingImageObjectKeys(job.printingId);

  // R2 outlives the rows that point at it. A schema rebuild leaves every object
  // in place and every `image_hosted_at` NULL, and re-fetching 1300 sources to
  // re-transcode bytes we already hold would spend the upload quota producing
  // identical files. So adopt a set that is already complete and current, and
  // fall through to a rebuild only when it is not.
  //
  // `orientation` has to come from the row: nothing here reads the pixels, and
  // publishing without it would leave the printing with no aspect to lay out.
  if (current.orientation) {
    const existing = await headHostedImageSet(env.CARD_IMAGES, keys);
    if (hasCompleteCurrentImageSet(existing, job.sourceHash)) {
      const published = await publishHostedMedia(supabase, {
        printingId: job.printingId,
        sourceHash: job.sourceHash,
        sourceUrl: job.sourceUrl,
        sourceProvider: job.sourceProvider,
        orientation: current.orientation,
      });
      return published ? "adopted" : "stale";
    }
  }

  const timeoutMs = Number.parseInt(env.UPSTREAM_TIMEOUT_MS, 10);
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
  const source = await loadImageSource(env, job.sourceUrl, timeout);
  // Buffer before tee: Blob/R2 streams lose their declared length across
  // TransformStream / tee, and IMAGES.info requires a known-length body.
  const bytes = new Uint8Array(await new Response(source.body).arrayBuffer());
  if (source.oversized() || bytes.byteLength > MAX_SOURCE_BYTES) {
    throw new PermanentImageError(`image source exceeds ${MAX_SOURCE_BYTES} bytes`);
  }
  const objectMetadata = {
    printingId: job.printingId,
    sourceHash: job.sourceHash,
    sourceProvider: job.sourceProvider,
  };
  const contentType = source.contentType ?? "application/octet-stream";

  let info: ImageInfoResponse;
  try {
    [info] = await Promise.all([
      env.IMAGES.info(blobStream(bytes, contentType)),
      env.CARD_IMAGES.put(keys.original, blobStream(bytes, contentType), {
        httpMetadata: {
          contentType,
          cacheControl: CACHE_CONTROL,
        },
        customMetadata: { ...objectMetadata, variant: "original" },
      }),
    ]);
  } catch (error) {
    if (isImagesInputError(error)) {
      throw new PermanentImageError("image source is not a supported image");
    }
    throw error;
  }
  if (!("width" in info) || !("height" in info)) {
    throw new PermanentImageError("image source has no raster dimensions");
  }

  const orientation = info.width > info.height ? "landscape" : "portrait";
  await env.CARD_IMAGE_QUEUE.sendBatch(
    CARD_IMAGE_VARIANTS.map((variant) => ({
      body: {
        version: CARD_IMAGE_JOB_VERSION,
        type: "variant" as const,
        printingId: job.printingId,
        sourceHash: job.sourceHash,
        variant: variant.name,
        orientation,
      },
      contentType: "json" as const,
    })),
  );
  return "queued";
}

export async function processCardImageVariantJob(
  supabase: SupabaseClient,
  env: Env,
  job: CardImageVariantJob,
): Promise<"variant" | "hosted" | "stale" | "unchanged" | "missing"> {
  const current = await loadCurrentPrintingImage(supabase, job.printingId);
  if (!current) return "missing";
  if (current.sourceHash !== job.sourceHash) return "stale";
  if (current.hosted) return "unchanged";

  const sourceUrl = current.sourceUrl;
  const sourceProvider = current.sourceProvider;
  if (
    typeof sourceUrl !== "string" ||
    (sourceProvider !== "riftcodex" && sourceProvider !== "tcgplayer" && sourceProvider !== "admin")
  ) {
    return "stale";
  }

  const keys = printingImageObjectKeys(job.printingId);
  const original = await env.CARD_IMAGES.get(keys.original);
  if (!original?.body) {
    throw new Error("original image is missing from R2");
  }
  const variant = CARD_IMAGE_VARIANTS.find((candidate) => candidate.name === job.variant);
  if (!variant) {
    throw new PermanentImageError(`unknown image variant: ${job.variant}`);
  }
  await writeVariant(env, original.body, keys[variant.name], variant.width, variant.quality, {
    printingId: job.printingId,
    sourceHash: job.sourceHash,
    sourceProvider,
    variant: variant.name,
  });

  // This job wrote one variant; the others belong to sibling jobs that may not
  // have run yet. Publication waits for the last of them.
  if (
    !hasCompleteCurrentImageSet(await headHostedImageSet(env.CARD_IMAGES, keys), job.sourceHash)
  ) {
    return "variant";
  }

  // Hosted URLs are derived from the printing id, so publication is a single
  // `image_hosted_at` stamp.
  const published = await publishHostedMedia(supabase, {
    printingId: job.printingId,
    sourceHash: job.sourceHash,
    sourceUrl,
    sourceProvider,
    orientation: job.orientation,
  });
  return published ? "hosted" : "stale";
}

function retryDelay(attempts: number): number {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
}

export async function processCardImageQueue(
  batch: MessageBatch<CardImageQueueJob>,
  env: Env,
): Promise<void> {
  const supabase = createSupabase(env);
  for (const message of batch.messages) {
    if (isCardImageCatalogJob(message.body)) {
      try {
        const jobs = await loadPendingCardImageJobs(supabase);
        await enqueueCardImageJobs(env.CARD_IMAGE_QUEUE, jobs);
        logger.info("Card image catalog job complete", {
          messageId: message.id,
          jobs: jobs.length,
        });
        message.ack();
      } catch (error) {
        const delaySeconds = retryDelay(message.attempts);
        logger.error("Retrying card image catalog job", {
          messageId: message.id,
          attempts: message.attempts,
          delaySeconds,
          error: error instanceof Error ? error.message : String(error),
        });
        message.retry({ delaySeconds });
      }
      continue;
    }

    if (isCardImageVariantJob(message.body)) {
      try {
        const outcome = await processCardImageVariantJob(supabase, env, message.body);
        logger.info("Card image variant job complete", {
          messageId: message.id,
          printingId: message.body.printingId,
          variant: message.body.variant,
          outcome,
        });
        message.ack();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (error instanceof PermanentImageError) {
          logger.error("Discarding permanent card image variant failure", {
            messageId: message.id,
            printingId: message.body.printingId,
            variant: message.body.variant,
            error: detail,
          });
          message.ack();
          continue;
        }

        const delaySeconds = retryDelay(message.attempts);
        logger.error("Retrying card image variant job", {
          messageId: message.id,
          printingId: message.body.printingId,
          variant: message.body.variant,
          attempts: message.attempts,
          delaySeconds,
          error: detail,
        });
        message.retry({ delaySeconds });
      }
      continue;
    }

    if (!isCardImageJob(message.body)) {
      logger.error("Discarding invalid card image job", {
        messageId: message.id,
      });
      message.ack();
      continue;
    }

    try {
      const outcome = await processCardImageJob(supabase, env, message.body);
      logger.info("Card image job complete", {
        messageId: message.id,
        printingId: message.body.printingId,
        outcome,
      });
      message.ack();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (error instanceof PermanentImageError) {
        logger.error("Discarding permanent card image failure", {
          messageId: message.id,
          printingId: message.body.printingId,
          error: detail,
        });
        message.ack();
        continue;
      }

      const delaySeconds = retryDelay(message.attempts);
      logger.error("Retrying card image job", {
        messageId: message.id,
        printingId: message.body.printingId,
        attempts: message.attempts,
        delaySeconds,
        error: detail,
      });
      message.retry({ delaySeconds });
    }
  }
}
