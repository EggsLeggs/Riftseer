/**
 * Image source selection and hashing.
 *
 * The R2 keys and public URLs are *not* defined here: they are derived from the
 * printing id by `@riftseer/types/card-image`, which the API shares. A second
 * copy of that derivation is a second chance to disagree about a key or a
 * cache-busting suffix, so there is only one.
 */

import { isHostedCardImageUrl } from "@riftseer/types/card-image";
import type { IngestPrinting } from "../pipeline/types.ts";
import {
  CARD_IMAGE_JOB_VERSION,
  type CardImageJob,
  type CardImageSourceProvider,
} from "./types.ts";

export interface SelectedImageSource {
  url: string;
  provider: CardImageSourceProvider;
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

/**
 * The upstream source to re-host, or null when there is nothing to fetch.
 *
 * A URL already on our own CDN is not a source: re-hosting our own output would
 * transcode a variant of a variant.
 */
export function selectBestImageSource(
  printing: Pick<IngestPrinting, "image_source_url" | "image_source_provider">,
  hostedBaseUrl: string,
): SelectedImageSource | null {
  const url = printing.image_source_url;
  if (!url || isHostedCardImageUrl(url, hostedBaseUrl)) return null;
  return { url, provider: printing.image_source_provider ?? inferProvider(url) };
}

export async function hashImageSourceUrl(sourceUrl: string): Promise<string> {
  const bytes = new TextEncoder().encode(sourceUrl);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function createImageJob(
  printingId: string,
  source: SelectedImageSource,
  sourceHash: string,
): CardImageJob {
  return {
    version: CARD_IMAGE_JOB_VERSION,
    printingId,
    sourceUrl: source.url,
    sourceHash,
    sourceProvider: source.provider,
  };
}
