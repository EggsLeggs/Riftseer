import {
  absoluteRiftseerUri,
  normalizeCardName,
  oracleKeyForName,
  type Card,
  type CardDetail,
  type CardLegality,
  type CardPrintingSummary,
  type CardPurchaseUris,
  type CardRuling,
  type RelatedCard,
} from "@riftseer/types";
import { logger } from "./logger.ts";
import type { CardDataProvider } from "./provider.ts";

// ─── Marketplace links ─────────────────────────────────────────────────────────

const TCGPLAYER_PRODUCT_LINE = "riftbound-league-of-legends-trading-card-game";
/** `partner.` is where affiliate deep links live, so it must be allowed too. */
const TCGPLAYER_HOSTS = new Set([
  "www.tcgplayer.com",
  "tcgplayer.com",
  "partner.tcgplayer.com",
]);
const CARDMARKET_HOSTS = new Set(["www.cardmarket.com", "cardmarket.com"]);

function validateMarketplaceUrl(
  url: string | undefined,
  allowedHosts: Set<string>,
): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return allowedHosts.has(parsed.hostname.toLowerCase())
      ? parsed.toString()
      : null;
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
 * Best TCGPlayer link for a card: the stored purchase URI when it points at a
 * host we trust, then the direct product page, then a name search.
 */
export function tcgplayerUrlForCard(card: Card): string {
  const stored = validateMarketplaceUrl(
    card.purchase_uris?.tcgplayer,
    TCGPLAYER_HOSTS,
  );
  if (stored) return stored;
  const productId = card.external_ids?.tcgplayer_id;
  if (productId) return `https://www.tcgplayer.com/product/${productId}`;
  return tcgplayerSearchUrl(card.name);
}

/** Best Cardmarket link for a card, falling back to an exact-name search. */
export function cardmarketUrlForCard(card: Card): string {
  return (
    validateMarketplaceUrl(card.purchase_uris?.cardmarket, CARDMARKET_HOSTS) ??
    cardmarketSearchUrl(card.name)
  );
}

// ─── Printing summaries ────────────────────────────────────────────────────────

/** Collector number with its variant marker: `21★` for signature, `12a` for alt art. */
export function collectorLabel(card: Card): string | undefined {
  const base = card.collector_number;
  if (!base) return undefined;
  if (card.metadata?.signature) return `${base}★`;
  if (card.metadata?.alternate_art) return `${base}a`;
  return base;
}

/** Release timestamp used for printing order; unknown dates sort last. */
function releaseTime(card: Card): number {
  const raw = card.set?.published_on ?? card.released_at;
  if (!raw) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

/** Oldest set first, then collector number, then id so the order never wobbles. */
function comparePrintings(a: Card, b: Card): number {
  const releaseA = releaseTime(a);
  const releaseB = releaseTime(b);
  if (releaseA !== releaseB) return releaseA - releaseB;
  const byCollector = (a.collector_number ?? "").localeCompare(
    b.collector_number ?? "",
    undefined,
    { numeric: true },
  );
  if (byCollector !== 0) return byCollector;
  return a.id.localeCompare(b.id);
}

function toPrintingSummary(
  card: Card,
  siteOrigin: string | undefined,
  isCurrent = false,
): CardPrintingSummary {
  return {
    object: "card_printing",
    id: card.id,
    name: card.name,
    public_slug: card.public_slug,
    riftseer_uri:
      card.riftseer_uri ?? absoluteRiftseerUri(siteOrigin, card.public_slug),
    set_code: card.set?.set_code,
    set_name: card.set?.set_name,
    collector_number: card.collector_number,
    collector_label: collectorLabel(card),
    rarity: card.classification?.rarity,
    type: card.classification?.type,
    energy: card.attributes?.energy,
    power: card.attributes?.power,
    is_token: card.is_token,
    alternate_art: card.metadata?.alternate_art,
    signature: card.metadata?.signature,
    image_small: card.media?.media_urls?.small ?? card.media?.media_urls?.normal,
    prices: card.prices,
    purchase_uris: card.purchase_uris,
    ...(isCurrent ? { is_current: true } : {}),
  };
}

// ─── Champion / legend deduplication ───────────────────────────────────────────

/** "Ambessa, Matriarch of War (Signature)" → "Ambessa, Matriarch of War" */
function baseName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Ingest links champions and legends per printing, so the same character can
 * appear several times. Collapse each character to one row: prefer the printing
 * whose name has no parenthetical qualifier, then the plain art, then the
 * earliest printing.
 */
function dedupeByCharacter(
  cards: Card[],
  siteOrigin: string | undefined,
): CardPrintingSummary[] {
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    const key = normalizeCardName(baseName(card.name) || card.name);
    const group = groups.get(key);
    if (group) group.push(card);
    else groups.set(key, [card]);
  }

  const winners: Card[] = [];
  for (const [key, group] of groups) {
    const [winner] = [...group].sort(
      (a, b) =>
        rankWithinGroup(a, key) - rankWithinGroup(b, key) ||
        comparePrintings(a, b),
    );
    winners.push(winner);
  }

  return winners
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((card) => toPrintingSummary(card, siteOrigin));
}

