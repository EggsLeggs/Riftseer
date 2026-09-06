import type { Printing, PrintingImage } from "./card.ts";

/**
 * Card art lives in R2 under `cards/<printing-id>/`, so every hosted URL is
 * *derived* from the printing id rather than stored. The database keeps only
 * `image_hosted_at` (is the full variant set present?) and `image_source_hash`
 * (which source were the variants built from?).
 *
 * This module is the single derivation, shared by the ingest worker that writes
 * the objects and the API that hands out the URLs — they cannot disagree about
 * a key or a cache-busting suffix.
 */

/** Production custom domain for the `riftseer-cards` R2 bucket. */
export const CARD_IMAGE_CDN_HOST = "img.riftseer.com";

/** Transcoded WebP variants, widths in pixels. `original` is the source bytes. */
export const CARD_IMAGE_VARIANTS = [
  { name: "small", width: 200, quality: 82 },
  { name: "normal", width: 400, quality: 85 },
  { name: "large", width: 1000, quality: 88 },
] as const;

export type CardImageSize = "small" | "normal" | "large" | "original";

/**
 * Preference ladder per requested size. A caller asking for `small` would
 * rather have a larger variant than nothing, and every printing that is hosted
 * at all has the whole set — so the ladder only matters for unhosted art,
 * where `original` is the one key present.
 */
const SIZE_FALLBACKS: Record<CardImageSize, readonly CardImageSize[]> = {
  small: ["small", "normal", "large", "original"],
  normal: ["normal", "large", "small", "original"],
  large: ["large", "normal", "small", "original"],
  original: ["original", "large", "normal", "small"],
};

function normalizeBaseUrl(baseUrl: string): URL {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("CARD_IMAGE_BASE_URL must use HTTP or HTTPS");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

function objectPrefix(printingId: string): string {
  return `cards/${encodeURIComponent(printingId)}`;
}

/** R2 object keys the image queue writes for one printing. */
export function printingImageObjectKeys(printingId: string): Record<CardImageSize, string> {
  const prefix = objectPrefix(printingId);
  return {
    small: `${prefix}/small.webp`,
    normal: `${prefix}/normal.webp`,
    large: `${prefix}/large.webp`,
    original: `${prefix}/original`,
  };
}

/** R2 object key an admin upload is staged under before variants exist. */
export function adminUploadObjectKey(printingId: string, sourceHash: string): string {
  return `${objectPrefix(printingId)}/uploads/${sourceHash}`;
}

/**
 * Public URLs for a hosted printing.
 *
 * The `?v=` suffix is the leading 16 hex of the source hash, so a corrected
 * image bypasses immutable CDN caches without changing the object key.
 */
export function printingImageUrls(
  baseUrl: string,
  printingId: string,
  sourceHash: string,
): Required<PrintingImage> {
  const base = normalizeBaseUrl(baseUrl).toString().replace(/\/$/, "");
  const prefix = objectPrefix(printingId);
  const version = encodeURIComponent(sourceHash.slice(0, 16));
  return {
    small: `${base}/${prefix}/small.webp?v=${version}`,
    normal: `${base}/${prefix}/normal.webp?v=${version}`,
    large: `${base}/${prefix}/large.webp?v=${version}`,
    original: `${base}/${prefix}/original?v=${version}`,
  };
}

/**
 * Map a URL on our own CDN back to its R2 key, or null for an upstream URL.
 *
 * The queue consumer uses this to read an admin upload through the R2 binding
 * instead of fetching `img.riftseer.com`, which 404s under local wrangler
 * (local R2, production CDN hostname).
 */
export function hostedObjectKeyFromUrl(
  sourceUrl: string,
  baseUrl: string,
): string | null {
  try {
    const parsed = new URL(sourceUrl);
    const base = normalizeBaseUrl(baseUrl);
    if (parsed.origin !== base.origin) return null;

    const basePath = base.pathname.replace(/\/+$/, "");
    let path = parsed.pathname;
    if (basePath && path.startsWith(basePath)) {
      path = path.slice(basePath.length);
    }
    path = path.replace(/^\/+/, "");
    if (!path.startsWith("cards/")) return null;
    // Re-check after decoding: a percent-encoded path can decode to a key
    // outside the prefix, and the decoded form is what R2 is asked for.
    const key = decodeURIComponent(path);
    return key.startsWith("cards/") ? key : null;
  } catch {
    return null;
  }
}

/** True when `url` points at a Riftseer-hosted card object. */
export function isHostedCardImageUrl(url: string, baseUrl?: string): boolean {
  if (baseUrl) return hostedObjectKeyFromUrl(url, baseUrl) !== null;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === CARD_IMAGE_CDN_HOST &&
      parsed.pathname.startsWith("/cards/")
    );
  } catch {
    return false;
  }
}

/** Pick a display URL for a printing's art, walking the size ladder. */
export function printingImageUrl(
  printing: Pick<Printing, "image"> | undefined | null,
  size: CardImageSize = "normal",
): string | undefined {
  const image = printing?.image;
  if (!image) return undefined;
  for (const key of SIZE_FALLBACKS[size]) {
    const value = image[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/** Best URL for a "download image" action: original bytes when available. */
export function printingImageDownloadUrl(
  printing: Pick<Printing, "image"> | undefined | null,
): string | undefined {
  return printingImageUrl(printing, "original");
}
