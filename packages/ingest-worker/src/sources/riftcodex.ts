/**
 * RiftCodex API fetch + Raw → IngestPrinting mapping for the ingest worker.
 * Upstream: https://api.riftcodex.com
 *   GET /sets        → RawSetInfo[]
 *   GET /cards?page=N&size=100 → paginated RawCard[]
 *
 * Every RiftCodex row is a *printing*. The oracle-level fields it carries are
 * recorded as this printing's observation of them; grouping happens later.
 */

import { normalizeCardName, logger } from "../utils.ts";
import type { IngestPrinting } from "../pipeline/types.ts";
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

/**
 * The collector segment of a `riftbound_id`, split into its printed parts.
 *
 * Ids are `<set>-<collector>` or `<set>-<collector>-<setSize>`, and the
 * collector may carry a leading letter group naming a numbering track:
 *
 *   ogn-271-298  → { prefix: "",   digits: "271", marker: ""  }
 *   ogn-042a-298 → { prefix: "",   digits: "042", marker: "a" }
 *   ogn-305*-298 → { prefix: "",   digits: "305", marker: "*" }
 *   sfd-t03      → { prefix: "t",  digits: "03",  marker: ""  }  (token)
 *   ven-r01      → { prefix: "r",  digits: "01",  marker: ""  }  (rune)
 *   ven-sp3-006  → { prefix: "sp", digits: "3",   marker: ""  }  (special collection)
 */
interface PrintedIdParts {
  prefix: string;
  digits: string;
  marker: string;
  setSize: number | null;
}

function parsePrintedId(riftboundId: string): PrintedIdParts | null {
  const segments = riftboundId.split("-");
  const collector = segments[1];
  if (!collector) return null;

  const match = collector.match(/^([a-z]*)(\d+)([a*]?)$/i);
  if (!match) return null;

  const setSize = segments.length > 2 ? Number(segments[2]) : Number.NaN;
  return {
    prefix: match[1]!.toLowerCase(),
    digits: match[2]!,
    marker: match[3]!.toLowerCase(),
    setSize: Number.isFinite(setSize) ? setSize : null,
  };
}

/**
 * The collector number as printed on the card.
 *
 * RiftCodex types `collector_number` as an integer, which silently drops the
 * letter prefix that several numbering tracks use — the Gold token prints
 * `T03`, Ahri, Inquisitive prints `SP3/006` and the basic runes print `R01`,
 * yet all three arrive as a bare `3`/`1`. The `riftbound_id` keeps the prefix,
 * and the digits there are printed verbatim (`T03` is padded, `SP3` is not),
 * so it is the more faithful source whenever a prefix is present.
 *
 * Numbers without a prefix are left to RiftCodex: the id zero-pads them
 * (`ogn-042a-298`) where the card and every existing slug do not.
 */
export function printedCollectorNumber(
  riftboundId: string | null | undefined,
  collectorNumber: number | string | null | undefined,
): string {
  const parts = riftboundId ? parsePrintedId(riftboundId) : null;
  if (parts?.prefix) return `${parts.prefix.toUpperCase()}${parts.digits}`;
  return String(collectorNumber ?? "");
}

interface PrintedVariantSignals {
  alternateArt: boolean;
  overnumbered: boolean;
  signature: boolean;
  specialCollection: boolean;
}

/**
 * RiftCodex occasionally omits variant metadata on the older duplicate record.
 * The printed id is more reliable: `042a` is alternate art, `305*` is a
 * signature, `sp3` belongs to a special collection, and a collector above the
 * printed set size is overnumbered.
 */
export function printedVariantSignals(riftboundId: string): PrintedVariantSignals {
  const parts = parsePrintedId(riftboundId);
  if (!parts) {
    return {
      alternateArt: false,
      overnumbered: false,
      signature: false,
      specialCollection: false,
    };
  }

  const collector = Number(parts.digits);
  return {
    alternateArt: parts.marker === "a",
    signature: parts.marker === "*",
    specialCollection: parts.prefix === "sp",
    // Only meaningful on the main numbering track — a special-collection or
    // token number is counted against its own much smaller run.
    overnumbered:
      parts.prefix === "" &&
      parts.setSize !== null &&
      Number.isFinite(collector) &&
      collector > parts.setSize,
  };
}

export function rawToPrinting(raw: RawCard): IngestPrinting {
  const variantSignals = printedVariantSignals(raw.riftbound_id ?? "");
  const cardType = raw.classification?.type;
  // A Legend is a complete card type, not a Champion-supertype unit. A small
  // number of RiftCodex rows (notably OGN Yasuo - Unforgiven) contain both.
  const supertype =
    cardType?.toLowerCase() === "legend"
      ? undefined
      : raw.classification?.supertype || undefined;
  // Largest first: the hosted variants are transcoded down from whatever we
  // fetch, so a bigger source is never worse.
  const sourceImageUrl =
    raw.media?.image_url_large ||
    raw.media?.image_url ||
    raw.media?.image_url_png ||
    raw.media?.image_url_small ||
    undefined;

  return {
    id: raw.id,

    name: raw.name,
    name_normalized: normalizeCardName(raw.metadata?.clean_name || raw.name),
    card_type: cardType || undefined,
    supertype,
    is_token: isTokenCard(raw),
    energy: raw.attributes?.energy ?? null,
    might: raw.attributes?.might ?? null,
    power: raw.attributes?.power ?? null,
    text_rich: raw.text?.rich || undefined,
    text_plain: raw.text?.plain || undefined,
    tags: raw.tags?.length ? raw.tags : [],
    domains: raw.classification?.domain?.length ? raw.classification.domain : [],

    set_code: raw.set?.set_id?.toUpperCase(),
    artist: raw.media?.artist || undefined,
    collector_number:
      printedCollectorNumber(raw.riftbound_id, raw.collector_number) ||
      undefined,
    released_at: normalizeDate(raw.released_at),
    rarity: raw.classification?.rarity || undefined,
    flavour_text: raw.text?.flavour
      ? repairFlavourText(raw.text.flavour)
      : undefined,
    finishes: raw.metadata?.finishes ?? [],
    is_signature:
      (raw.metadata?.signature ?? false) || variantSignals.signature,
    is_alternate_art:
      (raw.metadata?.alternate_art ?? false) || variantSignals.alternateArt,
    is_overnumbered:
      (raw.metadata?.overnumbered ?? false) || variantSignals.overnumbered,
    is_special_collection: variantSignals.specialCollection,

    riftcodex_id: raw.id,
    riftbound_id: raw.riftbound_id || undefined,
    tcgplayer_id: raw.tcgplayer_id || undefined,

    image_source_url: sourceImageUrl,
    image_source_provider: sourceImageUrl ? "riftcodex" : undefined,
    image_orientation: raw.orientation || undefined,
    image_alt_text: raw.media?.accessibility_text || undefined,
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
