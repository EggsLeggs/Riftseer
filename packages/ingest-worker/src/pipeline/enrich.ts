/**
 * Set reconciliation and TCGPlayer price/URI enrichment.
 *
 * Step 1 — reconcileSets: match IngestSets (from RiftCodex) to TCGPlayer groups
 *   by tcgplayer_group_id (direct, no fuzzy). Unmatched groups become new promo IngestSets.
 *
 * Step 2 — buildProductMap: index TCGPlayer products by productId.
 *
 * Step 3 — enrichCards: apply prices and purchase URIs to cards via tcgplayer_id.
 */

import type { TCGGroup, TCGGroupResult } from "../sources/tcgcsv.ts";
import type { IngestSet } from "./types.ts";
import type { Card } from "@riftseer/types";
import { overrides } from "../overrides/index.ts";
import { logger } from "../utils.ts";

interface EnrichedProduct {
  url: string;
  imageUrl: string | null;
  normal: { market: number | null; low: number | null };
  foil: { market: number | null; low: number | null };
  releasedOn: string | null;
  groupId: number;
}

/**
 * Match RiftCodex sets to TCGPlayer groups by tcgplayer_group_id.
 * Creates promo IngestSets for any TCGPlayer groups that have no RiftCodex counterpart.
 * Returns the full merged set list (RiftCodex sets + new promo sets).
 */
export function reconcileSets(ingestSets: IngestSet[], tcgGroups: TCGGroup[]): IngestSet[] {
  // Index by tcgplayer_group_id for sets that already have an explicit match
  const byGroupId = new Set<number>();
  for (const s of ingestSets) {
    if (s.external_ids.tcgplayer_group_id !== undefined) {
      byGroupId.add(s.external_ids.tcgplayer_group_id);
    }
  }

  // Index by set_code so we can enrich an existing RiftCodex set instead of
  // creating a duplicate promo set when abbreviations collide (e.g. TCGPlayer
  // "OGN" vs RiftCodex "OGN").
  const bySetCode = new Map<string, IngestSet>();
  for (const s of ingestSets) bySetCode.set(s.set_code, s);

  const allSets = [...ingestSets];
  let enriched = 0;
  let newPromo = 0;

  for (const group of tcgGroups) {
    if (byGroupId.has(group.groupId)) continue;

    const groupOverride = overrides.tcgplayerGroups[String(group.groupId)];
    const setCode = groupOverride?.set_code ?? group.abbreviation.toUpperCase();

    // If a RiftCodex set already uses this set_code, just backfill the
    // tcgplayer_group_id (and published_on if missing). Don't mark it promo.
    const existing = bySetCode.get(setCode);
    if (existing) {
      existing.external_ids.tcgplayer_group_id = group.groupId;
      if (group.publishedOn && !existing.published_on) {
        existing.published_on = group.publishedOn;
      }
      enriched++;
      continue;
    }

    // Genuinely new set (e.g. WB25 Worlds Bundle) — create as promo.
    const newSet: IngestSet = {
      set_code: setCode,
      set_name: groupOverride?.name ?? group.name,
      set_uri: `/search?q=&set=${setCode}`,
      published_on: group.publishedOn ?? null,
      is_promo: groupOverride?.is_promo ?? true,
      parent_set_code: groupOverride?.parent_set_code ?? null,
      external_ids: { tcgplayer_group_id: group.groupId },
    };
    allSets.push(newSet);
    bySetCode.set(setCode, newSet);
    newPromo++;
  }

  logger.info("Set reconciliation complete", {
    riftcodexSets: ingestSets.length,
    enrichedWithTCG: enriched,
    newPromoSets: newPromo,
  });

  return allSets;
}

/**
 * Build a productId → enriched-product map from TCGPlayer group results.
 * Filters out sealed products (no extendedData) and products with no Normal price.
 */
export function buildProductMap(groupResults: TCGGroupResult[]): Map<number, EnrichedProduct> {
  const map = new Map<number, EnrichedProduct>();

  for (const { groupId, products, prices } of groupResults) {
    const normalById = new Map(
      prices.filter((p) => p.subTypeName === "Normal").map((p) => [p.productId, p]),
    );
    const foilById = new Map(
      prices.filter((p) => p.subTypeName === "Foil").map((p) => [p.productId, p]),
    );

    for (const product of products) {
      if (!product.cleanName?.trim() || !product.url?.trim()) {
        logger.warn("Skipping malformed TCGPlayer product", { productId: product.productId });
        continue;
      }
      const extData = Array.isArray(product.extendedData) ? product.extendedData : [];
      if (extData.length === 0) continue; // sealed product (no card attributes)

      const normal = normalById.get(product.productId);
      const foil = foilById.get(product.productId);
      if (!normal && !foil) continue; // no pricing at all — skip

      if (!map.has(product.productId)) {
        map.set(product.productId, {
          url: product.url,
          imageUrl: product.imageUrl?.trim() || null,
          normal: { market: normal?.marketPrice ?? null, low: normal?.lowPrice ?? null },
          foil: { market: foil?.marketPrice ?? null, low: foil?.lowPrice ?? null },
          releasedOn: product.presaleInfo?.releasedOn ?? null,
          groupId,
        });
      }
    }
  }

  logger.info("Built TCGPlayer product map", { count: map.size });
  return map;
}

