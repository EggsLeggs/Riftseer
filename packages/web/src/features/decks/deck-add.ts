import { zoneForCard, type DeckZone } from "@riftseer/types/deck";
import type { DeckCard, DeckCardChange } from "./types";

/**
 * Turning "the user picked this card" into a `DeckCardChange`.
 *
 * Pure, and separate from the picker, because the interesting part is not the
 * dialog: it is which zone a card is allowed in and what a second `+` on a card
 * already in the deck means. A change carries an **absolute** quantity, so
 * adding a copy is "current + 1" and needs the existing rows to compute.
 *
 * Zone eligibility is `zoneForCard()` from `@riftseer/types/deck` — the same
 * function the importer uses — so a rune never lands in the main deck here and
 * in `runes` there.
 */

/**
 * The rules fields an add needs. Structural, so a search result fits.
 *
 * The display fields are optional because nothing here reads them: a signed-in
 * add is answered by the API with the real row, so the picker need not describe
 * the card. A **guest** add has no such answer coming — the row it inserts is
 * the only one there will ever be — so the picker passes through what it
 * already knows and `deckAddChange` ignores it.
 */
export interface AddableCard {
  oracle_id: string;
  printing_id: string;
  card_type: string | null | undefined;
  supertype?: string | null;
  is_token?: boolean | null;
  name?: string;
  domains?: string[];
  energy?: number | null;
  might?: number | null;
  power?: number | null;
  set_code?: string | null;
  collector_number?: string | null;
  rarity?: string | null;
  public_slug?: string | null;
}

/** Zones this card may sit in, most natural first. */
export function eligibleZones(card: AddableCard): DeckZone[] {
  return zoneForCard(card.card_type, card.supertype, card.is_token);
}

/**
 * The zone an add lands in: the requested one when the card may sit there, and
 * the card's natural zone otherwise. A legend dropped on the main deck is a
 * legend, not a main-deck card.
 */
export function resolveAddZone(
  card: AddableCard,
  requested?: DeckZone | null,
): DeckZone {
  const eligible = eligibleZones(card);
  return requested && eligible.includes(requested) ? requested : eligible[0]!;
}

/**
 * The change that adds `copies` of a card, folding into the row that already
 * holds that printing in that zone.
 *
 * Only the same **printing** folds in. Two arts of one card are two rows and
 * two `+` targets, which is what the deck model says and what the copy limit
 * counts across.
 */
export function deckAddChange(
  cards: readonly DeckCard[],
  card: AddableCard,
  options: { zone?: DeckZone | null; copies?: number } = {},
): DeckCardChange {
  const zone = resolveAddZone(card, options.zone);
  const copies = Math.max(1, Math.round(options.copies ?? 1));
  const existing = cards.find(
    (row) => row.zone === zone && row.printing_id === card.printing_id,
  );
  return {
    zone,
    printing_id: card.printing_id,
    oracle_id: card.oracle_id,
    quantity: (existing?.quantity ?? 0) + copies,
    // Preserve a champion flag the row already carries: adding a copy is not a
    // statement about whether the card is the deck's champion.
    ...(existing?.is_champion ? { is_champion: true } : {}),
  };
}
