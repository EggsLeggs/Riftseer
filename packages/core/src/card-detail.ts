// ─── Oracle detail assembly ────────────────────────────────────────────────────
//
// Builds the aggregate payload behind the public card page.
//
// The flat model needed a name-based grouping pass (`dedupeByCharacter`) here,
// because ingest linked champions and legends *per printing* and the same
// character came back several times. Relationships are oracle→oracle edges
// now, already one row per card, so that pass is gone along with the ranking
// heuristic it needed.

import { absoluteRiftseerUri } from "@riftseer/types/slug";
import { logger } from "./logger.ts";
import type { CardDataProvider } from "./provider.ts";
import type {
  CardLegality,
  CardPurchaseUris,
  CardRuling,
  Oracle,
  OracleDetail,
  OracleRef,
  Printing,
} from "./types.ts";

const TCGPLAYER_PRODUCT_LINE = "Riftbound";

const TCGPLAYER_HOSTS = new Set([
  "www.tcgplayer.com",
  "tcgplayer.com",
  "partner.tcgplayer.com",
]);
const CARDMARKET_HOSTS = new Set(["www.cardmarket.com", "cardmarket.com"]);

/**
 * A stored purchase URI is only trusted when it is HTTPS and on a host we
 * recognise — it comes from an upstream feed, and a card page must not become
 * an open redirect.
 */
function validateMarketplaceUrl(
  url: string | undefined,
  allowedHosts: Set<string>,
): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return allowedHosts.has(parsed.hostname.toLowerCase()) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function tcgplayerSearchUrl(name: string): string {
  const params = new URLSearchParams({
    q: name,
    view: "grid",
    direct: "true",
    productLineName: TCGPLAYER_PRODUCT_LINE,
    setName: "product",
  });
  return `https://www.tcgplayer.com/search/riftbound/product?${params.toString()}`;
}

function cardmarketSearchUrl(name: string): string {
  const params = new URLSearchParams({
    searchMode: "v2",
    idCategory: "0",
    idExpansion: "0",
    searchString: `[${name}]`,
    exactMatch: "on",
    idRarity: "0",
    perSite: "30",
  });
  return `https://www.cardmarket.com/en/Riftbound/Products/Search?${params.toString()}`;
}

/**
 * Best TCGPlayer link for a printing: the stored purchase URI when it points
 * at a host we trust, then the direct product page, then a name search.
 */
export function tcgplayerUrlForPrinting(printing: Printing, name: string): string {
  const stored = validateMarketplaceUrl(
    printing.purchase_uris?.tcgplayer,
    TCGPLAYER_HOSTS,
  );
  if (stored) return stored;
  const productId = printing.external_ids?.tcgplayer_id;
  if (productId) return `https://www.tcgplayer.com/product/${productId}`;
  return tcgplayerSearchUrl(name);
}

/** Best Cardmarket link for a printing, falling back to an exact-name search. */
export function cardmarketUrlForPrinting(printing: Printing, name: string): string {
  return (
    validateMarketplaceUrl(printing.purchase_uris?.cardmarket, CARDMARKET_HOSTS) ??
    cardmarketSearchUrl(name)
  );
}

// ─── Detail assembly ───────────────────────────────────────────────────────────

export interface BuildOracleDetailOptions {
  /** Public site origin used to compute `riftseer_uri`. */
  siteOrigin?: string;
  /**
   * Applied to every printing before it goes into the payload — the API uses
   * this to strip prices and rewrite affiliate links.
   */
  prepare?: (printing: Printing) => Printing;
}

type OracleDetailProvider = Pick<
  CardDataProvider,
  "getPrintingsForOracle" | "getOracleRelationships"
> &
  Partial<Pick<CardDataProvider, "getLegalities" | "getRulings">>;

/**
 * Rulings and legalities are supplementary: the card page is fully useful
 * without them. A failure here must not turn the whole response into a 500, so
 * it is logged and degrades to the same empty result a card with nothing
 * stored would give.
 *
 * They are optional on the provider too, so a test double need not implement
 * them.
 */
async function loadOptional<T>(
  what: string,
  printingId: string,
  load: () => Promise<T[]> | undefined,
): Promise<T[]> {
  try {
    return (await load()) ?? [];
  } catch (error) {
    logger.warn(`Failed to load ${what}`, {
      printingId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function toOracleRef(oracle: Oracle, siteOrigin: string | undefined): OracleRef {
  return {
    object: "oracle_ref",
    id: oracle.id,
    name: oracle.name,
    slug: oracle.slug,
    uri: `/api/v1/cards/${oracle.id}`,
    riftseer_uri: absoluteRiftseerUri(siteOrigin, oracle.slug),
    image_small: oracle.preferred_printing?.image?.small,
  };
}

/**
 * Assemble the card page payload for one oracle, viewed through one printing.
 *
 * `printing` is the printing the caller asked for; when they did not ask for
 * one it is the oracle's preferred printing. Marketplace links and rulings are
 * resolved against it, because both are printing-specific.
 */
export async function buildOracleDetail(
  oracle: Oracle,
  printing: Printing,
  provider: OracleDetailProvider,
  opts: BuildOracleDetailOptions = {},
): Promise<OracleDetail> {
  const { siteOrigin, prepare } = opts;

  const [printings, relationships, rulings, legalities] = await Promise.all([
    oracle.printings
      ? Promise.resolve(oracle.printings)
      : provider.getPrintingsForOracle(oracle.id),
    provider.getOracleRelationships(oracle.id),
    loadOptional<CardRuling>("rulings", printing.id, () =>
      provider.getRulings?.(printing.id),
    ),
    loadOptional<CardLegality>("legalities", printing.id, () =>
      provider.getLegalities?.(printing.id),
    ),
  ]);

  const prepared = prepare ? printings.map(prepare) : printings;
  const current = prepared.find((p) => p.id === printing.id) ?? printing;

  const purchase: CardPurchaseUris = {
    tcgplayer: tcgplayerUrlForPrinting(current, oracle.name),
    cardmarket: cardmarketUrlForPrinting(current, oracle.name),
  };

  const refs = (list: Oracle[]) => list.map((o) => toOracleRef(o, siteOrigin));

  return {
    object: "oracle_detail",
    oracle: {
      ...oracle,
      printings: prepared,
      relationships: {
        makes_tokens: refs(relationships.makes_tokens),
        used_by: refs(relationships.used_by),
        characters: refs(relationships.characters),
        signatures: refs(relationships.signatures),
      },
      riftseer_uri: absoluteRiftseerUri(siteOrigin, oracle.slug),
    },
    printing: current,
    printings: prepared,
    tokens: refs(relationships.makes_tokens),
    used_by: refs(relationships.used_by),
    characters: refs(relationships.characters),
    signatures: refs(relationships.signatures),
    purchase,
    rulings,
    legalities,
  };
}
