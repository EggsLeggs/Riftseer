/**
 * The review queue's confirmable field diffs.
 *
 * Ingest files a disagreement on any of several fields, but only some of them
 * can be turned into a card patch. This list is the single source of truth for
 * which: the API refuses to confirm anything absent from it
 * (`REVIEW_FIELD_UNSUPPORTED`), and the admin review page disables Confirm on
 * the same rows so the button never promises a write the API will reject.
 *
 * `text` is deliberately absent. The two sources hold different markup for the
 * same rules, so the form that was compared is not the form we would store —
 * an admin edits the card by hand and dismisses the entry.
 */
export const CONFIRMABLE_RECONCILIATION_FIELDS = [
  "collector_number",
  "released_at",
  "rarity",
  "type",
  "energy",
  "might",
  "power",
] as const;

export type ConfirmableReconciliationField =
  (typeof CONFIRMABLE_RECONCILIATION_FIELDS)[number];

const CONFIRMABLE = new Set<string>(CONFIRMABLE_RECONCILIATION_FIELDS);

export function isConfirmableReconciliationField(
  field: string | null | undefined,
): field is ConfirmableReconciliationField {
  return field != null && CONFIRMABLE.has(field);
}
