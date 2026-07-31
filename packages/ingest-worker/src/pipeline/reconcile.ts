/**
 * The ingest review / reconciliation queue.
 *
 * RiftCodex is authoritative, so nothing another source says is applied
 * automatically — but two sources watch us, and what they see is worth a human
 * look. This module records those findings; an admin confirms an entry (which
 * writes a durable card override) or dismisses it (which is remembered across
 * ingests). Nothing here mutates a card.
 *
 *   • **TCGPlayer** — a product that matches no card, and fields where a linked
 *     product disagrees with us.
 *   • **Riot's official gallery** — printings it lists that we hold no card
 *     for, and fields where it disagrees with us. It covers the numbered sets
 *     only, so it can never testify about a promo printing.
 *
 * Prices are never queued: they legitimately change every run and are applied
 * automatically anyway.
 *
 * Detection runs *after* the DB override overlay, so it sees each card's final
 * values. That is what makes a confirmed link stick: confirming writes
 * `external_ids.tcgplayer_id` into `card_overrides`, the overlay applies it, and
 * the product is no longer unmatched on the next run.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card } from "@riftseer/types";
import { logger } from "../utils.ts";
import { callRpcWithRetry } from "./retry.ts";
import {
  collectorCandidates,
  normalizeCollectorNumber,
  type EnrichedProduct,
  type ProductMaps,
} from "./enrich.ts";
import type { GalleryIndex } from "./gallery.ts";
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
  | "missing_card";

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
    card_id?: string;
    card_name?: string;
  };
  proposed_card_id: string | null;
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
 * Cards the admin has already linked to a product, by TCGPlayer product id.
 * `enrichCards` backfills `tcgplayer_id` whenever it matches by name, so this
 * covers automatic matches and confirmed manual ones alike.
 */
function claimedProductIds(cards: Card[]): Set<number> {
  const claimed = new Set<number>();
  for (const card of cards) {
    const raw = card.external_ids?.tcgplayer_id;
    if (!raw) continue;
    const productId = parseInt(raw, 10);
    if (Number.isFinite(productId)) claimed.add(productId);
  }
  return claimed;
}

/**
 * `set_code|collector_number` → the single card holding it, or null when more
 * than one does. An ambiguous key (alternate art sharing a number) yields no
 * suggestion rather than a wrong one.
 */
function buildCollectorIndex(cards: Card[]): Map<string, Card | null> {
  const index = new Map<string, Card | null>();
  for (const card of cards) {
    const setCode = card.set?.set_code;
    const collector = normalizeCollectorNumber(card.collector_number);
    if (!setCode || !collector) continue;
    const key = `${setCode}|${collector}`;
    index.set(key, index.has(key) ? null : card);
  }
  return index;
}

function unmatchedEntry(
  product: EnrichedProduct,
  setCode: string | null,
  proposed: Card | null,
): ReconciliationEntry {
  return {
    fingerprint: `product:${product.productId}`,
    kind: "unmatched_product",
    source: "tcgplayer",
    payload: {
      product: {
        product_id: product.productId,
        name: product.name,
        url: product.url,
        image_url: product.imageUrl,
        collector_number: product.collectorNumber,
        group_id: product.groupId,
        set_code: setCode,
      },
      ...(proposed
        ? { card_id: proposed.id, card_name: proposed.name }
        : {}),
    },
    proposed_card_id: proposed?.id ?? null,
  };
}

function diffEntry(
  card: Card,
  product: EnrichedProduct,
  setCode: string | null,
  field: ReconciliationField,
  currentValue: string | null,
  proposedValue: string,
): ReconciliationEntry {
  return {
    // The proposed value is part of the identity: dismissing "TCGPlayer says
    // 2025-06-01" must not also dismiss a later, different claim.
    fingerprint: `diff:${field}:${card.id}:${proposedValue}`,
    kind: "field_diff",
    source: "tcgplayer",
    payload: {
      product: {
        product_id: product.productId,
        name: product.name,
        url: product.url,
        image_url: product.imageUrl,
        collector_number: product.collectorNumber,
        group_id: product.groupId,
        set_code: setCode,
      },
      field,
      current_value: currentValue,
      proposed_value: proposedValue,
      card_id: card.id,
      card_name: card.name,
    },
    proposed_card_id: card.id,
  };
}

/**
 * Everything this run observed, ready for `syncReconciliationQueue`.
 *
 * Pass the *final* cards (post-override) and the product map built during
 * enrichment.
 */
