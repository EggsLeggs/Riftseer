import type { DeckSummary } from "./types";

/**
 * Filtering and paging a deck list in the browser.
 *
 * `GET /decks` answers with the whole list — a person's deck count is small and
 * the route has no paging parameters — so narrowing it is a client concern.
 * Pure, so the "does an editor's deck count as mine?" rules are testable
 * without rendering anything.
 */

export const DECK_LIST_OWNERSHIP = ["all", "mine", "shared"] as const;

export type DeckListOwnership = (typeof DECK_LIST_OWNERSHIP)[number];

export const DECK_LIST_OWNERSHIP_LABELS: Record<DeckListOwnership, string> = {
  all: "All decks",
  mine: "My decks",
  shared: "Shared with me",
};

export interface DeckListFilter {
  /** Matched against the deck name, case- and whitespace-insensitively. */
  query?: string;
  /** A format `code`, or undefined for every format. */
  format?: string;
  ownership?: DeckListOwnership;
  visibility?: string;
}

function matchesQuery(deck: DeckSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return deck.name.toLowerCase().includes(needle);
}

export function filterDeckSummaries(
  decks: readonly DeckSummary[],
  filter: DeckListFilter = {},
): DeckSummary[] {
  const ownership = filter.ownership ?? "all";
  return decks.filter((deck) => {
    if (!matchesQuery(deck, filter.query ?? "")) return false;
    if (filter.format && deck.format?.code !== filter.format) return false;
    if (filter.visibility && deck.visibility !== filter.visibility) return false;
    // Ownership is the deck's `role`, not a comparison of ids: the API already
    // decided who the caller is to this deck, and a null role is a deck that is
    // merely visible.
    if (ownership === "mine" && deck.role !== "owner") return false;
    if (ownership === "shared" && (deck.role === "owner" || deck.role === null)) {
      return false;
    }
    return true;
  });
}

/** The formats present in a list, for a filter select that offers no dead ends. */
export function deckListFormats(
  decks: readonly DeckSummary[],
): Array<{ code: string; name: string }> {
  const seen = new Map<string, string>();
  for (const deck of decks) {
    if (deck.format) seen.set(deck.format.code, deck.format.name);
  }
  return [...seen.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface DeckPage {
  items: DeckSummary[];
  page: number;
  totalPages: number;
}

/**
 * One page of a filtered list. `page` is clamped rather than trusted, so a
 * stale `?page=9` in a URL shows the last page instead of an empty screen.
 */
export function pageDeckSummaries(
  decks: readonly DeckSummary[],
  page: number,
  perPage: number,
): DeckPage {
  const totalPages = Math.max(1, Math.ceil(decks.length / perPage));
  const clamped = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (clamped - 1) * perPage;
  return {
    items: decks.slice(start, start + perPage),
    page: clamped,
    totalPages,
  };
}
