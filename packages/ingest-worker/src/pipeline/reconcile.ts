/**
 * The ingest review / reconciliation queue.
 *
 * RiftCodex is authoritative, so nothing another source says is applied
 * automatically — but two sources watch us, and what they see is worth a human
 * look. This module records those findings; an admin confirms an entry (which
 * writes the value and locks the column) or dismisses it (which is remembered
 * across ingests). Nothing here mutates a printing.
 *
 *   • **TCGPlayer** — a product that matches no printing, and fields where a
 *     linked product disagrees with us.
 *   • **Riot's official gallery** — printings it lists that we do not hold, and
 *     fields where it disagrees with us. It covers the numbered sets only, so it
 *     can never testify about a promo printing.
 *
 * Prices are never queued: they legitimately change every run and are applied
 * automatically anyway.
 *
 * Detection runs on the printings this run is about to write, *after* the
 * admin-confirmed TCGPlayer links have been seeded back onto them. That is what
 * makes a confirmation stick — comparing against un-seeded printings would
 * re-file the same "unmatched product" on every run.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { oracleKeyForName } from "@riftseer/types/oracle";
import { logger } from "../utils.ts";
import { callRpcWithRetry } from "./retry.ts";
import {
  collectorCandidates,
  normalizeCollectorNumber,
  type EnrichedProduct,
  type ProductMaps,
} from "./enrich.ts";
import type { GalleryIndex } from "./gallery.ts";
import type { IngestPrinting } from "./types.ts";
import { printedVariantSignals } from "../sources/riftcodex.ts";
import {
  galleryEquipment,
  galleryPrintedCollectorNumber,
  galleryRulesText,
  normalizeGalleryId,
  type RawGalleryCard,
} from "../sources/riftbound-gallery.ts";

/** Keep each RPC comfortably below Supabase's request limits. */
export const RECONCILIATION_BATCH_SIZE = 250;

export type ReconciliationKind =
  | "unmatched_product"
  | "field_diff"
  /** The gallery lists a printing of a card we hold, and we have no such printing. */
  | "missing_printing"
  /** The gallery lists a printing whose name matches no oracle we hold at all. */
  | "unmatched_oracle";

/** Which upstream raised the entry. Decides how `payload` is read. */
export type ReconciliationSource = "tcgplayer" | "gallery";

/**
 * Fields worth flagging. Each is an objective fact the observing source can be
 * right about, so confirming one is a sensible action.
 *
 * `name` is deliberately absent from both sources. TCGPlayer names are
 * stylistic ("Sett, Brawler (Alternate Art)") and the gallery's are too — it
 * writes "Poppy, Paragon" where RiftCodex writes "Poppy - Paragon (Alternate
 * Art)", which disagrees on 390 of the 1,301 printings the two share and on
 * none of them meaningfully.
 */
export type ReconciliationField =
  | "collector_number"
  | "released_at"
  | "rarity"
  | "type"
  | "energy"
  | "might"
  | "power"
  | "text";

export interface ReconciliationProduct {
  product_id: number;
  name: string;
  url: string;
  image_url: string | null;
  collector_number: string | null;
  group_id: number;
  set_code: string | null;
}

/** A gallery printing, as filed for review. */
export interface ReconciliationGalleryCard {
  riftbound_id: string;
  name: string;
  public_code: string | null;
  set_code: string | null;
  set_name: string | null;
  collector_number: string | null;
  rarity: string | null;
  type: string | null;
  image_url: string | null;
  /** Stats and text the admin create form can autofill from. */
  energy: number | null;
  might: number | null;
  power: number | null;
  text: string | null;
  might_bonus: number | null;
  equipment: string | null;
  signature: boolean;
  special_collection: boolean;
  alternate_art: boolean;
  is_token: boolean;
}

