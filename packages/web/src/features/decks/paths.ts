import { slugifyCardName } from "@riftseer/types/slug";

/**
 * Same-origin deck URLs. Components ask for a path here rather than assembling
 * one, so the day the route changes there is a single place to change.
 *
 * The canonical deck route is `/deck/<id>/<slug-tail>`. Unlike a card's
 * `public_slug`, the tail is **cosmetic and derived from the current name**:
 * the id alone resolves the deck, so renaming a deck never breaks a link that
 * was copied before the rename, and no slug has to be pinned or reserved.
 */

/** Cap on the derived tail. Long enough to read, short enough not to wrap. */
const SLUG_TAIL_MAX = 60;

export interface DeckLike {
  id: string;
  name?: string | null;
}

/**
 * The cosmetic segment for a deck name, or `null` when the name slugifies to
 * nothing (emoji-only names are real). `null` means "no tail", not "empty
 * segment" — `/deck/<id>/` would be a different, uglier URL.
 */
export function deckSlugTail(name: string | null | undefined): string | null {
  if (!name) return null;
  const slug = slugifyCardName(name).slice(0, SLUG_TAIL_MAX).replace(/-+$/, "");
  return slug || null;
}

/** Canonical path for a deck. */
export function deckHref(deck: DeckLike): string {
  const tail = deckSlugTail(deck.name);
  const base = `/deck/${encodeURIComponent(deck.id)}`;
  return tail ? `${base}/${tail}` : base;
}

/** The builder, which is the deck page in an editing state. */
export function deckBuilderHref(deck: DeckLike): string {
  return `${deckHref(deck)}?edit=1`;
}

/** A deck's revision history. */
export function deckRevisionsHref(deck: DeckLike): string {
  return `${deckHref(deck)}?view=revisions`;
}

/** Where an invite link points. Redeeming it is a POST from that page. */
export function deckJoinHref(inviteCode: string): string {
  return `/deck/join/${encodeURIComponent(inviteCode)}`;
}

/** Someone's public decks: the decks tab of their profile. */
export function userDecksHref(handle: string): string {
  return `/u/${encodeURIComponent(handle)}?tab=decks`;
}

/** The signed-in user's own deck list. */
export function myDecksHref(): string {
  return "/decks";
}

/**
 * The builder for a new deck. Signed in that is the create form; signed out it
 * is the guest builder, which is the same route on purpose — "sign in to save"
 * has to come back to somewhere, and coming back to a different URL is how a
 * user loses the deck they just spent an hour on.
 *
 * `save` marks the return leg: the page finds the stored guest deck and offers
 * to turn it into a real one. It carries no deck data — the deck is in
 * localStorage, never in the URL.
 */
export function newDeckHref(options: { save?: boolean } = {}): string {
  return options.save ? "/decks/new?save=1" : "/decks/new";
}

/** Sign in, then land back on the builder ready to save the local deck. */
export function signInToSaveDeckHref(): string {
  return `/auth/login?next=${encodeURIComponent(newDeckHref({ save: true }))}`;
}

export function importDeckHref(): string {
  return "/decks/import";
}
