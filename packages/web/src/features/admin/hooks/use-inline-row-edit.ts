"use client";

import * as React from "react";

/**
 * The "one row at a time is open for editing" state the sets and formats tables
 * both run on: which row, its working draft, and how to open and close it.
 *
 * Only the state machine is shared. Saving stays with each view because the two
 * build genuinely different merge-patches against different validation — the
 * part worth sharing is the part that was identical, not the part that merely
 * rhymes.
 */
export function useInlineRowEdit<TRow, TDraft>(
  draftFrom: (row: TRow) => TDraft,
  keyOf: (row: TRow) => string,
) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<TDraft | null>(null);

  const startEdit = React.useCallback(
    (row: TRow) => {
      setEditing(keyOf(row));
      setDraft(draftFrom(row));
    },
    [draftFrom, keyOf],
  );

  const cancelEdit = React.useCallback(() => {
    setEditing(null);
    setDraft(null);
  }, []);

  /** Patch one key of the open draft; a no-op when no row is open. */
  const patchDraft = React.useCallback((changes: Partial<TDraft>) => {
    setDraft((current) => (current === null ? current : { ...current, ...changes }));
  }, []);

  return { editing, draft, setDraft, patchDraft, startEdit, cancelEdit };
}
