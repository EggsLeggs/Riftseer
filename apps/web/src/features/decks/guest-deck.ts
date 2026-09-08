import {
  GUEST_DECK_STORAGE_KEY,
  parseGuestDeck,
  serializeGuestDeck,
  type GuestDeck,
} from "@riftseer/types/deck/guest-deck";

/**
 * The browser half of the guest deck: `window.localStorage` behind the pure
 * shape in `@riftseer/types/deck/guest-deck`.
 *
 * The only impure guest-deck code. Each function swallows its failure:
 * localStorage throws on a full quota and on a browser configured to deny it,
 * and neither is a reason for the builder to stop working — an unsaved deck
 * that does not survive a refresh is worse than one that does, and better than
 * a crash.
 */

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readGuestDeck(): GuestDeck | null {
  const store = storage();
  if (!store) return null;
  try {
    return parseGuestDeck(store.getItem(GUEST_DECK_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Persist, returning whether it landed so a caller can warn before navigating. */
export function writeGuestDeck(deck: GuestDeck): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(GUEST_DECK_STORAGE_KEY, serializeGuestDeck(deck));
    return true;
  } catch {
    return false;
  }
}

export function clearGuestDeck(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(GUEST_DECK_STORAGE_KEY);
  } catch {
    // Nothing to do: the blob is stale rather than dangerous.
  }
}
