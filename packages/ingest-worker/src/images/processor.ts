import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardMedia } from "@riftseer/types";
import type { Env } from "../env.ts";
import { createSupabase } from "../supabase.ts";
import { logger } from "../utils.ts";
import {
  buildHostedMediaUrls,
  buildImageObjectKeys,
  hasCompleteHostedMedia,
  IMAGE_VARIANTS,
} from "./model.ts";
import {
  enqueueCardImageJobs,
  loadPendingCardImageJobs,
} from "./catalog.ts";
import {
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

interface CurrentCardMedia {
  media: CardMedia;
}

export function hasCompleteCurrentVariantSet(
  objects: Array<Pick<R2Object, "customMetadata"> | null>,
  sourceHash: string,
): boolean {
  return (
    objects.length === IMAGE_VARIANTS.length &&
    objects.every(
      (object) => object?.customMetadata?.sourceHash === sourceHash,
    )
  );
}

async function loadCurrentCardMedia(
  supabase: SupabaseClient,
  cardId: string,
): Promise<CurrentCardMedia | null> {
  const { data, error } = await supabase
    .from("cards")
    .select("media")
    .eq("id", cardId)
    .limit(1);
  if (error) {
    throw new Error(`load card media failed: ${error.message}`);
  }
  const row = (data?.[0] ?? null) as { media: CardMedia | null } | null;
  return row ? { media: row.media ?? {} } : null;
}

async function downloadImage(
  sourceUrl: string,
  timeoutMs: number,
): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType?: string;
}> {
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
      if (
        response.status !== 408 &&
        response.status !== 429 &&
        response.status < 500
      ) {
        throw new PermanentImageError(
          `image source returned ${response.status}`,
        );
      }
      throw new Error(`image source returned ${response.status}`);
    }
    if (!response.body) {
      throw new PermanentImageError("image source returned an empty body");
    }

    const advertisedLength = Number(
      response.headers.get("content-length") ?? "0",
    );
    if (
      Number.isFinite(advertisedLength) &&
      advertisedLength > MAX_SOURCE_BYTES
    ) {
      throw new PermanentImageError(
        `image advertises ${advertisedLength} bytes`,
      );
    }

    const contentType = response.headers.get("content-type")?.split(";")[0];
    return {
      body: response.body,
      contentType: contentType?.startsWith("image/") ? contentType : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function writeVariant(
  env: Env,
  source: ReadableStream<Uint8Array>,
  key: string,
  width: number,
  quality: number,
  metadata: Record<string, string>,
): Promise<void> {
  const transformed = await env.IMAGES.input(source)
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

async function processCardImageJob(
  supabase: SupabaseClient,
  env: Env,
  job: CardImageJob,
): Promise<"queued" | "stale" | "unchanged" | "missing"> {
  const current = await loadCurrentCardMedia(supabase, job.cardId);
  if (!current) return "missing";

  if (
    current.media.source_hash !== job.sourceHash ||
    (current.media.source_url &&
      current.media.source_url !== job.sourceUrl) ||
    (current.media.source_provider === "admin" &&
      job.sourceProvider !== "admin")
  ) {
    return "stale";
  }
  if (
    hasCompleteHostedMedia(current.media, env.CARD_IMAGE_BASE_URL)
  ) {
    return "unchanged";
  }

  const timeoutMs = Number.parseInt(env.UPSTREAM_TIMEOUT_MS, 10);
  const timeout =
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
  const source = await downloadImage(job.sourceUrl, timeout);
  const [originalBody, infoBody] = source.body.tee();
  const keys = buildImageObjectKeys(job.cardId);
  const objectMetadata = {
    cardId: job.cardId,
    sourceHash: job.sourceHash,
    sourceProvider: job.sourceProvider,
  };

  let info: ImageInfoResponse;
  try {
    [info] = await Promise.all([
      env.IMAGES.info(infoBody),
      env.CARD_IMAGES.put(keys.original, originalBody, {
        httpMetadata: {
          contentType: source.contentType ?? "application/octet-stream",
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
    throw new PermanentImageError(
      "image source has no raster dimensions",
    );
  }

  const orientation = info.width > info.height ? "landscape" : "portrait";
  await env.CARD_IMAGE_QUEUE.sendBatch(
    IMAGE_VARIANTS.map((variant) => ({
      body: {
        version: 1 as const,
        type: "variant" as const,
        cardId: job.cardId,
        sourceHash: job.sourceHash,
        variant: variant.name,
        orientation,
      },
      contentType: "json" as const,
    })),
  );
  return "queued";
}

async function processCardImageVariantJob(
  supabase: SupabaseClient,
  env: Env,
  job: CardImageVariantJob,
): Promise<"variant" | "hosted" | "stale" | "unchanged" | "missing"> {
  const current = await loadCurrentCardMedia(supabase, job.cardId);
  if (!current) return "missing";
  if (current.media.source_hash !== job.sourceHash) return "stale";
  if (hasCompleteHostedMedia(current.media, env.CARD_IMAGE_BASE_URL)) {
    return "unchanged";
  }

  const sourceUrl = current.media.source_url;
  const sourceProvider = current.media.source_provider;
  if (
    typeof sourceUrl !== "string" ||
    (sourceProvider !== "riftcodex" &&
      sourceProvider !== "tcgplayer" &&
      sourceProvider !== "admin")
  ) {
    return "stale";
  }

  const keys = buildImageObjectKeys(job.cardId);
  const original = await env.CARD_IMAGES.get(keys.original);
  if (!original?.body) {
    throw new Error("original image is missing from R2");
  }
  const variant = IMAGE_VARIANTS.find(
    (candidate) => candidate.name === job.variant,
  );
  if (!variant) {
    throw new PermanentImageError(`unknown image variant: ${job.variant}`);
  }
  await writeVariant(
    env,
    original.body,
    keys[variant.name],
    variant.width,
    variant.quality,
    {
      cardId: job.cardId,
      sourceHash: job.sourceHash,
      sourceProvider,
      variant: variant.name,
    },
  );

  const hostedVariants = await Promise.all(
    IMAGE_VARIANTS.map((candidate) =>
      env.CARD_IMAGES.head(keys[candidate.name])
    ),
  );
  // Object keys are stable across source changes. Merely finding all three keys
  // is insufficient because some may still contain variants from the previous
  // source. Publish URLs only after every object identifies this exact hash.
  if (!hasCompleteCurrentVariantSet(hostedVariants, job.sourceHash)) {
    return "variant";
  }

  const mediaUrls = buildHostedMediaUrls(
    env.CARD_IMAGE_BASE_URL,
    job.cardId,
    job.sourceHash,
  );
  const { data, error } = await supabase.rpc("apply_card_hosted_media", {
    p_card_id: job.cardId,
    p_source_hash: job.sourceHash,
    p_source_url: sourceUrl,
    p_source_provider: sourceProvider,
    p_orientation: job.orientation,
    p_media_urls: mediaUrls,
  });
  if (error) {
    throw new Error(`apply_card_hosted_media failed: ${error.message}`);
  }
  return data === true ? "hosted" : "stale";
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
        const jobs = await loadPendingCardImageJobs(
          supabase,
          env.CARD_IMAGE_BASE_URL,
        );
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
        const outcome = await processCardImageVariantJob(
          supabase,
          env,
          message.body,
        );
        logger.info("Card image variant job complete", {
          messageId: message.id,
          cardId: message.body.cardId,
          variant: message.body.variant,
          outcome,
        });
        message.ack();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (error instanceof PermanentImageError) {
          logger.error("Discarding permanent card image variant failure", {
            messageId: message.id,
            cardId: message.body.cardId,
            variant: message.body.variant,
            error: detail,
          });
          message.ack();
          continue;
        }

        const delaySeconds = retryDelay(message.attempts);
        logger.error("Retrying card image variant job", {
          messageId: message.id,
          cardId: message.body.cardId,
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
      const outcome = await processCardImageJob(
        supabase,
        env,
        message.body,
      );
      logger.info("Card image job complete", {
        messageId: message.id,
        cardId: message.body.cardId,
        outcome,
      });
      message.ack();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (error instanceof PermanentImageError) {
        logger.error("Discarding permanent card image failure", {
          messageId: message.id,
          cardId: message.body.cardId,
          error: detail,
        });
        message.ack();
        continue;
      }

      const delaySeconds = retryDelay(message.attempts);
      logger.error("Retrying card image job", {
        messageId: message.id,
        cardId: message.body.cardId,
        attempts: message.attempts,
        delaySeconds,
        error: detail,
      });
      message.retry({ delaySeconds });
    }
  }
}