export interface ReconciliationEntry {
  /**
   * Identity of the *discrepancy*, recomputed every run. It carries the observed
   * upstream value, so a dismissed entry stays dismissed while a genuinely new
   * disagreement gets a new fingerprint and re-surfaces.
   */
  fingerprint: string;
  kind: ReconciliationKind;
  source: ReconciliationSource;
  payload: {
    /** Present on every TCGPlayer entry. */
    product?: ReconciliationProduct;
    /** Present on every gallery entry. */
    gallery?: ReconciliationGalleryCard;
    field?: ReconciliationField;
    current_value?: string | null;
    proposed_value?: string | null;
    printing_id?: string;
    printing_name?: string;
    /** The matching key of the oracle a missing printing belongs to. */
    oracle_key?: string;
  };
  proposed_printing_id: string | null;
  /** Resolved after the catalogue upsert — a uuid only exists once written. */
  proposed_oracle_id?: string | null;
}

/**
 * Sealed products share the card catalogue and would otherwise fill the queue
 * with boxes and playmats on every run. The patterns are anchored to phrases
 * that do not appear in Riftbound card names; anything this misses is still a
 * one-click dismissal, which is the general escape hatch.
 */
const SEALED_NAME_PATTERN =
  /\b(booster|blister|bundle|case|display|starter\s+deck|deck\s+box|playmat|play\s+mat|sleeve|sleeves|binder|tin|kit|pack)\b/i;

function isSealedProduct(product: EnrichedProduct): boolean {
  return SEALED_NAME_PATTERN.test(product.name);
}

