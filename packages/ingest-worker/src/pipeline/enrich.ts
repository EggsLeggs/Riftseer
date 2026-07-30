/**
 * TCGPlayer price / purchase-URI enrichment.
 *
 * RiftCodex is the sole source of sets and cards. TCGPlayer is used ONLY to add
 * prices, purchase URIs, and (as a last resort) a fallback image — it never
 * creates sets or cards.
 *
 * Step 1 — matchTcgGroupsToSets: backfill each RiftCodex set's tcgplayer_group_id
 *   from a matching TCGPlayer group (by group_id or set_code). Returns a
 *   set_code → groupId map. Never invents promo sets.
 * Step 2 — buildProductMap: index TCGPlayer products by productId AND by
 *   (groupId → normalized name) so cards without a tcgplayer_id can still match.
 * Step 3 — enrichCards: apply prices + purchase URIs to cards, matching by
 *   tcgplayer_id first, then by (set's group + normalized name).
 */

import { normalizeCardName } from "../utils.ts";
import type { TCGGroup, TCGGroupResult } from "../sources/tcgcsv.ts";
import type { IngestSet } from "./types.ts";
import type { Card } from "@riftseer/types";
import { overrides } from "../overrides/index.ts";
import { logger } from "../utils.ts";

interface PriceSide {
  market: number | null;
  mid: number | null;
  low: number | null;
}

interface EnrichedProduct {
  productId: number;
  normalizedName: string;
  collectorNumber: string | null;
  url: string;
  imageUrl: string | null;
  normal: PriceSide;
  foil: PriceSide;
  releasedOn: string | null;
  groupId: number;
}

export interface ProductMaps {
  /** productId → product */
  byId: Map<number, EnrichedProduct>;
  /** groupId → (collector number + normalized name → product) */
  byGroupCollectorName: Map<number, Map<string, EnrichedProduct>>;
  /** groupId → (normalized name → product) */
  byGroupName: Map<number, Map<string, EnrichedProduct>>;
}

/**
 * Match RiftCodex sets to TCGPlayer groups so prices can be enriched. Mutates
 * each set's `external_ids.tcgplayer_group_id` where a group matches by existing
 * group_id, a `tcgplayer_groups` override, or an equal set_code. Returns a
 * set_code → groupId map. Unmatched TCGPlayer groups are ignored (no promo sets).
 */
export function matchTcgGroupsToSets(
  ingestSets: IngestSet[],
  tcgGroups: TCGGroup[],
): Map<string, number> {
  const bySetCode = new Map<string, IngestSet>();
  for (const s of ingestSets) bySetCode.set(s.set_code, s);

  const setGroupMap = new Map<string, number>();
  // Seed from sets that already carry a group id (from RiftCodex /sets).
  for (const s of ingestSets) {
    const gid = s.external_ids.tcgplayer_group_id;
    if (typeof gid === "number") setGroupMap.set(s.set_code, gid);
  }

  let matched = 0;
  for (const group of tcgGroups) {
    const groupOverride = overrides.tcgplayerGroups[String(group.groupId)];
    const setCode = groupOverride?.set_code ?? group.abbreviation?.toUpperCase();
    if (!setCode) continue;

    const existing = bySetCode.get(setCode);
    if (!existing) continue; // no RiftCodex set for this group — ignore it

    existing.external_ids.tcgplayer_group_id = group.groupId;
    if (group.publishedOn && !existing.published_on) {
      existing.published_on = group.publishedOn;
    }
    setGroupMap.set(setCode, group.groupId);
    matched++;
  }

  logger.info("Matched TCGPlayer groups to sets", {
    riftcodexSets: ingestSets.length,
    matchedGroups: matched,
  });
  return setGroupMap;
}

function priceSide(p: { marketPrice: number | null; midPrice: number | null; lowPrice: number | null } | undefined): PriceSide {
  return {
    market: p?.marketPrice ?? null,
    mid: p?.midPrice ?? null,
    low: p?.lowPrice ?? null,
  };
}

/** Prefer marketPrice, then midPrice, then lowPrice, so USD is populated widely. */
function bestPrice(side: PriceSide): number | null {
  return side.market ?? side.mid ?? side.low;
}

function normalizeCollectorNumber(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const firstPart = String(value).split("/")[0]?.trim().toLowerCase();
  return firstPart || null;
}

function extractProductCollectorNumber(
  product: TCGGroupResult["products"][number],
): string | null {
  const numberField = product.extendedData?.find((entry) => {
    const key = entry.name || entry.displayName;
    return key.toLowerCase() === "number";
  });
  return normalizeCollectorNumber(numberField?.value);
}

function collectorCandidates(card: Card): string[] {
  const out = new Set<string>();
  const base = normalizeCollectorNumber(card.collector_number);
  if (base) {
    out.add(base);
    if (card.metadata?.alternate_art) out.add(`${base}a`);
    if (card.metadata?.signature) out.add(`${base}*`);
  }

  const riftboundId = card.external_ids?.riftbound_id;
  const [, printedNumber] = riftboundId?.match(/^[^-]+-([^-]+)-/i) ?? [];
  const fromRiftboundId = normalizeCollectorNumber(printedNumber);
  if (fromRiftboundId) out.add(fromRiftboundId);

  return [...out];
}

function collectorNameKey(collectorNumber: string, normalizedName: string): string {
  return `${collectorNumber}|${normalizedName}`;
}

/**
 * Build productId → product and (groupId → normalized name → product) indexes.
 * Sealed products (empty extendedData) are still indexed — their names ("Booster
 * Box", etc.) don't collide with card names, and skipping them dropped legitimate
 * cards whose extendedData was empty upstream.
 */
