import type { DeckZone } from "../deck.ts";
import { deckAddChange, type AddableCard } from "./add.ts";
import {
  applyDeckCardChanges,
  deckMoveChanges,
  deckPrintingSwapChanges,
  mergeDeckCardChanges,
  type DeckCardChange,
  type DeckCardRow,
} from "./changes.ts";

/**
 * The builder's write path as a state machine: the last answer the server
 * gave, a queue of edits on top of it, and the one batch on the wire.
 *
 * `PUT /decks/:id/cards` takes an array and the RPC coalesces revisions inside
 * a five-minute window, so four presses of `+` must cost one request carrying
 * `quantity: 4`, not four requests that each write a revision row. A quantity
 * step is therefore only queued, and the caller flushes it after a debounce.
 * A structural edit (an add, a move, a removal, an art swap) is sent at once,
 * because `applyDeckCardChanges` cannot project a row the server has never
 * described, and the answer supplies the real row.
 *
 * Time and the network are the caller's: a hook debounces `flush`, runs the
 * request for `inFlight`, and reports the answer back as `flush_succeeded` or
 * `flush_failed`. What is sent, when a second batch follows the first, and
 * what the list looks like meanwhile are all decided here, so they can be
 * tested without a timer, a request or a rendered component.
 */

/** The last server answer. A caller extends it with tokens and violations. */
export interface DeckEditorSnapshot {
  cards: readonly DeckCardRow[];
}

export interface DeckEditorState<TSnapshot extends DeckEditorSnapshot> {
  snapshot: TSnapshot;
  /** Every change not yet confirmed, the batch on the wire included. */
  queue: readonly DeckCardChange[];
  /**
   * The batch being sent, or `null` while idle. Its members are the queue's
   * own objects, so a change replaced while the batch is out is a new object
   * that survives the drop and goes with the next batch.
   */
  inFlight: readonly DeckCardChange[] | null;
}

export type DeckEditorAction<TSnapshot extends DeckEditorSnapshot> =
  /** A fresh server render. Taken only while nothing is pending. */
  | { type: "reset"; snapshot: TSnapshot }
  | {
      type: "set_quantity";
      card: Pick<DeckCardRow, "zone" | "printing_id" | "oracle_id" | "is_champion">;
      quantity: number;
    }
  | { type: "add_card"; card: AddableCard; zone?: DeckZone | null; copies?: number }
  | { type: "move_zone"; card: DeckCardRow; zone: DeckZone }
  | {
      type: "set_champion";
      card: Pick<DeckCardRow, "zone" | "printing_id" | "oracle_id" | "quantity">;
      isChampion: boolean;
    }
  /** Swap a row onto another printing of the same card, copies and flag intact. */
  | { type: "change_printing"; card: DeckCardRow; printing: AddableCard }
  /** Send whatever is queued now. A no-op while a batch is already out. */
  | { type: "flush" }
  | { type: "flush_succeeded"; snapshot: TSnapshot }
  /** The batch is dropped, which puts the last server answer back on screen. */
  | { type: "flush_failed" };

export function initialDeckEditorState<TSnapshot extends DeckEditorSnapshot>(
  snapshot: TSnapshot,
): DeckEditorState<TSnapshot> {
  return { snapshot, queue: [], inFlight: null };
}

/** The list as the user sees it: the last answer with the queue projected on. */
export function deckEditorCards<TSnapshot extends DeckEditorSnapshot>(
  state: DeckEditorState<TSnapshot>,
): TSnapshot["cards"][number][] {
  return applyDeckCardChanges(state.snapshot.cards, state.queue);
}

/**
 * Queue changes, and send them at once when they are structural and nothing
 * is on the wire. A structural edit arriving mid-flight waits for the answer,
 * then goes with whatever else queued in the meantime.
 */
function enqueue<TSnapshot extends DeckEditorSnapshot>(
  state: DeckEditorState<TSnapshot>,
  changes: readonly DeckCardChange[],
  immediate: boolean,
): DeckEditorState<TSnapshot> {
  if (changes.length === 0) return state;
  const queue = mergeDeckCardChanges(state.queue, changes);
  return {
    ...state,
    queue,
    inFlight: immediate && state.inFlight === null ? queue : state.inFlight,
  };
}

/**
 * The batch is off the wire. Whatever queued while it was out goes straight
 * after it, without waiting for another debounce.
 */
function settle<TSnapshot extends DeckEditorSnapshot>(
  state: DeckEditorState<TSnapshot>,
  snapshot: TSnapshot | null,
): DeckEditorState<TSnapshot> {
  if (state.inFlight === null) return state;
  const sent = new Set(state.inFlight);
  const remaining = state.queue.filter((change) => !sent.has(change));
  return {
    snapshot: snapshot ?? state.snapshot,
    queue: remaining,
    inFlight: remaining.length > 0 ? remaining : null,
  };
}

export function deckEditorReducer<TSnapshot extends DeckEditorSnapshot>(
  state: DeckEditorState<TSnapshot>,
  action: DeckEditorAction<TSnapshot>,
): DeckEditorState<TSnapshot> {
  switch (action.type) {
    case "reset":
      // Overwriting mid-edit would drop the copies the user just added and
      // then re-add them on the next flush.
      if (state.queue.length > 0 || state.inFlight !== null) return state;
      return { ...state, snapshot: action.snapshot };
    case "set_quantity":
      return enqueue(
        state,
        [
          {
            zone: action.card.zone as DeckZone,
            printing_id: action.card.printing_id,
            oracle_id: action.card.oracle_id,
            quantity: action.quantity,
            is_champion: action.card.is_champion,
          },
        ],
        // A removal takes the row off screen, and the projection only reaches
        // rows the server already knows; sending it now keeps the two in step.
        action.quantity === 0,
      );
    case "add_card":
      return enqueue(
        state,
        [
          deckAddChange(deckEditorCards(state), action.card, {
            zone: action.zone,
            copies: action.copies,
          }),
        ],
        true,
      );
    case "move_zone":
      if (action.card.zone === action.zone) return state;
      return enqueue(
        state,
        deckMoveChanges(deckEditorCards(state), action.card, action.zone),
        true,
      );
    case "set_champion":
      return enqueue(
        state,
        [
          {
            zone: action.card.zone as DeckZone,
            printing_id: action.card.printing_id,
            oracle_id: action.card.oracle_id,
            quantity: action.card.quantity,
            is_champion: action.isChampion,
          },
        ],
        false,
      );
    case "change_printing":
      return enqueue(
        state,
        deckPrintingSwapChanges(deckEditorCards(state), action.card, action.printing),
        true,
      );
    case "flush":
      if (state.inFlight !== null || state.queue.length === 0) return state;
      return { ...state, inFlight: state.queue };
    case "flush_succeeded":
      return settle(state, action.snapshot);
    case "flush_failed":
      return settle(state, null);
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}
