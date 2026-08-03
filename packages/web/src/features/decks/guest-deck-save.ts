"use client";

import { applyDeckCardChangesAction, createDeckAction } from "./actions";
import {
  clearGuestDeck,
  guestDeckCreateInput,
  guestDeckToChanges,
  type GuestDeck,
} from "./guest-deck";

/**
 * Turning a deck built signed-out into a real, owned one.
 *
 * Two calls, in the order the API requires: create the deck, then apply its
 * cards as one batch — the same `PUT /decks/:id/cards` the builder uses, so the
 * whole list lands in one transaction and one revision rather than a request
 * per card and a history that reads like a keystroke log.
 *
 * **The local deck is cleared only on a complete success.** The half-failure is
 * real and has to be survivable: a deck row can be created and its cards then
 * rejected, and a user who watched their list vanish into a deck that does not
 * contain it has lost work Riftseer promised to keep. So the blob stays put
 * until the cards are confirmed, and `deckId` is reported either way.
 *
 * That reported id is what makes the retry safe, and it has to be passed back
 * in. Only the cards call is naturally idempotent — absolute quantities mean
 * re-applying the same batch converges. `createDeckAction` is not: retrying
 * from the top mints a second deck and strands the first, so a user clicking
 * "Try again" three times would own three decks and populate one. Given an
 * `existingDeckId`, the create step is skipped and the retry resumes at the
 * step that actually failed.
 */
export type GuestDeckSaveOutcome =
  | { ok: true; deckId: string; name: string }
  | {
      ok: false;
      error: string;
      /** Set when the deck was created and only the cards failed. */
      deckId?: string;
      name?: string;
    };

export async function saveGuestDeck(
  deck: GuestDeck,
  /** A deck already created by a previous attempt whose cards failed. */
  existingDeckId?: string,
): Promise<GuestDeckSaveOutcome> {
  let deckId = existingDeckId;
  let name = deck.name;

  if (!deckId) {
    const created = await createDeckAction(guestDeckCreateInput(deck));
    if (!created.ok) return { ok: false, error: created.error };
    deckId = created.data.id;
    name = created.data.name;
  }

  const changes = guestDeckToChanges(deck);
  if (changes.length > 0) {
    const applied = await applyDeckCardChangesAction(deckId, changes);
    if (!applied.ok) return { ok: false, error: applied.error, deckId, name };
  }

  clearGuestDeck();
  return { ok: true, deckId, name };
}
