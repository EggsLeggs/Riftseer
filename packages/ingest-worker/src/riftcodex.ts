/**
 * RiftCodex API fetch + Raw → Card mapping for the ingest worker.
 * Upstream: https://api.riftcodex.com — GET /cards?page=N&size=100
 */

import { normalizeCardName, logger } from "./utils.ts";
import type { Card } from "@riftseer/core";

const PAGE_SIZE = 100;

export interface RiftCodexConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
}

interface RawAttributes {
  energy: number | null;
  might: number | null;
  power: number | null;
}

interface RawClassification {
  type: string;
  supertype: string | null;
  rarity: string;
  domain: string[];
}

interface RawText {
  rich: string;
  plain: string;
}

interface RawSet {
  set_id: string;
  name?: string;
  label: string;
}

interface RawMedia {
  image_url: string;
  artist: string;
  accessibility_text: string;
}

interface RawMetadata {
  clean_name: string;
  alternate_art: boolean;
  overnumbered: boolean;
  signature: boolean;
}

export interface RawCard {
  id: string;
  name: string;
  riftbound_id: string;
  tcgplayer_id?: string;
  public_code: string;
  collector_number: number;
  attributes: RawAttributes;
  classification: RawClassification;
  text: RawText;
  set: RawSet;
  media: RawMedia;
  tags: string[];
  orientation: string;
  metadata: RawMetadata;
  [k: string]: unknown;
}

interface PagedResponse {
  items: RawCard[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export function rawToCard(raw: RawCard): Card {
  const setCode = raw.set?.set_id?.toUpperCase();
  return {
    object: "card",
    id: raw.id,
    name: raw.name,
    name_normalized: normalizeCardName(raw.metadata?.clean_name || raw.name),
    collector_number: String(raw.collector_number),
    external_ids: {
      riftcodex_id: raw.id,
      riftbound_id: raw.riftbound_id || undefined,
      tcgplayer_id: raw.tcgplayer_id || undefined,
    },
    set: setCode
      ? {
          set_code: setCode,
          set_id: raw.set?.set_id,
          set_name: raw.set?.name ?? raw.set?.label ?? setCode,
        }
      : undefined,
    attributes: {
      energy: raw.attributes?.energy ?? null,
      might: raw.attributes?.might ?? null,
      power: raw.attributes?.power ?? null,
    },
    classification: {
      type: raw.classification?.type,
      supertype: raw.classification?.supertype,
      rarity: raw.classification?.rarity,
      tags: raw.tags?.length ? raw.tags : undefined,
      domains: raw.classification?.domain?.length ? raw.classification.domain : undefined,
    },
    text: {
      rich: raw.text?.rich || undefined,
      plain: raw.text?.plain || undefined,
    },
    artist: raw.media?.artist || undefined,
    metadata: {
      alternate_art: raw.metadata?.alternate_art ?? false,
      overnumbered: raw.metadata?.overnumbered ?? false,
      signature: raw.metadata?.signature ?? false,
    },
    media: {
      orientation: raw.orientation || undefined,
      accessibility_text: raw.media?.accessibility_text || undefined,
      media_urls: raw.media?.image_url ? { normal: raw.media.image_url } : undefined,
    },
    is_token:
      raw.classification?.type?.toLowerCase() === "token" ||
      raw.classification?.supertype?.toLowerCase() === "token" ||
      false,
    all_parts: [],
    used_by: [],
    related_champions: [],
    related_legends: [],
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const MAX_429_RETRIES = 5;

export async function fetchAllPages(config: RiftCodexConfig): Promise<RawCard[]> {
  const { baseUrl, apiKey, timeoutMs } = config;
  const base = baseUrl.replace(/\/$/, "");
  const all: RawCard[] = [];
  let page = 1;
  let totalPages = 1;
  let retry429Count = 0;

  while (page <= totalPages) {
    const url = `${base}/cards?page=${page}&size=${PAGE_SIZE}`;
    logger.debug("Fetching page", { url });

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": "riftseer-ingest-worker/0.1",
          Accept: "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
      });
    } catch (err) {
      clearTimeout(t);
      throw new Error(`Network error fetching ${url}: ${err}`);
    }
    clearTimeout(t);

    if (res.status === 429) {
      retry429Count++;
      if (retry429Count > MAX_429_RETRIES) {
        logger.error("Too many 429 responses, aborting page fetch", { page, retry429Count });
        throw new Error(`Rate limited too many times fetching page ${page} (${retry429Count} retries)`);
      }
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "5", 10);
      logger.warn("Rate limited by upstream, waiting", { retryAfterSec: retryAfter, retry429Count });
      await sleep(retryAfter * 1000);
      continue;
    }

    if (!res.ok) {
      throw new Error(`Upstream returned ${res.status} ${res.statusText} for ${url}`);
    }

    const body = (await res.json()) as PagedResponse;
    all.push(...(body.items ?? []));

    totalPages = body.pages ?? 1;
    logger.debug("Fetched page", { page, total: body.total, pages: body.pages });
    retry429Count = 0;
    page++;
  }

  return all;
}
