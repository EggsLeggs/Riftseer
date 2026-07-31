/**
 * TCGPlayer review / reconciliation queue (Phase 6).
 *
 * Enrichment is best-effort by design: a TCGPlayer product that matches no card
 * is skipped silently, and a field where TCGPlayer disagrees with RiftCodex is
 * ignored because RiftCodex is authoritative. Both are still worth a human
 * look, so this module records them instead of acting on them. Nothing here
 * mutates a card — an admin confirms an entry (which writes a durable card
 * override) or dismisses it (which is remembered across ingests).
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
import {
  collectorCandidates,
  normalizeCollectorNumber,
  type EnrichedProduct,
  type ProductMaps,
} from "./enrich.ts";

/** Keep each RPC comfortably below Supabase's request limits. */
export const RECONCILIATION_BATCH_SIZE = 250;

export type ReconciliationKind = "unmatched_product" | "field_diff";

/**
 * Fields worth flagging. Both are objective facts TCGPlayer can be right about,
 * so confirming one is a sensible action.
 *
 * `name` is deliberately absent: TCGPlayer names are stylistic ("Sett, Brawler
 * (Alternate Art)") and RiftCodex is authoritative for them, so every printing
 * would produce a diff no admin would ever want to apply.
 */
export type ReconciliationField = "collector_number" | "released_at";

export interface ReconciliationProduct {
  product_id: number;
  name: string;
  url: string;
  image_url: string | null;
  collector_number: string | null;
  group_id: number;
  set_code: string | null;
}

export interface ReconciliationEntry {
  /**
   * Identity of the *discrepancy*, recomputed every run. It carries the observed
   * upstream value, so a dismissed entry stays dismissed while a genuinely new
   * disagreement gets a new fingerprint and re-surfaces.
   */
  fingerprint: string;
  kind: ReconciliationKind;
  tcgplayer_payload: {
    product: ReconciliationProduct;
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
    tcgplayer_payload: {
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
    tcgplayer_payload: {
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
    const { data, error } = await supabase.rpc("ingest_reconciliation_queue", {
      p_entries: batch,
      p_fingerprints: [],
      p_prune: false,
    });
    if (error) {
      throw new Error(`ingest_reconciliation_queue upsert failed: ${error.message}`);
    }
    upserted += Number((data as { upserted?: number } | null)?.upserted ?? 0);
  }

  let pruned = 0;
  if (prune) {
    const { data, error } = await supabase.rpc("ingest_reconciliation_queue", {
      p_entries: [],
      p_fingerprints: entries.map((entry) => entry.fingerprint),
      p_prune: true,
    });
    if (error) {
      throw new Error(`ingest_reconciliation_queue prune failed: ${error.message}`);
    }
    pruned = Number((data as { pruned?: number } | null)?.pruned ?? 0);
  }

  logger.info("Reconciliation queue synced", {
    entries: entries.length,
    upserted,
    pruned,
    pruneEnabled: prune,
  });
  return { upserted, pruned };
}
