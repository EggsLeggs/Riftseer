/**
 * RiftCodex API fetch + Raw → Card mapping for the ingest worker.
 * Upstream: https://api.riftcodex.com
 *   GET /sets        → RawSetInfo[]
 *   GET /cards?page=N&size=100 → paginated RawCard[]
 */

import { normalizeCardName, logger } from "../utils.ts";
import type { Card } from "@riftseer/types";
import { repairFlavourText } from "@riftseer/types/card-text";

const PAGE_SIZE = 100;

export interface RiftCodexConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
}

// ─── /sets response ───────────────────────────────────────────────────────────

export interface RawSetInfo {
  set_id: string;
  name?: string;
  label: string;
  tcgplayer_id?: string | number | null;
  cardmarket_id?: string | string[] | null;
  published_on?: string | null;
}

// ─── /cards response ──────────────────────────────────────────────────────────

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
  flavour?: string;
}

interface RawCardSet {
  set_id: string;
  name?: string;
  label: string;
  set_uri?: string;
  set_search_uri?: string;
}

interface RawMedia {
  image_url: string;
  artist: string;
  accessibility_text: string;
  image_url_small?: string;
  image_url_large?: string;
  image_url_png?: string;
}

interface RawMetadata {
  clean_name: string;
  alternate_art: boolean;
  overnumbered: boolean;
  signature: boolean;
  finishes?: string[];
}

interface RawRulings {
  rulings_id?: string;
  rulings_uri?: string;
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
  set: RawCardSet;
  media: RawMedia;
  tags: string[];
  orientation: string;
  metadata: RawMetadata;
  released_at?: string;
  rulings?: RawRulings;
  [k: string]: unknown;
}

interface PagedResponse {
  items: RawCard[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

// ─── Raw → Card mapping ───────────────────────────────────────────────────────

function normalizeDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0];
}

/**
 * RiftCodex currently marks tokens with classification.supertype = "Token".
 * Keep structural fallbacks too: older token rows are dual-faced
 * "<token> // Buff" printings, and token riftbound IDs may carry a segment like
 * "sfd-t03".
 */
export function isTokenCard(raw: RawCard): boolean {
  if (raw.classification?.supertype?.toLowerCase() === "token") return true;
  if (raw.classification?.type?.toLowerCase() === "token") return true;
  if (raw.name?.includes("//")) return true;
  if (/(^|-)t\d+($|-)/i.test(raw.riftbound_id ?? "")) return true;
  return false;
}

interface PrintedVariantSignals {
  alternateArt: boolean;
  overnumbered: boolean;
  signature: boolean;
}

/**
 * RiftCodex occasionally omits variant metadata on the older duplicate record.
 * The printed id is more reliable: `042a` is alternate art, `305*` is a
 * signature, and a collector above the printed set size is overnumbered.
 */
export function printedVariantSignals(riftboundId: string): PrintedVariantSignals {
  const match = riftboundId.match(/^[^-]+-(\d+)([a*]?)-(\d+)$/i);
  if (!match) {
    return { alternateArt: false, overnumbered: false, signature: false };
  }

  const collector = Number(match[1]);
  const marker = match[2].toLowerCase();
  const setSize = Number(match[3]);
  return {
    alternateArt: marker === "a",
    signature: marker === "*",
    overnumbered:
      Number.isFinite(collector) &&
      Number.isFinite(setSize) &&
      collector > setSize,
  };
}

