/**
 * How the deck list is drawn — text rows, an art grid, or Archidekt-style
 * overlapping stacks. Display only: grouping, ordering and counting stay in
 * `grouping.ts` whatever the view, so switching views never reorders a deck.
 */
export const DECK_LIST_VIEWS = ["list", "grid", "stack"] as const;
export type DeckListView = (typeof DECK_LIST_VIEWS)[number];

export const DECK_LIST_VIEW_LABELS: Record<DeckListView, string> = {
  list: "List",
  grid: "Grid",
  stack: "Stack",
};

export function parseDeckListView(raw: unknown): DeckListView | null {
  return typeof raw === "string" && (DECK_LIST_VIEWS as readonly string[]).includes(raw)
    ? (raw as DeckListView)
    : null;
}
