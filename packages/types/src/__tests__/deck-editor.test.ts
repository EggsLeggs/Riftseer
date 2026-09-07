import { describe, expect, test } from "bun:test";
import type { DeckCardRow } from "../deck/changes.ts";
import {
  deckEditorCards,
  deckEditorReducer,
  initialDeckEditorState,
  type DeckEditorAction,
  type DeckEditorState,
} from "../deck/editor.ts";

interface Snapshot {
  cards: DeckCardRow[];
  violations: string[];
}

type State = DeckEditorState<Snapshot>;
type Action = DeckEditorAction<Snapshot>;

function row(overrides: Partial<DeckCardRow> = {}): DeckCardRow {
  return { zone: "main", printing_id: "p1", oracle_id: "o1", quantity: 1, ...overrides };
}

function start(cards: DeckCardRow[] = [row()]): State {
  return initialDeckEditorState({ cards, violations: [] });
}

function run(state: State, ...actions: Action[]): State {
  return actions.reduce(deckEditorReducer, state);
}

const unit = { oracle_id: "o9", printing_id: "p9", card_type: "Unit" };

describe("quantity steps", () => {
  test("queue without sending, and the projection shows them at once", () => {
    const state = run(start(), { type: "set_quantity", card: row(), quantity: 3 });
    expect(state.inFlight).toBeNull();
    expect(state.queue).toHaveLength(1);
    expect(deckEditorCards(state)[0]?.quantity).toBe(3);
  });

  test("a removal is sent immediately", () => {
    const state = run(start(), { type: "set_quantity", card: row(), quantity: 0 });
    expect(state.inFlight).toBe(state.queue);
    expect(deckEditorCards(state)).toEqual([]);
  });

  test("the champion flag is a debounced edit too", () => {
    const state = run(start(), { type: "set_champion", card: row(), isChampion: true });
    expect(state.inFlight).toBeNull();
    expect(deckEditorCards(state)[0]?.is_champion).toBe(true);
  });

  test("flush sends the queue; a second flush mid-flight is a no-op", () => {
    const queued = run(start(), { type: "set_quantity", card: row(), quantity: 2 });
    const sent = run(queued, { type: "flush" });
    expect(sent.inFlight).toBe(queued.queue);
    expect(run(sent, { type: "flush" })).toBe(sent);
    expect(run(start(), { type: "flush" }).inFlight).toBeNull();
  });
});

describe("structural edits", () => {
  test("an add is sent at once", () => {
    const state = run(start(), { type: "add_card", card: unit, zone: "main", copies: 2 });
    expect(state.inFlight).toEqual([
      { zone: "main", printing_id: "p9", oracle_id: "o9", quantity: 2 },
    ]);
  });

  test("a move and an art swap are sent at once; moving to the same zone is nothing", () => {
    const idle = start();
    const moved = run(idle, { type: "move_zone", card: row(), zone: "sideboard" });
    expect(moved.inFlight).toHaveLength(2);
    expect(run(idle, { type: "move_zone", card: row(), zone: "main" })).toBe(idle);

    const swapped = run(start(), { type: "change_printing", card: row(), printing: unit });
    expect(swapped.inFlight?.map((change) => change.printing_id)).toEqual(["p1", "p9"]);
  });

  test("a structural edit mid-flight waits, then follows the answer", () => {
    const sent = run(start(), { type: "set_quantity", card: row(), quantity: 0 });
    const waiting = run(sent, { type: "add_card", card: unit });
    expect(waiting.inFlight).toBe(sent.inFlight);
    expect(waiting.queue).toHaveLength(2);

    const settled = run(waiting, {
      type: "flush_succeeded",
      snapshot: { cards: [], violations: [] },
    });
    expect(settled.snapshot.cards).toEqual([]);
    expect(settled.queue).toHaveLength(1);
    expect(settled.inFlight).toBe(settled.queue);
  });
});

describe("answers", () => {
  test("a change replaced while its batch is out survives the drop", () => {
    const sent = run(
      start(),
      { type: "set_quantity", card: row(), quantity: 2 },
      { type: "flush" },
    );
    const bumped = run(sent, { type: "set_quantity", card: row(), quantity: 3 });
    const settled = run(bumped, {
      type: "flush_succeeded",
      snapshot: { cards: [row({ quantity: 2 })], violations: [] },
    });
    expect(settled.queue.map((change) => change.quantity)).toEqual([3]);
    expect(settled.inFlight).toBe(settled.queue);
    expect(deckEditorCards(settled)[0]?.quantity).toBe(3);
  });

  test("a failed batch is dropped, which puts the server's list back", () => {
    const sent = run(start(), { type: "set_quantity", card: row(), quantity: 0 });
    const settled = run(sent, { type: "flush_failed" });
    expect(settled.queue).toEqual([]);
    expect(settled.inFlight).toBeNull();
    expect(deckEditorCards(settled)).toEqual([row()]);
  });

  test("an answer with nothing out is ignored", () => {
    const idle = start();
    expect(run(idle, { type: "flush_failed" })).toBe(idle);
  });
});

describe("reset", () => {
  const fresh = { cards: [row({ quantity: 4 })], violations: ["renamed"] };

  test("replaces the snapshot while idle", () => {
    expect(run(start(), { type: "reset", snapshot: fresh }).snapshot).toBe(fresh);
  });

  test("is refused while an edit is queued or out", () => {
    const queued = run(start(), { type: "set_quantity", card: row(), quantity: 2 });
    expect(run(queued, { type: "reset", snapshot: fresh })).toBe(queued);
    const sent = run(queued, { type: "flush" });
    expect(run(sent, { type: "reset", snapshot: fresh })).toBe(sent);
  });
});
