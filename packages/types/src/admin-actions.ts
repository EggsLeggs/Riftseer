/**
 * Every `action` value the admin RPCs write to `admin_audit_log`.
 *
 * This lives here, rather than in the admin UI that filters on it, because a
 * hard-coded copy beside the filter is a silent failure: a stale entry does not
 * error, it just returns nothing, and nobody notices until they go looking for
 * an audit trail that appears to be empty. That is exactly what happened when
 * the card model split and the UI kept filtering on `card.*` values the database
 * had stopped emitting.
 *
 * The database is the authority. `admin-actions.test.ts` reads the migration and
 * asserts this list matches, so the two cannot drift without CI saying so.
 */
export const ADMIN_AUDIT_ACTIONS = [
  "format.create",
  "format.delete",
  "format.legality_severity",
  "format.patch",
  "format.reorder",
  "format.zone_rule",
  "format.zone_rule.delete",
  "oracle.create",
  "oracle.delete",
  "oracle.legality",
  "oracle.patch",
  "oracle.relationships",
  "oracle.restore",
  "printing.create",
  "printing.delete",
  "printing.delta",
  "printing.delta.clear",
  "printing.legality",
  "printing.patch",
  "printing.restore",
  "printing.slug",
  "reconciliation.confirm",
  "reconciliation.dismiss",
  "ruling.create",
  "ruling.delete",
  "ruling.patch",
  "set.create",
  "set.delete",
  "set.patch",
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

/** Group actions by the thing they act on, for a grouped filter control. */
export function adminAuditActionSubject(action: string): string {
  const [subject] = action.split(".");
  return subject ?? action;
}