/** Dates arrive as full timestamps from TCGPlayer and as dates from us. */
function toDatePart(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

/**
 * Printings already linked to a product, by TCGPlayer product id.
 * `enrichPrintings` writes `tcgplayer_id` whenever it matches, so this covers
 * automatic matches and admin-confirmed ones alike.
 */
function claimedProductIds(printings: IngestPrinting[]): Set<number> {
  const claimed = new Set<number>();
  for (const printing of printings) {
    if (!printing.tcgplayer_id) continue;
    const productId = parseInt(printing.tcgplayer_id, 10);
    if (Number.isFinite(productId)) claimed.add(productId);
  }
  return claimed;
}

/**
 * `set_code|collector_number` → the single printing holding it, or null when
 * more than one does. An ambiguous key (alternate art sharing a number) yields
 * no suggestion rather than a wrong one.
 */
function buildCollectorIndex(
  printings: IngestPrinting[],
): Map<string, IngestPrinting | null> {
  const index = new Map<string, IngestPrinting | null>();
  for (const printing of printings) {
    const setCode = printing.set_code;
    const collector = normalizeCollectorNumber(printing.collector_number);
    if (!setCode || !collector) continue;
    const key = `${setCode}|${collector}`;
    index.set(key, index.has(key) ? null : printing);
  }
  return index;
}

function productPayload(
  product: EnrichedProduct,
  setCode: string | null,
): ReconciliationProduct {
  return {
    product_id: product.productId,
    name: product.name,
    url: product.url,
    image_url: product.imageUrl,
    collector_number: product.collectorNumber,
    group_id: product.groupId,
    set_code: setCode,
  };
}

function unmatchedEntry(
  product: EnrichedProduct,
  setCode: string | null,
  proposed: IngestPrinting | null,
): ReconciliationEntry {
  return {
    fingerprint: `product:${product.productId}`,
    kind: "unmatched_product",
    source: "tcgplayer",
    payload: {
      product: productPayload(product, setCode),
      ...(proposed
        ? { printing_id: proposed.id, printing_name: proposed.name }
        : {}),
    },
    proposed_printing_id: proposed?.id ?? null,
  };
}

function diffEntry(
  printing: IngestPrinting,
  product: EnrichedProduct,
  setCode: string | null,
  field: ReconciliationField,
  currentValue: string | null,
  proposedValue: string,
): ReconciliationEntry {
  return {
    // The proposed value is part of the identity: dismissing "TCGPlayer says
    // 2025-06-01" must not also dismiss a later, different claim.
    fingerprint: `diff:${field}:${printing.id}:${proposedValue}`,
    kind: "field_diff",
    source: "tcgplayer",
    payload: {
      product: productPayload(product, setCode),
      field,
      current_value: currentValue,
      proposed_value: proposedValue,
      printing_id: printing.id,
      printing_name: printing.name,
    },
    proposed_printing_id: printing.id,
  };
}

/**
 * Everything TCGPlayer let us observe, ready for `syncReconciliationQueue`.
 *
 * Pass the printings this run is about to write and the product map built
 * during enrichment.
 */
export function buildReconciliationEntries(
  printings: IngestPrinting[],
  maps: ProductMaps,
  setGroupMap: Map<string, number>,
): ReconciliationEntry[] {
  const setCodeByGroup = new Map<number, string>();
  for (const [setCode, groupId] of setGroupMap) {
    setCodeByGroup.set(groupId, setCode);
  }

  const claimed = claimedProductIds(printings);
  const collectorIndex = buildCollectorIndex(printings);
  const entries: ReconciliationEntry[] = [];

  // ── Products no card claims ────────────────────────────────────────────────
  let sealedSkipped = 0;
  for (const product of maps.byId.values()) {
    if (claimed.has(product.productId)) continue;
    if (isSealedProduct(product)) {
      sealedSkipped++;
      continue;
    }

    const setCode = setCodeByGroup.get(product.groupId) ?? null;
    const proposed =
      setCode && product.collectorNumber
        ? (collectorIndex.get(`${setCode}|${product.collectorNumber}`) ?? null)
        : null;
    entries.push(unmatchedEntry(product, setCode, proposed));
  }

  // ── Fields where a linked product disagrees with us ────────────────────────
  for (const printing of printings) {
    if (!printing.tcgplayer_id) continue;
    const productId = parseInt(printing.tcgplayer_id, 10);
    if (!Number.isFinite(productId)) continue;
    const product = maps.byId.get(productId);
    if (!product) continue;

    const setCode = setCodeByGroup.get(product.groupId) ?? null;

    // A variant suffix (`12a`, `12*`) is how TCGPlayer spells our number, not a
    // disagreement — compare against every candidate the matcher accepts.
    if (product.collectorNumber) {
      const candidates = collectorCandidates(printing);
      if (
        candidates.length > 0 &&
        !candidates.includes(product.collectorNumber)
      ) {
        entries.push(
          diffEntry(
            printing,
            product,
            setCode,
            "collector_number",
            printing.collector_number ?? null,
            product.collectorNumber,
          ),
        );
      }
    }

    // Rarity is a printing-level field, and the sources genuinely disagree:
    // TCGPlayer treats Showcase as a rarity while RiftCodex reports the base
    // card's on an alternate-art or showcase printing. Compared
    // case-insensitively — both sides title-case it, and casing alone is not a
    // disagreement.
    const printingRarity = comparableValue(printing.rarity);
    if (
      product.rarity &&
      printingRarity?.toLowerCase() !== product.rarity.toLowerCase()
    ) {
      entries.push(
        diffEntry(
          printing,
          product,
          setCode,
          "rarity",
          printingRarity,
          product.rarity,
        ),
      );
    }

    const productReleased = toDatePart(product.releasedOn);
    const printingReleased = toDatePart(printing.released_at);
    if (
      productReleased &&
      printingReleased &&
      productReleased !== printingReleased
    ) {
      entries.push(
        diffEntry(
          printing,
          product,
          setCode,
          "released_at",
          printingReleased,
          productReleased,
        ),
      );
    }
  }

  logger.info("Built reconciliation entries", {
    total: entries.length,
    unmatchedProducts: entries.filter((e) => e.kind === "unmatched_product")
      .length,
    fieldDiffs: entries.filter((e) => e.kind === "field_diff").length,
    sealedSkipped,
  });
  return entries;
}

// ── Official gallery ──────────────────────────────────────────────────────────

/**
 * Both sides ship the same small HTML subset; comparing the rendered text
 * ignores tag-level formatting differences that mean nothing to a reader.
 * Verified against the live corpus: with this normalisation the two sources
 * agree on all 1,301 shared printings, so any diff filed here is real drift.
 */
function comparableText(value: string | null | undefined): string | null {
  if (!value) return null;
  const plain = value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain || null;
}

function comparableValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function labelledNumber(
  value: { value?: { id?: number } | null } | null | undefined,
): number | null {
  const id = value?.value?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

function galleryCardPayload(
  raw: RawGalleryCard,
  riftboundId: string,
): ReconciliationGalleryCard {
  const collector = galleryPrintedCollectorNumber(raw);
  const variants = printedVariantSignals(riftboundId);
  const equipment = galleryEquipment(raw);
  return {
    riftbound_id: riftboundId,
    name: raw.name,
    public_code: raw.publicCode ?? null,
    set_code: raw.set?.value?.id ?? null,
    set_name: raw.set?.value?.label ?? null,
    collector_number: collector,
    rarity: raw.rarity?.value?.label ?? null,
    type: raw.cardType?.type?.[0]?.label ?? null,
    image_url:
      (raw.cardImage as { url?: string } | undefined)?.url ?? null,
    energy: labelledNumber(raw.energy),
    might: labelledNumber(raw.might),
    power: labelledNumber(raw.power),
    text: galleryRulesText(raw),
    might_bonus: equipment?.mightBonus ?? null,
    equipment: equipment?.effect ?? null,
    signature: variants.signature,
    special_collection: variants.specialCollection,
    alternate_art: variants.alternateArt,
    // Token track uses a `T` collector prefix (`UNL-T01`); RiftCodex's
    // classification.supertype is absent from the gallery.
    is_token: /^T\d/i.test(collector ?? ""),
  };
}

/**
 * Every field the gallery and RiftCodex both state, paired for comparison. A
 * field the gallery omits is not a disagreement — it omits `might` on the 599
 * printings that have none rather than sending null.
 */
function galleryFieldPairs(
  printing: IngestPrinting,
  raw: RawGalleryCard,
): Array<[ReconciliationField, string | null, string | null]> {
  return [
    [
      "collector_number",
      comparableValue(printing.collector_number),
      comparableValue(galleryPrintedCollectorNumber(raw)),
    ],
    [
      "rarity",
      comparableValue(printing.rarity),
      comparableValue(raw.rarity?.value?.label),
    ],
    [
      "type",
      comparableValue(printing.card_type),
      comparableValue(raw.cardType?.type?.[0]?.label),
    ],
    [
      "energy",
      comparableValue(printing.energy),
      comparableValue(raw.energy?.value?.id),
    ],
    [
      "might",
      comparableValue(printing.might),
      comparableValue(raw.might?.value?.id),
    ],
    [
      "power",
      comparableValue(printing.power),
      comparableValue(raw.power?.value?.id),
    ],
    [
      "text",
      comparableText(printing.text_rich),
      comparableText(raw.text?.richText?.body),
    ],
  ];
}

/**
 * What Riot's official gallery says we got wrong or are missing.
 *
 * Three kinds of finding, none of which changes anything by itself:
 *
 *   • `missing_printing` — the gallery lists a printing of a card we do hold.
 *     An admin adds the printing to that oracle, or dismisses.
 *   • `unmatched_oracle` — the gallery lists a printing whose name matches no
 *     oracle at all. That is a whole card we do not have, and it is filed rather
 *     than created: two names differing only by punctuation used to split a card
 *     in half, and two unrelated names could merge one.
 *   • `field_diff` — a printing we both hold, where a value disagrees.
 *
 * The gallery covers the numbered sets only. Every promo printing is absent
 * from it, so a printing it does not list is *not* evidence of anything — only
 * the ids it does list are checked in reverse.
 */
export function buildGalleryReconciliationEntries(
  printings: IngestPrinting[],
  index: GalleryIndex,
): ReconciliationEntry[] {
  const byRiftboundId = new Map<string, IngestPrinting>();
  const oracleKeys = new Set<string>();
  for (const printing of printings) {
    if (printing.riftbound_id) {
      byRiftboundId.set(normalizeGalleryId(printing.riftbound_id), printing);
    }
    oracleKeys.add(oracleKeyForName(printing.name));
  }

  const entries: ReconciliationEntry[] = [];

  for (const [riftboundId, raw] of index.byRiftboundId) {
    const printing = byRiftboundId.get(riftboundId);

    if (!printing) {
      const oracleKey = oracleKeyForName(raw.name);
      const known = oracleKeys.has(oracleKey);
      entries.push({
        fingerprint: `gallery-missing:${riftboundId}`,
        kind: known ? "missing_printing" : "unmatched_oracle",
        source: "gallery",
        payload: {
          gallery: galleryCardPayload(raw, riftboundId),
          oracle_key: oracleKey,
        },
        proposed_printing_id: null,
        // Filled in after the catalogue upsert: the oracle's uuid does not
        // exist until the run that creates it has committed.
        proposed_oracle_id: null,
      });
      continue;
    }

    for (const [field, ours, theirs] of galleryFieldPairs(printing, raw)) {
      if (theirs === null || ours === theirs) continue;
      entries.push({
        // The observed value is part of the identity, so a dismissal sticks
        // while a genuinely new claim re-surfaces — as for TCGPlayer diffs.
        fingerprint: `gallery-diff:${field}:${printing.id}:${theirs}`,
        kind: "field_diff",
        source: "gallery",
        payload: {
          gallery: galleryCardPayload(raw, riftboundId),
          field,
          current_value: ours,
          proposed_value: theirs,
          printing_id: printing.id,
          printing_name: printing.name,
        },
        proposed_printing_id: printing.id,
      });
    }
  }

  logger.info("Built gallery reconciliation entries", {
    total: entries.length,
    missingPrintings: entries.filter((e) => e.kind === "missing_printing").length,
    unmatchedOracles: entries.filter((e) => e.kind === "unmatched_oracle").length,
    fieldDiffs: entries.filter((e) => e.kind === "field_diff").length,
  });
  return entries;
}

/**
 * Attach the surrogate oracle id to every entry that named an oracle key.
 *
 * Runs after the catalogue upsert for the obvious reason: an oracle created by
 * this run has no id before it. Missing ids are left null — the entry is still
 * useful without one.
 */
export function attachProposedOracleIds(
  entries: ReconciliationEntry[],
  oracleIdsByKey: Map<string, string>,
): void {
  for (const entry of entries) {
    const key = entry.payload.oracle_key;
    if (!key) continue;
    entry.proposed_oracle_id = oracleIdsByKey.get(key) ?? null;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Upsert every observed entry, then prune pending rows this run no longer saw.
 *
 * Same shape as the card ingest RPC: bounded batches upsert with pruning
 * disabled, and one final call carries the complete fingerprint list. Pruning
 * therefore cannot run unless every batch succeeded, and `prune: false` (used
 * when the TCGPlayer fetch failed) leaves the queue untouched rather than
 * reading an empty observation set as "everything matched".
 */
export async function syncReconciliationQueue(
  supabase: SupabaseClient,
  entries: ReconciliationEntry[],
  prune: boolean,
): Promise<{ upserted: number; pruned: number }> {
  let upserted = 0;

  for (const batch of chunk(entries, RECONCILIATION_BATCH_SIZE)) {
    const data = await callRpcWithRetry<{ upserted?: number }>(
      supabase,
      "ingest_reconciliation_queue",
      { p_entries: batch, p_fingerprints: [], p_prune: false },
      "ingest_reconciliation_queue upsert",
    );
    upserted += Number(data?.upserted ?? 0);
  }

  let pruned = 0;
  if (prune) {
    const data = await callRpcWithRetry<{ pruned?: number }>(
      supabase,
      "ingest_reconciliation_queue",
      {
        p_entries: [],
        p_fingerprints: entries.map((entry) => entry.fingerprint),
        p_prune: true,
      },
      "ingest_reconciliation_queue prune",
    );
    pruned = Number(data?.pruned ?? 0);
  }

  logger.info("Reconciliation queue synced", {
    entries: entries.length,
    upserted,
    pruned,
    pruneEnabled: prune,
  });
  return { upserted, pruned };
}
