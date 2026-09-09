import {
  CARD_IMAGE_JOB_VERSION,
  SOURCE_HASH_PATTERN,
  type CardImageJob,
} from "@riftseer/types/card-image";

// The half of the queue contract the API also speaks, re-exported so callers in
// this worker keep one import site for every job shape.
export {
  CARD_IMAGE_JOB_VERSION,
  isCardImageJob,
  SOURCE_HASH_PATTERN,
  type CardImageJob,
  type CardImageSourceProvider,
} from "@riftseer/types/card-image";

/**
 * Version 2: the oracle/printing split renamed the subject of every job from a
 * card to a printing. Bumping rather than aliasing means an in-flight v1 message
 * fails validation and is discarded, instead of being read against the wrong id
 * space.
 *
 * The job version lives in `@riftseer/types` because the API produces these
 * messages and this worker consumes them; a copy on each side is how they came
 * to disagree. The catalogue version has one producer and one consumer, both
 * here, so it stays here.
 */
export const CARD_IMAGE_CATALOG_JOB_VERSION = 2 as const;

export interface CardImageCatalogJob {
  version: typeof CARD_IMAGE_CATALOG_JOB_VERSION;
  type: "catalog";
}

export type CardImageVariantName = "small" | "normal" | "large";

export interface CardImageVariantJob {
  version: typeof CARD_IMAGE_JOB_VERSION;
  type: "variant";
  printingId: string;
  sourceHash: string;
  variant: CardImageVariantName;
  orientation: "portrait" | "landscape";
}

export type CardImageQueueJob = CardImageJob | CardImageCatalogJob | CardImageVariantJob;

export function isCardImageCatalogJob(value: unknown): value is CardImageCatalogJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<CardImageCatalogJob>;
  return job.version === CARD_IMAGE_CATALOG_JOB_VERSION && job.type === "catalog";
}

export function isCardImageVariantJob(value: unknown): value is CardImageVariantJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<CardImageVariantJob>;
  return (
    job.version === CARD_IMAGE_JOB_VERSION &&
    job.type === "variant" &&
    typeof job.printingId === "string" &&
    job.printingId.length > 0 &&
    typeof job.sourceHash === "string" &&
    SOURCE_HASH_PATTERN.test(job.sourceHash) &&
    (job.variant === "small" || job.variant === "normal" || job.variant === "large") &&
    (job.orientation === "portrait" || job.orientation === "landscape")
  );
}
