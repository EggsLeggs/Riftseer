import type { CardMedia, CardMediaUrls } from "./card.ts";

/**
 * Hosted R2 variants (see ingest-worker IMAGE_VARIANTS):
 *   small  — 200px wide
 *   normal — 400px wide
 *   large  — 1000px wide
 */
export type CardImageSize = "small" | "normal" | "large";

/** Production custom domain for the `riftseer-cards` R2 bucket. */
export const CARD_IMAGE_CDN_HOST = "img.riftseer.com";

const SIZE_FALLBACKS: Record<CardImageSize, readonly CardImageSize[]> = {
  small: ["small", "normal", "large"],
  normal: ["normal", "large", "small"],
  large: ["large", "normal", "small"],
};

function firstPresent(
  urls: CardMediaUrls,
  keys: readonly (keyof CardMediaUrls)[],
): string | undefined {
  for (const key of keys) {
    const value = urls[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/** True when `url` points at a Riftseer-hosted card object. */
export function isHostedCardImageUrl(url: string): boolean {
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

/**
 * True when at least one display variant is already on the Riftseer CDN.
 * Unmigrated RiftCodex / TCGPlayer URLs return false.
 */
export function hasHostedCardMedia(
  media: CardMedia | undefined | null,
): boolean {
  const urls = media?.media_urls;
  if (!urls) return false;
  return [urls.small, urls.normal, urls.large, urls.original].some(
    (candidate) =>
      typeof candidate === "string" && isHostedCardImageUrl(candidate),
  );
}

/**
 * Pick a display URL for card art.
 *
 * When media is on `img.riftseer.com`, returns the requested size (falling
 * back along the size ladder, CDN URLs only). Unmigrated upstream art ignores
 * `size` and uses the legacy chain so missing size keys cannot break the UI.
 */
export function cardImageUrl(
  media: CardMedia | undefined | null,
  size: CardImageSize = "normal",
): string | undefined {
  const urls = media?.media_urls;
  if (!urls) return undefined;

  if (hasHostedCardMedia(media)) {
    for (const key of SIZE_FALLBACKS[size]) {
      const value = urls[key];
      if (typeof value === "string" && isHostedCardImageUrl(value)) {
        return value;
      }
    }
  }

  return firstPresent(urls, ["normal", "large", "png", "small"]);
}

/**
 * Best URL for a "download image" action: original bytes when hosted,
 * otherwise the upstream PNG (or next-best display URL).
 */
export function cardImageDownloadUrl(
  media: CardMedia | undefined | null,
): string | undefined {
  const urls = media?.media_urls;
  if (!urls) return undefined;

  if (hasHostedCardMedia(media)) {
    for (const key of ["original", "large", "normal", "small"] as const) {
      const value = urls[key];
      if (typeof value === "string" && isHostedCardImageUrl(value)) {
        return value;
      }
    }
  }

  return firstPresent(urls, ["png", "large", "normal", "small"]);
}
