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

export interface EnrichedProduct {
  productId: number;
  /** TCGPlayer's `cleanName`, kept verbatim for the reconciliation queue. */
  name: string;
  normalizedName: string;
  collectorNumber: string | null;
  /** Printed rarity, for the reconciler. `None` upstream reads as absent. */
  rarity: string | null;
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
  /** groupId → (collector number → every product printing it) */
  byGroupCollector: Map<number, Map<string, EnrichedProduct[]>>;
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

export function normalizeCollectorNumber(
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const firstPart = String(value).split("/")[0]?.trim().toLowerCase();
  return firstPart || null;
}

function extendedValue(
  product: TCGGroupResult["products"][number],
  field: string,
): string | null {
  const entry = product.extendedData?.find((candidate) => {
    const key = candidate.name || candidate.displayName;
    return key.toLowerCase() === field;
  });
  return entry?.value?.trim() || null;
}

function extractProductCollectorNumber(
  product: TCGGroupResult["products"][number],
): string | null {
  return normalizeCollectorNumber(extendedValue(product, "number"));
}

/**
 * TCGPlayer writes the literal string `None` on products it has no rarity for;
 * that is an absence, not a rarity, and must never be reported as a diff.
 */
function extractProductRarity(
  product: TCGGroupResult["products"][number],
): string | null {
  const value = extendedValue(product, "rarity");
  return !value || value.toLowerCase() === "none" ? null : value;
}

/**
 * Every collector number a card may legitimately carry on TCGPlayer: the plain
 * number, the `a` suffix TCGPlayer uses for alternate art, the `*` suffix it
 * uses for signatures, and the number embedded in the RiftCodex riftbound_id.
 * Shared with the reconciler so a variant suffix is never reported as a
 * collector-number disagreement.
 *
 * Prefixed numbers (`T03`, `SP3`, `R01`) also contribute their bare digits.
 * TCGPlayer spells those tracks both ways across groups, and RiftCodex itself
 * only ever knew the digits.
 */
export function collectorCandidates(card: Card): string[] {
  const out = new Set<string>();

  // Most specific first. A variant printing and its base share a name in the
  // Vendetta data, so trying the bare number first matched the alternate art
  // against the base printing's product — and it never reached `113a`.
  const riftboundId = card.external_ids?.riftbound_id;
  const [, printedNumber] = riftboundId?.match(/^[^-]+-([^-]+)(?:-|$)/i) ?? [];
  const fromRiftboundId = normalizeCollectorNumber(printedNumber);
  if (fromRiftboundId) out.add(fromRiftboundId);

  const base = normalizeCollectorNumber(card.collector_number);
  if (base) {
    if (card.metadata?.alternate_art) out.add(`${base}a`);
    if (card.metadata?.signature) out.add(`${base}*`);
    out.add(base);

    const [, digits] = base.match(/^[a-z]+(\d+)$/) ?? [];
    if (digits) {
      out.add(digits);
      out.add(String(Number(digits)));
    }
  }

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
  const byGroupCollector = new Map<number, Map<string, EnrichedProduct[]>>();
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
        name: product.cleanName.trim(),
        normalizedName: normalizeCardName(product.cleanName),
        collectorNumber: extractProductCollectorNumber(product),
        rarity: extractProductRarity(product),
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

        let numberMap = byGroupCollector.get(groupId);
        if (!numberMap) {
          numberMap = new Map();
          byGroupCollector.set(groupId, numberMap);
        }
        const existing = numberMap.get(enriched.collectorNumber);
        if (existing) existing.push(enriched);
        else numberMap.set(enriched.collectorNumber, [enriched]);
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
  return { byId, byGroupCollectorName, byGroupCollector, byGroupName };
}

/** How `enrichCards` found the product — see the numbered fallbacks there. */
type ProductMatchSource = "id" | "collector-name" | "collector" | "name";

function applyProduct(
  card: Card,
  product: EnrichedProduct,
  matchSource: ProductMatchSource,
): void {
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

  // Persist the id we actually matched, so next run resolves it directly. A
  // fallback match means any stored id failed to resolve to a product — leaving
  // it in place would keep the card matching by name forever.
  if (matchSource !== "id") {
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

/** How confident a match is. Lower wins when two cards want the same product. */
const MATCH_RANK: Record<ProductMatchSource, number> = {
  id: 0,
  "collector-name": 1,
  collector: 2,
  name: 3,
};

/**
 * True when the two names describe the same card, allowing for the variant
 * wording each side appends: TCGPlayer writes "Ambessa The Wolf Alternate Art"
 * where RiftCodex writes "Ambessa, The Wolf". Either may be the longer one —
 * Origins-era RiftCodex names carry "(Alternate Art)" and TCGPlayer's do not.
 */
function namesAgreeAllowingVariantSuffix(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length > 0 && longer.startsWith(`${shorter} `);
}

/**
 * How far a printing is from the plain one. TCGPlayer names its variants
 * ("Sett Brawler Alternate Art"), so a product whose name matches ours plainly
 * is describing our plain printing — when several printings contend for one
 * product, the least variant of them is the one it means.
 */
function variantDistance(card: Card): number {
  const m = card.metadata;
  return (
    (m?.alternate_art ? 1 : 0) +
    (m?.signature ? 1 : 0) +
    (m?.overnumbered ? 1 : 0)
  );
}

/** The best match this card can find, or undefined. */
function findProduct(
  card: Card,
  maps: ProductMaps,
  groupId: number | undefined,
): { product: EnrichedProduct; matchSource: ProductMatchSource } | undefined {
  const tcgIdStr = card.external_ids?.tcgplayer_id;
  if (tcgIdStr) {
    const productId = parseInt(tcgIdStr, 10);
    if (Number.isFinite(productId)) {
      const product = maps.byId.get(productId);
      if (product) return { product, matchSource: "id" };
    }
  }

  if (groupId !== undefined) {
    const collectorMap = maps.byGroupCollectorName.get(groupId);
    const numberMap = maps.byGroupCollector.get(groupId);

    // Both lookups run per candidate number, most specific first, so a match on
    // the variant number (`113a`) always beats one on the bare number (`113`).
    // Doing all the exact-name lookups first would hand the alternate art its
    // base printing's product, since the two share a name in the Vendetta data.
    for (const collectorNumber of collectorCandidates(card)) {
      const exact = collectorMap?.get(
        collectorNameKey(collectorNumber, card.name_normalized),
      );
      if (exact) return { product: exact, matchSource: "collector-name" };

      // Number alone, guarded by the name. TCGPlayer distinguishes printings by
      // a name suffix ("… Alternate Art") and by the `a` on the number, where
      // Vendetta's RiftCodex names are identical — so the number is the only
      // key both sides share. Only when unambiguous: two products on one number
      // means the number cannot identify the printing by itself.
      const candidates = (numberMap?.get(collectorNumber) ?? []).filter((p) =>
        namesAgreeAllowingVariantSuffix(p.normalizedName, card.name_normalized),
      );
      if (candidates.length === 1) {
        return { product: candidates[0]!, matchSource: "collector" };
      }
    }

    const product = maps.byGroupName.get(groupId)?.get(card.name_normalized);
    if (product) return { product, matchSource: "name" };
  }

  return undefined;
}

/**
 * Apply TCGPlayer prices and purchase URIs to cards.
 *   1. Match by card.external_ids.tcgplayer_id (RiftCodex's productId).
 *   2. Fall back to the card's set group + collector number + normalized name.
 *   3. Fall back to the card's set group + collector number, when exactly one
 *      product carries it and the names agree bar a variant suffix.
 *   4. Fall back to the card's set group + normalized name.
 *
 * **A product is applied to at most one card.** TCGPlayer often lists a single
 * product where we hold several printings — the base, its alternate art, its
 * overnumbered and signature reprints — and the name-only fallback happily gave
 * all of them the same product id. That is wrong twice over: it publishes the
 * base printing's price on a printing that has none, and because the reconciler
 * compares each card against its linked product, it files a permanent rarity
 * disagreement against every variant (TCGPlayer describes the base, so it never
 * agrees and the entry can never be resolved).
 *
 * Matches are therefore collected first and contention resolved per product:
 * strongest match tier wins, then the least variant printing, then the lowest
 * card id so a tie is stable across runs. A card that loses simply gets no
 * TCGPlayer data, which is the truth — that printing is not listed.
 */
export function enrichCards(
  cards: Card[],
  maps: ProductMaps,
  setGroupMap: Map<string, number>,
): {
  enriched: number;
  byId: number;
  byCollectorName: number;
  byCollector: number;
  byName: number;
} {
  interface Claim {
    card: Card;
    matchSource: ProductMatchSource;
  }
  const claims = new Map<number, Claim[]>();

  for (const card of cards) {
    const setCode = card.set?.set_code;
    const groupId = setCode ? setGroupMap.get(setCode) : undefined;
    const match = findProduct(card, maps, groupId);
    if (!match) continue;
    const existing = claims.get(match.product.productId);
    const claim: Claim = { card, matchSource: match.matchSource };
    if (existing) existing.push(claim);
    else claims.set(match.product.productId, [claim]);
  }

  let byIdCount = 0;
  let byCollectorNameCount = 0;
  let byCollectorCount = 0;
  let byNameCount = 0;
  let contested = 0;

  for (const [productId, contenders] of claims) {
    const product = maps.byId.get(productId);
    if (!product) continue;

    const [winner] = [...contenders].sort((a, b) => {
      const rank = MATCH_RANK[a.matchSource] - MATCH_RANK[b.matchSource];
      if (rank !== 0) return rank;
      const variant = variantDistance(a.card) - variantDistance(b.card);
      if (variant !== 0) return variant;
      return a.card.id.localeCompare(b.card.id);
    });

    if (contenders.length > 1) {
      contested += contenders.length - 1;
      for (const loser of contenders) {
        if (loser === winner) continue;
        // A loser that matched *by id* is carrying the contested id upstream.
        // Leaving it there would keep the reconciler comparing that printing
        // against a product describing another one, filing a disagreement no
        // admin can ever resolve. One product, one card — including the id.
        if (loser.card.external_ids?.tcgplayer_id === String(productId)) {
          const { tcgplayer_id: _dropped, ...rest } = loser.card.external_ids;
          loser.card.external_ids = rest;
        }
      }
      logger.info("TCGPlayer product contested by several printings", {
        productId,
        productName: product.name,
        winner: winner.card.id,
        winnerName: winner.card.name,
        skipped: contenders
          .filter((c) => c !== winner)
          .map((c) => `${c.card.id} (${c.matchSource})`),
      });
    }

    if (winner.matchSource === "id") byIdCount++;
    else if (winner.matchSource === "collector-name") byCollectorNameCount++;
    else if (winner.matchSource === "collector") byCollectorCount++;
    else byNameCount++;

    applyProduct(winner.card, product, winner.matchSource);
  }

  const enriched =
    byIdCount + byCollectorNameCount + byCollectorCount + byNameCount;
  logger.info("TCGPlayer enrichment applied", {
    enriched,
    matchedById: byIdCount,
    matchedByCollectorName: byCollectorNameCount,
    matchedByName: byNameCount,
    contested,
    cards: cards.length,
  });
  return {
    enriched,
    byId: byIdCount,
    byCollectorName: byCollectorNameCount,
    byCollector: byCollectorCount,
    byName: byNameCount,
  };
}

/**
 * Second pass for cards whose `tcgplayer_id` only appeared after the DB override
 * overlay — the link an admin confirmed in the review queue.
 *
 * `enrichCards` runs on the raw RiftCodex result, before overrides are applied,
 * so it cannot see that link and those cards would otherwise stay priceless
 * forever. This deliberately touches only prices and the purchase URI: media and
 * every other field are already final at this point in the pipeline, and an
 * admin's image override must not be undone by a late enrichment pass.
 */
export function backfillLinkedPrices(cards: Card[], maps: ProductMaps): number {
  let applied = 0;

  for (const card of cards) {
    if (card.prices?.tcgplayer?.normal != null) continue;

    const tcgIdStr = card.external_ids?.tcgplayer_id;
    if (!tcgIdStr) continue;
    const productId = parseInt(tcgIdStr, 10);
    if (!Number.isFinite(productId)) continue;

    const product = maps.byId.get(productId);
    if (!product) continue;

    card.purchase_uris = {
      ...card.purchase_uris,
      tcgplayer: card.purchase_uris?.tcgplayer ?? product.url,
    };
    card.prices = {
      ...card.prices,
      tcgplayer: {
        normal: bestPrice(product.normal),
        foil: bestPrice(product.foil),
        low_normal: product.normal.low,
        low_foil: product.foil.low,
      },
    };
    applied++;
  }

  if (applied > 0) {
    logger.info("Backfilled prices for override-linked cards", { applied });
  }
  return applied;
}