function rankWithinGroup(card: Card, key: string): number {
  let rank = 0;
  if (normalizeCardName(card.name) !== key) rank += 2;
  if (card.metadata?.signature || card.metadata?.alternate_art) rank += 1;
  return rank;
}

// ─── Detail assembly ───────────────────────────────────────────────────────────

export interface BuildCardDetailOptions {
  /** Public site origin used to compute `riftseer_uri` on expanded printings. */
  siteOrigin?: string;
  /**
   * Applied to every expanded related card before it is summarised — the API
   * uses this to strip prices and rewrite affiliate links.
   */
  prepare?: (card: Card) => Card;
}

function relatedIds(stubs: RelatedCard[]): string[] {
  return stubs.map((stub) => stub.id).filter(Boolean);
}

/**
 * Rulings and legalities are keyed on the oracle group, so they need one lookup
 * each regardless of how many printings exist.
 *
 * Both are optional on the provider so a stub or a partial test double can be
 * passed without implementing them; when absent the payload carries empty
 * arrays, which the card page renders as "no rulings" and "legal everywhere" —
 * the same thing the real provider returns for a card with nothing stored.
 */
type CardDetailProvider = Pick<CardDataProvider, "getCardsByIds"> &
  Partial<Pick<CardDataProvider, "getCardLegalities" | "getCardRulings">>;

/**
 * Rulings and legalities are supplementary: the card page is fully useful
 * without them. A failure here — most likely the Phase 5 tables not yet existing
 * on this environment — must not turn the whole card response into a 500, so it
 * is logged and degrades to the same empty result as a card with nothing stored.
 */
async function loadOptional<T>(
  what: string,
  cardId: string,
  load: () => Promise<T[]> | undefined,
): Promise<T[]> {
  try {
    return (await load()) ?? [];
  } catch (error) {
    logger.warn(`Failed to load card ${what}`, {
      cardId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function loadOracleData(
  card: Card,
  provider: CardDetailProvider,
): Promise<{ rulings: CardRuling[]; legalities: CardLegality[] }> {
  const oracleKey = card.oracle_key ?? oracleKeyForName(card.name);
  const [rulings, legalities] = await Promise.all([
    loadOptional("rulings", card.id, () =>
      provider.getCardRulings?.(oracleKey, card.id),
    ),
    loadOptional("legalities", card.id, () =>
      provider.getCardLegalities?.(oracleKey, card.id),
    ),
  ]);
  return { rulings, legalities };
}

/**
 * Expands a card's related-card stubs into the aggregate payload behind the
 * public card page. Every stub across all five relationship arrays is resolved
 * in a single batched provider call.
 */
export async function buildCardDetail(
  card: Card,
  provider: CardDetailProvider,
  opts: BuildCardDetailOptions = {},
): Promise<CardDetail> {
  const { siteOrigin, prepare } = opts;

  const tokenStubs = card.all_parts.filter((p) => p.component === "token");
  const ids = [
    ...relatedIds(card.related_printings),
    ...relatedIds(tokenStubs),
    ...relatedIds(card.used_by),
    ...relatedIds(card.related_champions),
    ...relatedIds(card.related_legends),
    ...relatedIds(card.related_signatures),
  ];

  const [resolved, oracleData] = await Promise.all([
    ids.length > 0 ? provider.getCardsByIds(ids) : Promise.resolve([]),
    loadOracleData(card, provider),
  ]);
  const byId = new Map(
    resolved.map((c) => [c.id, prepare ? prepare(c) : c] as const),
  );
  /** Unresolvable ids (e.g. a card removed upstream) are dropped, not rendered blank. */
  const expand = (stubs: RelatedCard[]): Card[] =>
    stubs.flatMap((stub) => {
      const found = byId.get(stub.id);
      return found ? [found] : [];
    });

  const printings = [card, ...expand(card.related_printings)]
    .sort(comparePrintings)
    .map((printing) =>
      toPrintingSummary(printing, siteOrigin, printing.id === card.id),
    );

  const purchase: CardPurchaseUris = {
    tcgplayer: tcgplayerUrlForCard(card),
    cardmarket: cardmarketUrlForCard(card),
  };

  return {
    object: "card_detail",
    card,
    printings,
    tokens: expand(tokenStubs)
      .sort(comparePrintings)
      .map((token) => toPrintingSummary(token, siteOrigin)),
    // Ingest links every printing that creates the token; collapse to one
    // preferred printing per card (same rules as champions / legends).
    used_by: dedupeByCharacter(expand(card.used_by), siteOrigin),
    champions: dedupeByCharacter(expand(card.related_champions), siteOrigin),
    legends: dedupeByCharacter(expand(card.related_legends), siteOrigin),
    // Signatures are distinct cards; dedupeByCharacter collapses reprints of the
    // same signature to one preferred printing per name.
    signatures: dedupeByCharacter(expand(card.related_signatures), siteOrigin),
    purchase,
    rulings: oracleData.rulings,
    legalities: oracleData.legalities,
  };
}
