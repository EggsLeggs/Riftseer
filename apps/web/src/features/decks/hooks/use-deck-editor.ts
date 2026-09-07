"use client";

import * as React from "react";
import { toast } from "sonner";
import type { AddableCard } from "@riftseer/types/deck/add";
import {
  deckEditorCards,
  deckEditorReducer,
  initialDeckEditorState,
  type DeckEditorAction,
  type DeckEditorState,
} from "@riftseer/types/deck/editor";

import { applyDeckCardChangesAction } from "../actions";
import type { DeckCard, DeckToken, DeckViolation, DeckZone } from "../types";

/**
 * The builder's write path: a queue, a debounce and one request.
 *
 * What is queued, what is sent and what the list shows meanwhile is the
 * reducer in `@riftseer/types/deck/editor`. This hook adds the two things a
 * reducer cannot own: the 700ms debounce on quantity steps, and the request
 * for whatever the reducer marks `inFlight`. Structural edits (an add, a move,
 * a removal, an art swap) skip the debounce because the projection cannot
 * show a row the server has never described.
 */

const DEBOUNCE_MS = 700;

export interface DeckEditorSnapshot {
  cards: DeckCard[];
  tokens: DeckToken[];
  violations: DeckViolation[];
}

export interface DeckEditor extends DeckEditorSnapshot {
  /** True while a batch is in flight or waiting for the debounce to elapse. */
  saving: boolean;
  dirty: boolean;
  setQuantity: (
    card: Pick<DeckCard, "zone" | "printing_id" | "oracle_id" | "is_champion">,
    quantity: number,
  ) => void;
  addCard: (card: AddableCard, options?: { zone?: DeckZone | null; copies?: number }) => void;
  moveZone: (
    card: Pick<DeckCard, "zone" | "printing_id" | "oracle_id" | "quantity" | "is_champion">,
    zone: DeckZone,
  ) => void;
  setChampion: (
    card: Pick<DeckCard, "zone" | "printing_id" | "oracle_id" | "quantity">,
    isChampion: boolean,
  ) => void;
  /** Swap a row onto another printing of the same card, copies and flag intact. */
  changePrinting: (
    card: Pick<DeckCard, "zone" | "printing_id" | "oracle_id" | "quantity" | "is_champion">,
    printing: AddableCard,
  ) => void;
  /** Send whatever is queued now, e.g. before navigating away. */
  flush: () => void;
}

type State = DeckEditorState<DeckEditorSnapshot>;
type Action = DeckEditorAction<DeckEditorSnapshot>;

const reducer: React.Reducer<State, Action> = deckEditorReducer;

function sameSnapshot(a: DeckEditorSnapshot, b: DeckEditorSnapshot): boolean {
  return a.cards === b.cards && a.tokens === b.tokens && a.violations === b.violations;
}

export function useDeckEditor(
  deckId: string,
  initial: DeckEditorSnapshot,
  enabled: boolean,
): DeckEditor {
  const [state, dispatch] = React.useReducer(reducer, initial, initialDeckEditorState);

  // A fresh server render (a rename, a revalidation) replaces the snapshot.
  // The reducer refuses it while an edit is pending; this only notices that
  // the parent handed over a new one, during render, so the old snapshot is
  // never committed first.
  const [seen, setSeen] = React.useState(initial);
  if (!sameSnapshot(initial, seen)) {
    setSeen(initial);
    dispatch({ type: "reset", snapshot: initial });
  }

  const { queue, inFlight } = state;

  // The debounce. Every quantity step re-arms it, so four presses of `+` cost
  // one request. Nothing is armed while a batch is out: the reducer sends the
  // remainder itself when the answer lands.
  React.useEffect(() => {
    if (inFlight !== null || queue.length === 0) return;
    const timer = setTimeout(() => dispatch({ type: "flush" }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [queue, inFlight]);

  // The request, one per batch the reducer puts on the wire.
  React.useEffect(() => {
    if (inFlight === null) return;
    void applyDeckCardChangesAction(deckId, [...inFlight]).then((result) => {
      if (result.ok) {
        dispatch({
          type: "flush_succeeded",
          snapshot: {
            cards: result.data.cards,
            tokens: result.data.tokens,
            violations: result.data.violations,
          },
        });
        return;
      }
      // Dropping the failed batch is the revert: the projection is computed
      // from the queue, so removing it puts the last server answer back on
      // screen rather than leaving a change that never landed.
      toast.error(result.error);
      dispatch({ type: "flush_failed" });
    });
  }, [deckId, inFlight]);

  // Best effort on the way out: a client-side navigation unmounts the builder
  // while the debounce is still pending, and the request outlives the render.
  const queueRef = React.useRef(queue);
  React.useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  React.useEffect(() => {
    return () => {
      if (queueRef.current.length > 0) {
        // The action resolves `{ ok: false }` for an API error but still
        // *rejects* on a transport failure, and there is no component left to
        // report it to — unhandled, it surfaces as a page-level error.
        void applyDeckCardChangesAction(deckId, [...queueRef.current]).catch(() => undefined);
      }
    };
  }, [deckId]);

  // A full page unload has no such second chance, so warn instead.
  const dirty = queue.length > 0;
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const cards = React.useMemo(() => deckEditorCards(state), [state]);

  const edit = React.useCallback(
    (action: Action) => {
      if (enabled) dispatch(action);
    },
    [enabled],
  );

  const setQuantity = React.useCallback<DeckEditor["setQuantity"]>(
    (card, quantity) => edit({ type: "set_quantity", card, quantity }),
    [edit],
  );
  const addCard = React.useCallback<DeckEditor["addCard"]>(
    (card, options) => edit({ type: "add_card", card, ...options }),
    [edit],
  );
  const moveZone = React.useCallback<DeckEditor["moveZone"]>(
    (card, zone) => edit({ type: "move_zone", card, zone }),
    [edit],
  );
  const setChampion = React.useCallback<DeckEditor["setChampion"]>(
    (card, isChampion) => edit({ type: "set_champion", card, isChampion }),
    [edit],
  );
  const changePrinting = React.useCallback<DeckEditor["changePrinting"]>(
    (card, printing) => edit({ type: "change_printing", card, printing }),
    [edit],
  );
  const flush = React.useCallback(() => dispatch({ type: "flush" }), []);

  return {
    cards,
    tokens: state.snapshot.tokens,
    violations: state.snapshot.violations,
    saving: dirty,
    dirty,
    setQuantity,
    addCard,
    moveZone,
    setChampion,
    changePrinting,
    flush,
  };
}
