import type {
  Card,
  CardMedia,
  CardMediaUrls,
} from "@riftseer/types";
import {
  CARD_IMAGE_JOB_VERSION,
  type CardImageJob,
  type CardImageSourceProvider,
} from "./types.ts";

export const IMAGE_VARIANTS = [
  { name: "small", width: 200, quality: 82 },
  { name: "normal", width: 400, quality: 85 },
  { name: "large", width: 1000, quality: 88 },
] as const;

export interface SelectedImageSource {
  url: string;
  provider: CardImageSourceProvider;
}

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

function isHostedUrl(value: string, baseUrl: string): boolean {
  try {
    const parsed = new URL(value);
    const base = normalizeBaseUrl(baseUrl);
    const cardsPrefix = `${base.pathname}/cards/`.replace(/\/{2,}/g, "/");
    return (
      parsed.origin === base.origin &&
      parsed.pathname.startsWith(cardsPrefix)
    );
  } catch {
    return false;
  }
}

/**
 * R2 object key for a URL on our card-image CDN, or null when the URL is an
 * upstream source. Admin uploads store the source under
 * `cards/<id>/uploads/<hash>` in the same bucket the processor writes variants
 * to — reading that key directly avoids fetching `img.riftseer.com` over HTTP,
 * which 404s in local wrangler (local R2, production CDN hostname).
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

function inferProvider(url: string): CardImageSourceProvider {
  try {
    return new URL(url).hostname.toLowerCase().includes("tcgplayer")
      ? "tcgplayer"
      : "riftcodex";
  } catch {
    return "riftcodex";
  }
}

export function selectBestImageSource(
  card: Pick<Card, "media">,
  hostedBaseUrl: string,
): SelectedImageSource | null {
  const media = card.media;
  if (!media) return null;

  const candidates = [
    media.source_url,
    media.media_urls?.large,
    media.media_urls?.normal,
    media.media_urls?.png,
    media.media_urls?.small,
  ];
  const url = candidates.find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.length > 0,
  );
  if (!url || isHostedUrl(url, hostedBaseUrl)) return null;

  return {
    url,
    provider: media.source_provider ?? inferProvider(url),
  };
}

export async function hashImageSourceUrl(sourceUrl: string): Promise<string> {
  const bytes = new TextEncoder().encode(sourceUrl);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function cardObjectPrefix(cardId: string): string {
  return `cards/${encodeURIComponent(cardId)}`;
}

export function buildHostedMediaUrls(
  baseUrl: string,
  cardId: string,
  sourceHash: string,
): Required<Pick<CardMediaUrls, "small" | "normal" | "large" | "original">> {
  const base = normalizeBaseUrl(baseUrl).toString().replace(/\/$/, "");
  const prefix = cardObjectPrefix(cardId);
  const version = encodeURIComponent(sourceHash.slice(0, 16));
  return {
    small: `${base}/${prefix}/small.webp?v=${version}`,
    normal: `${base}/${prefix}/normal.webp?v=${version}`,
    large: `${base}/${prefix}/large.webp?v=${version}`,
    original: `${base}/${prefix}/original?v=${version}`,
  };
}

export function buildImageObjectKeys(cardId: string): {
  small: string;
  normal: string;
  large: string;
  original: string;
} {
  const prefix = cardObjectPrefix(cardId);
  return {
    small: `${prefix}/small.webp`,
    normal: `${prefix}/normal.webp`,
    large: `${prefix}/large.webp`,
    original: `${prefix}/original`,
  };
}

export function hasCompleteHostedMedia(
  media: CardMedia | undefined,
  baseUrl: string,
): boolean {
  const urls = media?.media_urls;
  return Boolean(
    urls?.small &&
      urls.normal &&
      urls.large &&
      urls.original &&
      isHostedUrl(urls.small, baseUrl) &&
      isHostedUrl(urls.normal, baseUrl) &&
      isHostedUrl(urls.large, baseUrl) &&
      isHostedUrl(urls.original, baseUrl),
  );
}

export function createImageJob(
  cardId: string,
  source: SelectedImageSource,
  sourceHash: string,
): CardImageJob {
  return {
    version: CARD_IMAGE_JOB_VERSION,
    cardId,
    sourceUrl: source.url,
    sourceHash,
    sourceProvider: source.provider,
  };
}