export function rawToCard(raw: RawCard): Card {
  const setCode = raw.set?.set_id?.toUpperCase();
  const variantSignals = printedVariantSignals(raw.riftbound_id ?? "");
  const cardType = raw.classification?.type;
  // A Legend is a complete card type, not a Champion-supertype unit. A small
  // number of RiftCodex rows (notably OGN Yasuo - Unforgiven) contain both.
  const supertype =
    cardType?.toLowerCase() === "legend"
      ? undefined
      : raw.classification?.supertype || undefined;
  const sourceImageUrl =
    raw.media?.image_url_large ||
    raw.media?.image_url ||
    raw.media?.image_url_png ||
    raw.media?.image_url_small ||
    undefined;
  return {
    object: "card",
    id: raw.id,
    name: raw.name,
    name_normalized: normalizeCardName(raw.metadata?.clean_name || raw.name),
    collector_number: String(raw.collector_number),
    released_at: normalizeDate(raw.released_at),
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
          set_uri: raw.set?.set_uri,
          set_search_uri: raw.set?.set_search_uri,
        }
      : undefined,
    rulings:
      raw.rulings?.rulings_id || raw.rulings?.rulings_uri
        ? {
            rulings_id: raw.rulings?.rulings_id,
            rulings_uri: raw.rulings?.rulings_uri,
          }
        : undefined,
    attributes: {
      energy: raw.attributes?.energy ?? null,
      might: raw.attributes?.might ?? null,
      power: raw.attributes?.power ?? null,
    },
    classification: {
      type: cardType,
      supertype,
      rarity: raw.classification?.rarity,
      tags: raw.tags?.length ? raw.tags : undefined,
      domains: raw.classification?.domain?.length ? raw.classification.domain : undefined,
    },
    text: {
      rich: raw.text?.rich || undefined,
      plain: raw.text?.plain || undefined,
      flavour: raw.text?.flavour
        ? repairFlavourText(raw.text.flavour)
        : undefined,
    },
    artist: raw.media?.artist || undefined,
    metadata: {
      finishes: raw.metadata?.finishes,
      alternate_art:
        (raw.metadata?.alternate_art ?? false) || variantSignals.alternateArt,
      overnumbered:
        (raw.metadata?.overnumbered ?? false) || variantSignals.overnumbered,
      signature: (raw.metadata?.signature ?? false) || variantSignals.signature,
    },
    media: {
      orientation: raw.orientation || undefined,
      accessibility_text: raw.media?.accessibility_text || undefined,
      source_url: sourceImageUrl,
      source_provider: sourceImageUrl ? "riftcodex" : undefined,
      media_urls: raw.media?.image_url
        ? {
            small: raw.media.image_url_small,
            normal: raw.media.image_url,
            large: raw.media.image_url_large,
            png: raw.media.image_url_png,
          }
        : undefined,
    },
    is_token: isTokenCard(raw),
    source: "riftcodex",
    all_parts: [],
    used_by: [],
    related_champions: [],
    related_legends: [],
    related_signatures: [],
    related_printings: [],
  };
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

function makeHeaders(apiKey?: string): Record<string, string> {
  return {
    "User-Agent": "riftseer-ingest/0.1",
    Accept: "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

export async function fetchAllSets(config: RiftCodexConfig): Promise<RawSetInfo[]> {
  const { baseUrl, apiKey, timeoutMs } = config;
  const url = `${baseUrl.replace(/\/$/, "")}/sets`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: makeHeaders(apiKey) });
    if (!res.ok) throw new Error(`fetchAllSets: ${res.status} ${res.statusText}`);
    const contentType = res.headers.get("content-type") ?? "unknown";
    const raw = (await res.json()) as unknown;
    let sets: RawSetInfo[];
    if (Array.isArray(raw)) {
      sets = raw as RawSetInfo[];
    } else if (
      raw &&
      typeof raw === "object" &&
      "items" in raw &&
      Array.isArray((raw as { items?: unknown }).items)
    ) {
      sets = (raw as { items: RawSetInfo[] }).items;
    } else {
      const snippet = JSON.stringify(raw);
      throw new Error(
        `fetchAllSets: unexpected payload shape (content-type: ${contentType}) body=${snippet?.slice(0, 500) ?? "<unserializable>"}`,
      );
    }
    logger.info("Fetched sets from RiftCodex", { count: sets.length });
    return sets;
  } finally {
    clearTimeout(t);
  }
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
      res = await fetch(url, { signal: ctrl.signal, headers: makeHeaders(apiKey) });
    } catch (err) {
      clearTimeout(t);
      throw new Error(`Network error fetching ${url}: ${err}`);
    }
    clearTimeout(t);

    if (res.status === 429) {
      retry429Count++;
      if (retry429Count > MAX_429_RETRIES) {
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