/**
 * Clear media on cards that share the same image_url as another card but
 * should have distinct product-specific art.  Two cases:
 *
 *  1. Same-set: alt-art or signature card sharing the base card's image.
 *  2. Cross-set: promo/reprint sharing image with a card in another set.
 *     The set with the most cards using that image is kept as the "primary";
 *     all other sets' cards get their media cleared.
 *
 * Cleared cards later receive TCGPlayer CDN images in enrichCards().
 */
export function clearDuplicateImages(cards: Card[]): number {
  const byImageUrl = new Map<string, Card[]>();
  for (const card of cards) {
    const url = card.media?.media_urls?.normal;
    if (!url) continue;
    let list = byImageUrl.get(url);
    if (!list) {
      list = [];
      byImageUrl.set(url, list);
    }
    list.push(card);
  }

  let cleared = 0;
  for (const [, group] of byImageUrl) {
    if (group.length < 2) continue;

    // Case 1: alt-art / signature sharing image with a base card
    const hasBase = group.some(
      (c) => !c.metadata?.alternate_art && !c.metadata?.signature,
    );
    if (hasBase) {
      for (const card of group) {
        if (card.metadata?.alternate_art || card.metadata?.signature) {
          card.media = { ...card.media, media_urls: undefined };
          cleared++;
        }
      }
    }

    // Case 2: cross-set duplicates (e.g. promo reprints)
    const bySets = new Map<string, Card[]>();
    for (const card of group) {
      if (!card.media?.media_urls) continue; // already cleared above
      const setCode = card.set?.set_code ?? "";
      let list = bySets.get(setCode);
      if (!list) {
        list = [];
        bySets.set(setCode, list);
      }
      list.push(card);
    }
    if (bySets.size < 2) continue;

    // Primary set = the one with the most cards using this image
    let primarySet = "";
    let primaryCount = 0;
    for (const [setCode, setCards] of bySets) {
      if (
        setCards.length > primaryCount ||
        (setCards.length === primaryCount && setCode < primarySet)
      ) {
        primarySet = setCode;
        primaryCount = setCards.length;
      }
    }

    for (const [setCode, setCards] of bySets) {
      if (setCode === primarySet) continue;
      for (const card of setCards) {
        card.media = { ...card.media, media_urls: undefined };
        cleared++;
      }
    }
  }

  if (cleared > 0) {
    logger.info("Cleared duplicate card images", { cleared });
  }
  return cleared;
}

/**
 * Apply TCGPlayer prices and purchase URIs to cards.
 * Matches via card.external_ids.tcgplayer_id (the productId stored by RiftCodex).
 */
export function enrichCards(
  cards: Card[],
  productMap: Map<number, EnrichedProduct>,
): { enriched: number; unmatched: number } {
  let enriched = 0;
  const matchedProductIds = new Set<number>();

  for (const card of cards) {
    const tcgIdStr = card.external_ids?.tcgplayer_id;
    if (!tcgIdStr) continue;
    const productId = parseInt(tcgIdStr, 10);
    const product = productMap.get(productId);
    if (!product) continue;

    card.purchase_uris = { ...card.purchase_uris, tcgplayer: product.url };
    card.prices = {
      ...card.prices,
      tcgplayer: {
        normal: product.normal.market,
        foil: product.foil.market,
        low_normal: product.normal.low,
        low_foil: product.foil.low,
      },
      cardmarket: {
        // Cardmarket feed is not currently available from the upstream source.
        // Keep a stable nested object shape with nullable values.
        normal: card.prices?.cardmarket?.normal ?? null,
        foil: card.prices?.cardmarket?.foil ?? null,
        low_normal: card.prices?.cardmarket?.low_normal ?? null,
        low_foil: card.prices?.cardmarket?.low_foil ?? null,
      },
    };
    if (!card.released_at && product.releasedOn) card.released_at = product.releasedOn;

    const cardOverride = overrides.cards[card.id];
    const needsTcgImage =
      !card.media?.media_urls?.normal || cardOverride?.use_tcgplayer_image;
    if (needsTcgImage && product.imageUrl) {
      const raw = product.imageUrl;
      let small: string;
      let normal: string;
      let large: string;
      if (/_200w\./.test(raw)) {
        small = raw;
        normal = raw.replace(/_200w\./, "_400w.");
        large = raw.replace(/_200w\./, "_in_1000x1000.");
      } else {
        logger.warn("TCGPlayer image URL missing _200w. token; using same URL for all sizes", {
          imageUrl: raw,
          cardId: card.id,
        });
        small = raw;
        normal = raw;
        large = raw;
      }
      card.media = {
        ...card.media,
        media_urls: { small, normal, large },
      };
    }

    matchedProductIds.add(productId);
    enriched++;
  }

  const unmatched = productMap.size - matchedProductIds.size;
  if (unmatched > 0) logger.debug("Unmatched TCGPlayer products", { unmatched });

  return { enriched, unmatched };
}
