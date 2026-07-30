export const CARD_IMAGE_JOB_VERSION = 1 as const;
export const CARD_IMAGE_CATALOG_JOB_VERSION = 1 as const;

export type CardImageSourceProvider =
  | "riftcodex"
  | "tcgplayer"
  | "admin";

export interface CardImageJob {
  version: typeof CARD_IMAGE_JOB_VERSION;
  cardId: string;
  sourceUrl: string;
  sourceHash: string;
  sourceProvider: CardImageSourceProvider;
}

export interface CardImageCatalogJob {
  version: typeof CARD_IMAGE_CATALOG_JOB_VERSION;
  type: "catalog";
}

export type CardImageVariantName = "small" | "normal" | "large";

export interface CardImageVariantJob {
  version: typeof CARD_IMAGE_JOB_VERSION;
  type: "variant";
  cardId: string;
  sourceHash: string;
  variant: CardImageVariantName;
  orientation: "portrait" | "landscape";
}

export type CardImageQueueJob =
  | CardImageJob
  | CardImageCatalogJob
  | CardImageVariantJob;

export function isCardImageCatalogJob(
  value: unknown,
): value is CardImageCatalogJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<CardImageCatalogJob>;
  return (
    job.version === CARD_IMAGE_CATALOG_JOB_VERSION &&
    job.type === "catalog"
  );
}

export function isCardImageJob(value: unknown): value is CardImageJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<CardImageJob>;
  return (
    job.version === CARD_IMAGE_JOB_VERSION &&
    typeof job.cardId === "string" &&
    job.cardId.length > 0 &&
    typeof job.sourceUrl === "string" &&
    job.sourceUrl.length > 0 &&
    typeof job.sourceHash === "string" &&
    /^[a-f0-9]{64}$/.test(job.sourceHash) &&
    (job.sourceProvider === "riftcodex" ||
      job.sourceProvider === "tcgplayer" ||
      job.sourceProvider === "admin")
  );
}

export function isCardImageVariantJob(
  value: unknown,
): value is CardImageVariantJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<CardImageVariantJob>;
  return (
    job.version === CARD_IMAGE_JOB_VERSION &&
    job.type === "variant" &&
    typeof job.cardId === "string" &&
    job.cardId.length > 0 &&
    typeof job.sourceHash === "string" &&
    /^[a-f0-9]{64}$/.test(job.sourceHash) &&
    (job.variant === "small" ||
      job.variant === "normal" ||
      job.variant === "large") &&
    (job.orientation === "portrait" || job.orientation === "landscape")
  );
}