export function buildProductMap(groupResults: TCGGroupResult[]): ProductMaps {
  const byId = new Map<number, EnrichedProduct>();
  const byGroupCollectorName = new Map<number, Map<string, EnrichedProduct>>();
  const byGroupName = new Map<number, Map<string, EnrichedProduct>>();

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

      const enriched: EnrichedProduct = {
        productId: product.productId,
        normalizedName: normalizeCardName(product.cleanName),
        collectorNumber: extractProductCollectorNumber(product),
        url: product.url,
        imageUrl: product.imageUrl?.trim() || null,
        normal: priceSide(normalById.get(product.productId)),
        foil: priceSide(foilById.get(product.productId)),
        releasedOn: product.presaleInfo?.releasedOn ?? null,
        groupId,
      };

      byId.set(product.productId, enriched);

      if (enriched.collectorNumber) {
        let collectorMap = byGroupCollectorName.get(groupId);
        if (!collectorMap) {
          collectorMap = new Map();
          byGroupCollectorName.set(groupId, collectorMap);
        }
        const key = collectorNameKey(enriched.collectorNumber, enriched.normalizedName);
        if (!collectorMap.has(key)) {
          collectorMap.set(key, enriched);
        }
      }

      let nameMap = byGroupName.get(groupId);
      if (!nameMap) {
        nameMap = new Map();
        byGroupName.set(groupId, nameMap);
      }
      // First writer wins; keep the deterministic earliest product for a name.
      if (!nameMap.has(enriched.normalizedName)) {
        nameMap.set(enriched.normalizedName, enriched);
      }
    }
  }

  logger.info("Built TCGPlayer product map", {
    products: byId.size,
    groupsWithCollectors: byGroupCollectorName.size,
    groupsWithNames: byGroupName.size,
  });
  return { byId, byGroupCollectorName, byGroupName };
}

function applyProduct(card: Card, product: EnrichedProduct): void {
  card.purchase_uris = { ...card.purchase_uris, tcgplayer: product.url };
  card.prices = {
    ...card.prices,
    tcgplayer: {
      normal: bestPrice(product.normal),
      foil: bestPrice(product.foil),
      low_normal: product.normal.low,
      low_foil: product.foil.low,
    },
    cardmarket: {
      // Cardmarket feed is not available upstream — keep a stable nullable shape.
      normal: card.prices?.cardmarket?.normal ?? null,
      foil: card.prices?.cardmarket?.foil ?? null,
      low_normal: card.prices?.cardmarket?.low_normal ?? null,
      low_foil: card.prices?.cardmarket?.low_foil ?? null,
    },
  };
  if (!card.released_at && product.releasedOn) card.released_at = product.releasedOn;

  // Backfill the tcgplayer_id we matched by name, so it's stable next run.
  if (!card.external_ids?.tcgplayer_id) {
    card.external_ids = { ...card.external_ids, tcgplayer_id: String(product.productId) };
  }

  const cardOverride = overrides.cards[card.id];
  const hasRiftCodexImage = Boolean(
    card.media?.source_url ||
      card.media?.media_urls?.large ||
      card.media?.media_urls?.normal ||
      card.media?.media_urls?.png ||
      card.media?.media_urls?.small,
  );
  const needsTcgImage =
    !hasRiftCodexImage || cardOverride?.use_tcgplayer_image;
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
      source_url: large,
      source_provider: "tcgplayer",
      media_urls: { small, normal, large },
    };
  }
}

/**
 * Apply TCGPlayer prices and purchase URIs to cards.
 *   1. Match by card.external_ids.tcgplayer_id (RiftCodex's productId).
 *   2. Fall back to the card's set group + collector number + normalized name.
 *   3. Fall back to the card's set group + normalized name.
 */
export function enrichCards(
  cards: Card[],
  maps: ProductMaps,
  setGroupMap: Map<string, number>,
): { enriched: number; byId: number; byCollectorName: number; byName: number } {
  let byIdCount = 0;
  let byCollectorNameCount = 0;
  let byNameCount = 0;

  for (const card of cards) {
    let product: EnrichedProduct | undefined;
    const setCode = card.set?.set_code;
    const groupId = setCode ? setGroupMap.get(setCode) : undefined;

    const tcgIdStr = card.external_ids?.tcgplayer_id;
    if (tcgIdStr) {
      const productId = parseInt(tcgIdStr, 10);
      if (Number.isFinite(productId)) product = maps.byId.get(productId);
      if (product) byIdCount++;
    }

    if (!product) {
      const collectorMap =
        groupId !== undefined ? maps.byGroupCollectorName.get(groupId) : undefined;
      for (const collectorNumber of collectorCandidates(card)) {
        const match = collectorMap?.get(
          collectorNameKey(collectorNumber, card.name_normalized),
        );
        if (match) {
          product = match;
          byCollectorNameCount++;
          break;
        }
      }
    }

    if (!product) {
      if (groupId !== undefined) {
        const nameMap = maps.byGroupName.get(groupId);
        const match = nameMap?.get(card.name_normalized);
        if (match) {
          product = match;
          byNameCount++;
        }
      }
    }

    if (product) applyProduct(card, product);
  }

  const enriched = byIdCount + byCollectorNameCount + byNameCount;
  logger.info("TCGPlayer enrichment applied", {
    enriched,
    matchedById: byIdCount,
    matchedByCollectorName: byCollectorNameCount,
    matchedByName: byNameCount,
    cards: cards.length,
  });
  return {
    enriched,
    byId: byIdCount,
    byCollectorName: byCollectorNameCount,
    byName: byNameCount,
  };
}
