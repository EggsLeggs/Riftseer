/**
 * The admin card list's states.
 *
 * Shared rather than declared twice because the API validates against this list
 * and the admin page builds its filter from it — the same reason
 * `CONFIRMABLE_RECONCILIATION_FIELDS` lives here. Eden cannot carry the union
 * across the wire (a query parameter types as `string`), so a literal copy in
 * the web package would be a copy that compiles happily while disagreeing.
 *
 * Every state is a fact about the catalogue, not about a card, which is why
 * none of them belong in the search grammar: that grammar is a language about
 * cards. `deleted` matters most — soft-deleted rows are excluded from the
 * `resolved_printings` projection, so they are invisible to every ordinary
 * reader, and this list is the only place they can be found and restored.
 */
export const ADMIN_PRINTING_STATES = [
  "live",
  "deleted",
  "manual",
  "locked",
  "delta",
  "no_image",
] as const;

export type AdminPrintingState = (typeof ADMIN_PRINTING_STATES)[number];

const STATES = new Set<string>(ADMIN_PRINTING_STATES);

export function isAdminPrintingState(
  value: string | null | undefined,
): value is AdminPrintingState {
  return value != null && STATES.has(value);
}