export function buildReconciliationEntries(
  cards: Card[],
  maps: ProductMaps,
  setGroupMap: Map<string, number>,
): ReconciliationEntry[] {
  const setCodeByGroup = new Map<number, string>();
  for (const [setCode, groupId] of setGroupMap) {
    setCodeByGroup.set(groupId, setCode);
  }

  const claimed = claimedProductIds(cards);
  const collectorIndex = buildCollectorIndex(cards);
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
  for (const card of cards) {
    const raw = card.external_ids?.tcgplayer_id;
    if (!raw) continue;
    const productId = parseInt(raw, 10);
    if (!Number.isFinite(productId)) continue;
    const product = maps.byId.get(productId);
    if (!product) continue;

    const setCode = setCodeByGroup.get(product.groupId) ?? null;

    // A variant suffix (`12a`, `12*`) is how TCGPlayer spells our number, not a
    // disagreement — compare against every candidate the matcher accepts.
    if (product.collectorNumber) {
      const candidates = collectorCandidates(card);
      if (
        candidates.length > 0 &&
        !candidates.includes(product.collectorNumber)
      ) {
        entries.push(
          diffEntry(
            card,
            product,
            setCode,
            "collector_number",
            card.collector_number ?? null,
            product.collectorNumber,
          ),
        );
      }
    }

    // RiftCodex reports the base card's rarity for a Showcase printing and has
    // been observed plainly wrong on a handful of ordinary cards, so what a
    // linked product prints is worth a look. Compared case-insensitively:
    // both sides title-case it, and casing alone is not a disagreement.
    const cardRarity = comparableValue(card.classification?.rarity);
    if (
      product.rarity &&
      cardRarity?.toLowerCase() !== product.rarity.toLowerCase()
    ) {
      entries.push(
        diffEntry(card, product, setCode, "rarity", cardRarity, product.rarity),
      );
    }

    const productReleased = toDatePart(product.releasedOn);
    const cardReleased = toDatePart(card.released_at);
    if (productReleased && cardReleased && productReleased !== cardReleased) {
      entries.push(
        diffEntry(
          card,
          product,
          setCode,
          "released_at",
          cardReleased,
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
  card: Card,
  raw: RawGalleryCard,
): Array<[ReconciliationField, string | null, string | null]> {
  return [
    [
      "collector_number",
      comparableValue(card.collector_number),
      comparableValue(galleryPrintedCollectorNumber(raw)),
    ],
    [
      "rarity",
      comparableValue(card.classification?.rarity),
      comparableValue(raw.rarity?.value?.label),
    ],
    [
      "type",
      comparableValue(card.classification?.type),
      comparableValue(raw.cardType?.type?.[0]?.label),
    ],
    [
      "energy",
      comparableValue(card.attributes?.energy),
      comparableValue(raw.energy?.value?.id),
    ],
    [
      "might",
      comparableValue(card.attributes?.might),
      comparableValue(raw.might?.value?.id),
    ],
    [
      "power",
      comparableValue(card.attributes?.power),
      comparableValue(raw.power?.value?.id),
    ],
    [
      "text",
      comparableText(card.text?.rich),
      comparableText(raw.text?.richText?.body),
    ],
  ];
}

/**
 * What Riot's official gallery says we got wrong or are missing.
 *
 * Two kinds of finding, neither of which changes anything by itself:
 *
 *   • `missing_card` — the gallery lists a printing we hold no card for. Nine
 *     exist today (Unleashed's T01-T08 tokens and Vendetta's Recruit (NX)).
 *     RiftCodex stays authoritative for what exists, so an admin creates the
 *     card by hand and confirms against it, or dismisses.
 *   • `field_diff` — a printing we both hold, where a value disagrees.
 *
 * The gallery covers the numbered sets only. Every promo printing is absent
 * from it, so a card it does not list is *not* evidence of anything — only the
 * ids it does list are checked in reverse.
 */
export function buildGalleryReconciliationEntries(
  cards: Card[],
  index: GalleryIndex,
): ReconciliationEntry[] {
  const cardsByRiftboundId = new Map<string, Card>();
  for (const card of cards) {
    const id = card.external_ids?.riftbound_id;
    if (id) cardsByRiftboundId.set(normalizeGalleryId(id), card);
  }

  const entries: ReconciliationEntry[] = [];

  for (const [riftboundId, raw] of index.byRiftboundId) {
    const card = cardsByRiftboundId.get(riftboundId);

    if (!card) {
      entries.push({
        fingerprint: `gallery-missing:${riftboundId}`,
        kind: "missing_card",
        source: "gallery",
        payload: { gallery: galleryCardPayload(raw, riftboundId) },
        proposed_card_id: null,
      });
      continue;
    }

    for (const [field, ours, theirs] of galleryFieldPairs(card, raw)) {
      if (theirs === null || ours === theirs) continue;
      entries.push({
        // The observed value is part of the identity, so a dismissal sticks
        // while a genuinely new claim re-surfaces — as for TCGPlayer diffs.
        fingerprint: `gallery-diff:${field}:${card.id}:${theirs}`,
        kind: "field_diff",
        source: "gallery",
        payload: {
          gallery: galleryCardPayload(raw, riftboundId),
          field,
          current_value: ours,
          proposed_value: theirs,
          card_id: card.id,
          card_name: card.name,
        },
        proposed_card_id: card.id,
      });
    }
  }

  logger.info("Built gallery reconciliation entries", {
    total: entries.length,
    missingCards: entries.filter((e) => e.kind === "missing_card").length,
    fieldDiffs: entries.filter((e) => e.kind === "field_diff").length,
  });
  return entries;
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
