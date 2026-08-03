"use client";

import * as React from "react";
import { toast } from "sonner";

import { applyDeckCardChangesAction } from "../actions";
import { deckAddChange, type AddableCard } from "../deck-add";
import {
  applyDeckCardChanges,
  deckMoveChanges,
  mergeDeckCardChanges,
} from "../deck-changes";
import type {
  DeckCard,
  DeckCardChange,
  DeckToken,
  DeckViolation,
  DeckZone,
} from "../types";

/**
 * The builder's write path: a queue, a debounce and one request.
 *
 * `PUT /decks/:id/cards` takes an array and the RPC coalesces revisions inside
 * a five-minute window, so four presses of `+` must cost one request carrying
 * `quantity: 4` — not four requests that each write a revision row. Quantity
 * steps are therefore debounced; a structural edit (adding a card, moving a
 * zone) flushes at once, because `applyDeckCardChanges` cannot project a row
 * the server has never described.
 *
 * The queue itself, the merge rules and the optimistic projection are pure and
 * live in `deck-changes.ts`. This hook is only the timing and the request.
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
  /** Send whatever is queued now, e.g. before navigating away. */
  flush: () => void;
}

export function useDeckEditor(
  deckId: string,
  initial: DeckEditorSnapshot,
  enabled: boolean,
): DeckEditor {
  const [snapshot, setSnapshot] = React.useState<DeckEditorSnapshot>(initial);
  const [queue, setQueue] = React.useState<DeckCardChange[]>([]);
  const [saving, setSaving] = React.useState(false);

  const queueRef = React.useRef<DeckCardChange[]>([]);
  const inFlightRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const writeQueue = React.useCallback((next: DeckCardChange[]) => {
    queueRef.current = next;
    setQueue(next);
  }, []);

  // A fresh server render (a rename, a revalidation) replaces the snapshot, but
  // only while nothing is pending: overwriting mid-edit would drop the copies
  // the user just added and then re-add them on the next flush.
  React.useEffect(() => {
    if (queueRef.current.length > 0 || inFlightRef.current) return;
    setSnapshot({
      cards: initial.cards,
      tokens: initial.tokens,
      violations: initial.violations,
    });
  }, [initial.cards, initial.tokens, initial.violations]);

  const flush = React.useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inFlightRef.current) return;

    const sent = queueRef.current;
    if (sent.length === 0) return;

    // Identity, not row key: a change queued while this batch was in flight is
    // a new object from `mergeDeckCardChanges` and must survive the drop.
    const sentSet = new Set(sent);
    const drop = () => {
      const remaining = queueRef.current.filter((change) => !sentSet.has(change));
      queueRef.current = remaining;
      setQueue(remaining);
      return remaining;
    };

    inFlightRef.current = true;
    setSaving(true);
    const result = await applyDeckCardChangesAction(deckId, sent);
    inFlightRef.current = false;

    const remaining = drop();
    if (result.ok) {
      setSnapshot({
        cards: result.data.cards,
        tokens: result.data.tokens,
        violations: result.data.violations,
      });
    } else {
      // Dropping the failed batch is the revert: the projection is computed
      // from the queue, so removing it puts the last server answer back on
      // screen rather than leaving a change that never landed.
      toast.error(result.error);
    }
    setSaving(remaining.length > 0);
    if (remaining.length > 0) void flushRef.current();
  }, [deckId]);

  const flushRef = React.useRef(flush);
  React.useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const enqueue = React.useCallback(
    (changes: DeckCardChange[], immediate: boolean) => {
      if (!enabled || changes.length === 0) return;
      writeQueue(mergeDeckCardChanges(queueRef.current, changes));
      setSaving(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (immediate) {
        void flushRef.current();
        return;
      }
      timerRef.current = setTimeout(() => void flushRef.current(), DEBOUNCE_MS);
    },
    [enabled, writeQueue],
  );

  // Best effort on the way out: a client-side navigation unmounts the builder
  // while the debounce is still pending, and the request outlives the render.
  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (queueRef.current.length > 0) {
        void applyDeckCardChangesAction(deckId, queueRef.current);
        queueRef.current = [];
      }
    };
  }, [deckId]);

  // A full page unload has no such second chance, so warn instead.
  React.useEffect(() => {
    if (queue.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [queue.length]);

  const cards = React.useMemo(
    () => applyDeckCardChanges(snapshot.cards, queue),
    [snapshot.cards, queue],
  );

  const setQuantity = React.useCallback<DeckEditor["setQuantity"]>(
    (card, quantity) => {
      enqueue(
        [
          {
            zone: card.zone as DeckZone,
            printing_id: card.printing_id,
            oracle_id: card.oracle_id,
            quantity,
            is_champion: card.is_champion,
          },
        ],
        // A removal takes the row off screen, and the projection only reaches
        // rows the server already knows; sending it now keeps the two in step.
        quantity === 0,
      );
    },
    [enqueue],
  );

  const addCard = React.useCallback<DeckEditor["addCard"]>(
    (card, options) => {
      enqueue([deckAddChange(cards, card, options)], true);
    },
    [cards, enqueue],
  );

  const moveZone = React.useCallback<DeckEditor["moveZone"]>(
    (card, zone) => {
      if (card.zone === zone) return;
      enqueue(deckMoveChanges(card, zone), true);
    },
    [enqueue],
  );

  const setChampion = React.useCallback<DeckEditor["setChampion"]>(
    (card, isChampion) => {
      enqueue(
        [
          {
            zone: card.zone as DeckZone,
            printing_id: card.printing_id,
            oracle_id: card.oracle_id,
            quantity: card.quantity,
            is_champion: isChampion,
          },
        ],
        false,
      );
    },
    [enqueue],
  );

  return {
    cards,
    tokens: snapshot.tokens,
    violations: snapshot.violations,
    saving,
    dirty: queue.length > 0,
    setQuantity,
    addCard,
    moveZone,
    setChampion,
    flush: () => void flushRef.current(),
  };
}
