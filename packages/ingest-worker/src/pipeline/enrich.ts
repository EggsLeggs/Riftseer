/**
 * TCGPlayer price / purchase-URI enrichment.
 *
 * RiftCodex is the sole source of sets and cards. TCGPlayer is used ONLY to add
 * prices, purchase URIs, and (as a last resort) a fallback image — it never
 * creates sets or printings.
 *
 * Step 1 — matchTcgGroupsToSets: backfill each RiftCodex set's tcgplayer_group_id
 *   from a matching TCGPlayer group (by group_id or set_code). Returns a
 *   set_code → groupId map. Never invents promo sets.
 * Step 2 — buildProductMap: index TCGPlayer products by productId AND by
 *   (groupId → normalized name) so printings without a tcgplayer_id can match.
 * Step 3 — enrichPrintings: apply prices + purchase URIs, matching by
 *   tcgplayer_id first, then by (set's group + normalized name).
 */

import { normalizeCardName } from "../utils.ts";
import type { TCGGroup, TCGGroupResult } from "../sources/tcgcsv.ts";
import type { IngestPrinting, IngestSet } from "./types.ts";
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
    if (typeof s.tcgplayer_group_id === "number") {
      setGroupMap.set(s.set_code, s.tcgplayer_group_id);
    }
  }

  let matched = 0;
  for (const group of tcgGroups) {
    const groupOverride = overrides.tcgplayerGroups[String(group.groupId)];
    const setCode = groupOverride?.set_code ?? group.abbreviation?.toUpperCase();
    if (!setCode) continue;

    const existing = bySetCode.get(setCode);
    if (!existing) continue; // no RiftCodex set for this group — ignore it

    existing.tcgplayer_group_id = group.groupId;
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
export function collectorCandidates(printing: IngestPrinting): string[] {
  const out = new Set<string>();

  // Most specific first. A variant printing and its base share a name in the
  // Vendetta data, so trying the bare number first matched the alternate art
  // against the base printing's product — and it never reached `113a`.
  const [, printedNumber] =
    printing.riftbound_id?.match(/^[^-]+-([^-]+)(?:-|$)/i) ?? [];
  const fromRiftboundId = normalizeCollectorNumber(printedNumber);
  if (fromRiftboundId) out.add(fromRiftboundId);

  const base = normalizeCollectorNumber(printing.collector_number);
  if (base) {
    if (printing.is_alternate_art) out.add(`${base}a`);
    if (printing.is_signature) out.add(`${base}*`);
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

/** How `enrichPrintings` found the product — see the numbered fallbacks there. */
type ProductMatchSource = "id" | "collector-name" | "collector" | "name";

function applyProduct(
  printing: IngestPrinting,
  product: EnrichedProduct,
  matchSource: ProductMatchSource,
): void {
  printing.tcgplayer_url = product.url;
  printing.price_normal = bestPrice(product.normal);
  printing.price_foil = bestPrice(product.foil);
  printing.price_low_normal = product.normal.low;
  printing.price_low_foil = product.foil.low;
  if (!printing.released_at && product.releasedOn) {
    printing.released_at = product.releasedOn;
  }

  // Persist the id we actually matched, so next run resolves it directly. A
  // fallback match means any stored id failed to resolve to a product — leaving
  // it in place would keep the printing matching by name forever.
  if (matchSource !== "id") {
    printing.tcgplayer_id = String(product.productId);
  }

  const cardOverride = overrides.cards[printing.id];
  const needsTcgImage =
    !printing.image_source_url || cardOverride?.use_tcgplayer_image;
  if (needsTcgImage && product.imageUrl) {
    const raw = product.imageUrl;
    // Only the largest is kept: the hosted variants are transcoded down from
    // whatever source we store, so the smaller CDN sizes have no use.
    if (/_200w\./.test(raw)) {
      printing.image_source_url = raw.replace(/_200w\./, "_in_1000x1000.");
    } else {
      logger.warn("TCGPlayer image URL missing _200w. token; using it as-is", {
        imageUrl: raw,
        printingId: printing.id,
      });
      printing.image_source_url = raw;
    }
    printing.image_source_provider = "tcgplayer";
  }
}

/** How confident a match is. Lower wins when two printings want the same product. */
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
function variantDistance(printing: IngestPrinting): number {
  return (
    (printing.is_alternate_art ? 1 : 0) +
    (printing.is_signature ? 1 : 0) +
    (printing.is_overnumbered ? 1 : 0)
  );
}

/** The best match this printing can find, or undefined. */
function findProduct(
  printing: IngestPrinting,
  maps: ProductMaps,
  groupId: number | undefined,
): { product: EnrichedProduct; matchSource: ProductMatchSource } | undefined {
  const tcgIdStr = printing.tcgplayer_id;
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
    for (const collectorNumber of collectorCandidates(printing)) {
      const exact = collectorMap?.get(
        collectorNameKey(collectorNumber, printing.name_normalized),
      );
      if (exact) return { product: exact, matchSource: "collector-name" };

      // Number alone, guarded by the name. TCGPlayer distinguishes printings by
      // a name suffix ("… Alternate Art") and by the `a` on the number, where
      // Vendetta's RiftCodex names are identical — so the number is the only
      // key both sides share. Only when unambiguous: two products on one number
      // means the number cannot identify the printing by itself.
      const candidates = (numberMap?.get(collectorNumber) ?? []).filter((p) =>
        namesAgreeAllowingVariantSuffix(p.normalizedName, printing.name_normalized),
      );
      if (candidates.length === 1) {
        return { product: candidates[0]!, matchSource: "collector" };
      }
    }

    const product = maps.byGroupName.get(groupId)?.get(printing.name_normalized);
    if (product) return { product, matchSource: "name" };
  }

  return undefined;
}

/**
 * Apply TCGPlayer prices and purchase URIs to printings.
 *   1. Match by the printing's `tcgplayer_id` (RiftCodex's, or an admin's).
 *   2. Fall back to the set's group + collector number + normalized name.
 *   3. Fall back to the set's group + collector number, when exactly one
 *      product carries it and the names agree bar a variant suffix.
 *   4. Fall back to the set's group + normalized name.
 *
 * **A product is applied to at most one printing.** TCGPlayer often lists a
 * single product where we hold several printings — the base, its alternate art,
 * its overnumbered and signature reprints — and the name-only fallback happily
 * gave all of them the same product id. That is wrong twice over: it publishes
 * the base printing's price on a printing that has none, and because the
 * reconciler compares each printing against its linked product, it files a
 * permanent rarity disagreement against every variant (TCGPlayer describes the
 * base, so it never agrees and the entry can never be resolved).
 *
 * Matches are therefore collected first and contention resolved per product: an
 * admin-confirmed link first, then the strongest match tier, then the least
 * variant printing, then the lowest id so a tie is stable across runs. A
 * printing that loses simply gets no TCGPlayer data, which is the truth — that
 * printing is not listed.
 */
export function enrichPrintings(
  printings: IngestPrinting[],
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
    printing: IngestPrinting;
    matchSource: ProductMatchSource;
  }
  const claims = new Map<number, Claim[]>();

  for (const printing of printings) {
    const groupId = printing.set_code
      ? setGroupMap.get(printing.set_code)
      : undefined;
    const match = findProduct(printing, maps, groupId);
    if (!match) continue;
    const existing = claims.get(match.product.productId);
    const claim: Claim = { printing, matchSource: match.matchSource };
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
      // An admin confirmed this link in the review queue. Letting a heuristic
      // outrank it would re-file the entry they just resolved.
      const locked =
        Number(Boolean(b.printing.tcgplayer_id_locked)) -
        Number(Boolean(a.printing.tcgplayer_id_locked));
      if (locked !== 0) return locked;
      const rank = MATCH_RANK[a.matchSource] - MATCH_RANK[b.matchSource];
      if (rank !== 0) return rank;
      const variant = variantDistance(a.printing) - variantDistance(b.printing);
      if (variant !== 0) return variant;
      return a.printing.id.localeCompare(b.printing.id);
    });

    if (contenders.length > 1) {
      contested += contenders.length - 1;
      for (const loser of contenders) {
        if (loser === winner) continue;
        // A loser that matched *by id* is carrying the contested id upstream.
        // Leaving it there would keep the reconciler comparing that printing
        // against a product describing another one, filing a disagreement no
        // admin can ever resolve. One product, one printing — including the id.
        // An admin-locked id is exempt: it is a decision, not an observation.
        if (
          !loser.printing.tcgplayer_id_locked &&
          loser.printing.tcgplayer_id === String(productId)
        ) {
          loser.printing.tcgplayer_id = undefined;
        }
      }
      logger.info("TCGPlayer product contested by several printings", {
        productId,
        productName: product.name,
        winner: winner.printing.id,
        winnerName: winner.printing.name,
        skipped: contenders
          .filter((c) => c !== winner)
          .map((c) => `${c.printing.id} (${c.matchSource})`),
      });
    }

    if (winner.matchSource === "id") byIdCount++;
    else if (winner.matchSource === "collector-name") byCollectorNameCount++;
    else if (winner.matchSource === "collector") byCollectorCount++;
    else byNameCount++;

    applyProduct(winner.printing, product, winner.matchSource);
  }

  const enriched =
    byIdCount + byCollectorNameCount + byCollectorCount + byNameCount;
  logger.info("TCGPlayer enrichment applied", {
    enriched,
    matchedById: byIdCount,
    matchedByCollectorName: byCollectorNameCount,
    matchedByCollector: byCollectorCount,
    matchedByName: byNameCount,
    contested,
    printings: printings.length,
  });
  return {
    enriched,
    byId: byIdCount,
    byCollectorName: byCollectorNameCount,
    byCollector: byCollectorCount,
    byName: byNameCount,
  };
}
