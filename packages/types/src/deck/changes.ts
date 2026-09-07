import type { DeckZone } from "../deck.ts";

/**
 * The queue that sits between a click and `PUT /decks/:id/cards`.
 *
 * Every edit is a `DeckCardChange`, and the route takes an array — the RPC
 * coalesces revisions inside a five-minute window, so pressing `+` four times
 * should cost one request carrying `quantity: 4`, not four requests that each
 * write a revision row. Everything here is pure so the batching rules can be
 * tested without a running API or a rendered component.
 *
 * A change is keyed by **zone and printing**, which is exactly the deck's own
 * row identity: the same printing in `main` and in `considering` is two rows,
 * and two arts of one card in `main` are two rows against one copy limit.
 */

/**
 * One edit to one row, as `PUT /decks/:id/cards` takes it. `quantity` is
 * absolute and `0` removes the row. `oracle_id` is optional on the wire because
 * the API can look it up from the printing; every producer in this package
 * supplies it.
 */
export interface DeckCardChange {
  zone: DeckZone;
  printing_id: string;
  oracle_id?: string | null;
  quantity: number;
  is_champion?: boolean;
}

/**
 * The fields the queue reads off a deck row. Structural so the wire row, a
 * guest row and a test fixture all fit, and the projection is generic over it
 * so a caller gets its own row type back.
 */
export interface DeckCardRow {
  zone: string;
  printing_id: string;
  oracle_id: string;
  quantity: number;
  is_champion?: boolean;
}

/** Row identity. Not exported as a type because it is only ever a Map key. */
export function deckRowKey(zone: string, printingId: string): string {
  return `${zone}\0${printingId}`;
}

/**
 * Add a change to the queue, replacing any earlier change to the same row.
 *
 * Replacement rather than accumulation: a change carries an **absolute**
 * quantity, so the newest one already describes the intended end state and
 * summing them would send `1 + 2 + 3` for three clicks of `+`.
 */
export function mergeDeckCardChange(
  queue: readonly DeckCardChange[],
  next: DeckCardChange,
): DeckCardChange[] {
  const key = deckRowKey(next.zone, next.printing_id);
  let replaced = false;
  const merged = queue.map((change) => {
    if (deckRowKey(change.zone, change.printing_id) !== key) return change;
    replaced = true;
    // `is_champion` is optional and independent of quantity: a `+` that omits
    // it must not clear a flag an earlier queued change set.
    return {
      ...change,
      ...next,
      is_champion: next.is_champion ?? change.is_champion,
    };
  });
  return replaced ? merged : [...merged, next];
}

/** Queue several changes at once — a zone move is a remove plus an add. */
export function mergeDeckCardChanges(
  queue: readonly DeckCardChange[],
  next: readonly DeckCardChange[],
): DeckCardChange[] {
  return next.reduce<DeckCardChange[]>(
    (acc, change) => mergeDeckCardChange(acc, change),
    [...queue],
  );
}

/**
 * Project queued changes onto the last list the API returned, so a click shows
 * before the debounced request lands.
 *
 * Only rows that already exist are projected. A change for a row the server has
 * never seen — an add, or the landing zone of a move — is left alone on
 * purpose: the deck payload is the only source of a card's name, type, domains
 * and cost, so a row invented here would render blank. Those edits are flushed
 * immediately instead, and the response supplies the real row.
 */
export function applyDeckCardChanges<T extends DeckCardRow>(
  cards: readonly T[],
  changes: readonly DeckCardChange[],
): T[] {
  if (changes.length === 0) return [...cards];

  const byKey = new Map<string, DeckCardChange>();
  for (const change of changes) {
    byKey.set(deckRowKey(change.zone, change.printing_id), change);
  }

  const result: T[] = [];
  for (const card of cards) {
    const change = byKey.get(deckRowKey(card.zone, card.printing_id));
    if (!change) {
      result.push(card);
      continue;
    }
    if (change.quantity === 0) continue;
    result.push({
      ...card,
      quantity: change.quantity,
      is_champion: change.is_champion ?? card.is_champion,
    });
  }
  return result;
}

/**
 * The two changes a zone move is: empty the old row, fill the new one.
 *
 * `cards` is the current list because a change carries an **absolute** quantity
 * and the destination may already hold that printing. Moving 2 from `main` onto
 * a `considering` row of 1 is 3 there, not 2 — sending the moved quantity alone
 * would overwrite the copy already sitting in the destination.
 */
export function deckMoveChanges(
  cards: readonly DeckCardRow[],
  card: DeckCardRow,
  toZone: DeckZone,
): DeckCardChange[] {
  const destination = cards.find(
    (row) => row.zone === toZone && row.printing_id === card.printing_id,
  );
  return [
    {
      zone: card.zone as DeckZone,
      printing_id: card.printing_id,
      oracle_id: card.oracle_id,
      quantity: 0,
    },
    {
      zone: toZone,
      printing_id: card.printing_id,
      oracle_id: card.oracle_id,
      quantity: (destination?.quantity ?? 0) + card.quantity,
      // Only `main` has champions; carrying the flag anywhere else would ask
      // the API to store a truth about a zone that has no such concept.
      is_champion: toZone === "main" ? card.is_champion || destination?.is_champion : false,
    },
  ];
}

/**
 * The two changes an art swap is: empty the row, refill it under the new
 * printing. Same zone, same oracle, same copies — a different piece of
 * cardboard.
 *
 * The removal comes first in the array because the champion flag rides along:
 * `deck_cards` allows one champion per deck, so the row carrying it must be
 * gone before another row claims it. When the target printing already has a
 * row in this zone the copies merge into it, exactly as a zone move merges.
 */
export function deckPrintingSwapChanges(
  cards: readonly DeckCardRow[],
  card: DeckCardRow,
  printing: { printing_id: string; oracle_id: string },
): DeckCardChange[] {
  if (printing.printing_id === card.printing_id) return [];
  const destination = cards.find(
    (row) => row.zone === card.zone && row.printing_id === printing.printing_id,
  );
  return [
    {
      zone: card.zone as DeckZone,
      printing_id: card.printing_id,
      oracle_id: card.oracle_id,
      quantity: 0,
    },
    {
      zone: card.zone as DeckZone,
      printing_id: printing.printing_id,
      oracle_id: printing.oracle_id,
      quantity: (destination?.quantity ?? 0) + card.quantity,
      // Only `main` has champions; see `deckMoveChanges`.
      is_champion: card.zone === "main" ? card.is_champion || destination?.is_champion : false,
    },
  ];
}
