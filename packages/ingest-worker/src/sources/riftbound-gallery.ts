/**
 * Riot's official Riftbound card gallery — the data behind
 * https://playriftbound.com/en-us/card-gallery/, served by the publishing CMS:
 *
 *   GET /publishing-content/v2.0/public/channel/riftbound_website/list/
 *       riftbound_gallery_cards?locale=en_US&from=N&limit=200
 *
 * It is used for exactly two things, both of which RiftCodex cannot supply:
 *
 *   1. **Equipment effects.** A Gear card with `[Equip]` grants the unit it is
 *      attached to a Might bonus and, usually, an effect. RiftCodex's `text`
 *      stops after the `[Equip]` cost reminder and omits that whole section;
 *      the gallery ships it as `mightBonus` + `effect`, already written in the
 *      same `:rb_*:` / `[Keyword]` vocabulary our renderers speak.
 *   2. **Catalogue gaps.** Cards the gallery lists that we hold no printing
 *      for, which are filed for admin review rather than created — RiftCodex
 *      remains authoritative for what exists.
 *
 * It is deliberately *not* a card source. The gallery only covers the numbered
 * sets (OGN, OGS, SFD, UNL, VEN); every promo group is absent from it, so it
 * can never be treated as the complete catalogue.
 */

import { logger } from "../utils.ts";

const PAGE_SIZE = 200;
/** Guards against a pagination bug turning into an unbounded fetch loop. */
const MAX_PAGES = 20;

export interface RiftboundGalleryConfig {
  baseUrl: string;
  timeoutMs: number;
}

interface GalleryRichText {
  richText?: { type?: string; body?: string } | null;
}

interface GalleryLabelledValue<T> {
  label?: string;
  value?: { id?: T; label?: string } | null;
}

export interface RawGalleryCard {
  /** The printed Riftbound id — the join key with RiftCodex. */
  id: string;
  name: string;
  collectorNumber?: number;
  /** Printed code, e.g. "SFD-161/221", "VEN-SP3/006", "SFD-T03". */
  publicCode?: string;
  set?: { value?: { id?: string; label?: string } | null } | null;
  cardType?: { type?: Array<{ id?: string; label?: string }> } | null;
  rarity?: GalleryLabelledValue<string> | null;
  /** Present only on equipment; `value.id` is the numeric bonus. */
  mightBonus?: GalleryLabelledValue<number> | null;
  /** The equipment's granted effect. Absent when the bonus is the whole effect. */
  effect?: GalleryRichText | null;
  text?: GalleryRichText | null;
  /** Stats are *omitted* rather than nulled when the card has none. */
  energy?: GalleryLabelledValue<number> | null;
  might?: GalleryLabelledValue<number> | null;
  power?: GalleryLabelledValue<number> | null;
  cardImage?: { url?: string } | null;
  [k: string]: unknown;
}

interface GalleryResponse {
  data?: RawGalleryCard[];
  metadata?: { totalItems?: number; totalPages?: number };
}

/**
 * The gallery spells signature printings `ogn-305-star-298` where RiftCodex
 * writes `ogn-305*-298`. Without this the 36 signature cards read as 36
 * catalogue gaps *and* 36 unknown ids on every run.
 */
export function normalizeGalleryId(id: string): string {
  return id.trim().toLowerCase().replace(/-(\d+)-star-/, "-$1*-");
}

/**
 * The gallery's collector number as printed, matching what `rawToCard` stores.
 *
 * `collectorNumber` is a bare integer here exactly as it is on RiftCodex, so
 * comparing against it would report a disagreement on every prefixed track
 * (`T03`, `SP3`, `R01`). `publicCode` keeps the prefix — `VEN-SP3/006`,
 * `SFD-T03` — so it is read for that and only that: an unprefixed code is
 * zero-padded (`OGN-042a/298`) where the stored number is not.
 */
export function galleryPrintedCollectorNumber(
  raw: RawGalleryCard,
): string | null {
  const printed = raw.publicCode?.split("-")[1]?.split("/")[0];
  const prefix = printed?.match(/^([a-z]+)(\d+)$/i);
  if (prefix) return `${prefix[1]!.toUpperCase()}${prefix[2]}`;
  return raw.collectorNumber === undefined ? null : String(raw.collectorNumber);
}

/** The equipment facts a Gear printing carries, as ingested. */
export interface GalleryEquipment {
  /** Might granted to the equipped unit. `0` is a real, printed value. */
  mightBonus: number;
  /** Granted effect text, or undefined when the bonus is the whole effect. */
  effect?: string;
}

/**
 * `<p>…</p>` fragments with no formatting beyond the odd `<br />`. Anything
 * richer would be a change upstream we should see rather than silently strip.
 */
function richTextToPlain(rich: string): string {
  return rich
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

/**
 * Equipment facts for one gallery card, or null when it is not equipment.
 *
 * `mightBonus` is the discriminator, not `effect` or the "Equipment" tag: every
 * one of the 40 equipment cards carries it and nothing else does. One spell
 * (`ven-103-166` Shadows of the Past) carries a stray `effect: "1"` that is not
 * an equipment effect at all, and keying off `effect` would publish it.
 */
export function galleryEquipment(raw: RawGalleryCard): GalleryEquipment | null {
  const bonus = raw.mightBonus?.value?.id;
  if (typeof bonus !== "number" || !Number.isFinite(bonus)) return null;

  const body = raw.effect?.richText?.body;
  const effect = body ? richTextToPlain(body) : "";
  return { mightBonus: bonus, ...(effect ? { effect } : {}) };
}

/**
 * Rules text for admin create autofill. Strips the gallery's trivial HTML while
 * keeping `:rb_*:` / `[Keyword]` tokens the card renderer already understands.
 */
export function galleryRulesText(raw: RawGalleryCard): string | null {
  const body = raw.text?.richText?.body;
  if (!body) return null;
  const plain = richTextToPlain(body);
  return plain || null;
}

/**
 * Fetch every gallery card. Throws on transport or shape failure — the caller
 * treats the whole gallery step as non-fatal, exactly like TCGPlayer.
 */
export async function fetchGalleryCards(
  config: RiftboundGalleryConfig,
): Promise<RawGalleryCard[]> {
  const base = config.baseUrl.replace(/\/$/, "");
  const all: RawGalleryCard[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const url =
      `${base}/publishing-content/v2.0/public/channel/riftbound_website` +
      `/list/riftbound_gallery_cards?locale=en_US&from=${from}&limit=${PAGE_SIZE}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    let body: GalleryResponse;
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "RiftseerIngest/1.0 (+https://riftseer.com)",
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        throw new Error(
          `gallery returned ${res.status} ${res.statusText} for from=${from}`,
        );
      }
      body = (await res.json()) as GalleryResponse;
    } finally {
      clearTimeout(timeout);
    }

    const items = Array.isArray(body.data) ? body.data : [];
    all.push(...items.filter((item) => typeof item?.id === "string"));

    const totalPages = body.metadata?.totalPages ?? 1;
    if (items.length === 0 || page + 1 >= totalPages) break;
  }

  logger.info("Fetched official gallery cards", { count: all.length });
  return all;
}
