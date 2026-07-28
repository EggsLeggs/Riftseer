/**
 * Response-time helpers that decorate Card payloads with absolute site URLs
 * (`riftseer_uri`) on the card itself and on all related-card stubs
 * (`all_parts`, `used_by`, `related_champions`, `related_legends`,
 * `related_signatures`, `related_printings`).  These fields are NEVER persisted
 * — they are computed fresh on each response from the configured site origin.
 */

import { absoluteRiftseerUri, normalizeSiteOrigin } from "@riftseer/types/slug";
import type { Card, RelatedCard } from "./types.ts";
import type { CardDataProvider } from "./provider.ts";

/** Fields on Card that hold related-card stub arrays. */
const RELATED_FIELDS = [
  "all_parts",
  "used_by",
  "related_champions",
  "related_legends",
  "related_signatures",
  "related_printings",
] as const satisfies ReadonlyArray<keyof Card>;

function collectRelatedIds(card: Card): string[] {
  const ids: string[] = [];
  for (const field of RELATED_FIELDS) {
    const stubs = card[field] as RelatedCard[] | undefined;
    if (!stubs?.length) continue;
    for (const stub of stubs) {
      if (stub.id) ids.push(stub.id);
    }
  }
  return ids;
}

function applySlugMap(
  card: Card,
  slugMap: Map<string, string>,
  siteOrigin: string,
): Card {
  const next: Card = { ...card };
  for (const field of RELATED_FIELDS) {
    const stubs = next[field] as RelatedCard[] | undefined;
    if (!stubs?.length) continue;
    next[field] = stubs.map((stub) => {
      const slug = slugMap.get(stub.id);
      const uri = absoluteRiftseerUri(siteOrigin, slug);
      return uri ? { ...stub, riftseer_uri: uri } : stub;
    });
  }
  return next;
}

/**
 * Add `riftseer_uri` to a card and to every related-card stub it contains.
 * `provider` is consulted in a single batch query to look up `public_slug`
 * for related IDs.  When `siteOrigin` is empty the card is returned untouched.
 */
export async function finalizeCard(
  card: Card,
  siteOrigin: string | undefined,
  provider: Pick<CardDataProvider, "getPublicSlugsByIds">,
): Promise<Card> {
  if (!siteOrigin) return card;
  const origin = normalizeSiteOrigin(siteOrigin);

  const selfUri = absoluteRiftseerUri(origin, card.public_slug);
  const cardWithSelf: Card = selfUri
    ? { ...card, riftseer_uri: selfUri }
    : card;

  const ids = collectRelatedIds(cardWithSelf);
  if (ids.length === 0) return cardWithSelf;

  const slugMap = await provider.getPublicSlugsByIds(ids);
  return applySlugMap(cardWithSelf, slugMap, origin);
}

/**
 * Batched form of {@link finalizeCard}: collects related IDs across many cards
 * and runs a single slug lookup before stitching results back together.
 */
export async function finalizeCards(
  cards: Card[],
  siteOrigin: string | undefined,
  provider: Pick<CardDataProvider, "getPublicSlugsByIds">,
): Promise<Card[]> {
  if (!siteOrigin || cards.length === 0) return cards;
  const origin = normalizeSiteOrigin(siteOrigin);

  const idSet = new Set<string>();
  for (const card of cards) {
    for (const id of collectRelatedIds(card)) idSet.add(id);
  }
  const allIds = [...idSet];

  const slugMap =
    allIds.length === 0
      ? new Map<string, string>()
      : await provider.getPublicSlugsByIds(allIds);

  return cards.map((card) => {
    const selfUri = absoluteRiftseerUri(origin, card.public_slug);
    const withSelf = selfUri ? { ...card, riftseer_uri: selfUri } : card;
    return applySlugMap(withSelf, slugMap, origin);
  });
}

/**
 * Apply pre-fetched slug data to a card without doing further lookups.
 * Useful when a caller already has the slug map in hand.
 */
export function enrichRelatedCardsSiteUris(
  card: Card,
  siteOrigin: string | undefined,
  slugMap: Map<string, string>,
): Card {
  if (!siteOrigin) return card;
  const origin = normalizeSiteOrigin(siteOrigin);
  const selfUri = absoluteRiftseerUri(origin, card.public_slug);
  const withSelf = selfUri ? { ...card, riftseer_uri: selfUri } : card;
  return applySlugMap(withSelf, slugMap, origin);
}
