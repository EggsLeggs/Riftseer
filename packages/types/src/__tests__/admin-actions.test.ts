import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ADMIN_AUDIT_ACTIONS } from "../admin-actions.ts";

/**
 * A conformance test, not a unit test.
 *
 * `ADMIN_AUDIT_ACTIONS` is a TypeScript copy of something the database decides.
 * A copy that drifts here does not throw — the audit-log filter simply returns
 * nothing — so the only useful assertion is against the migration itself.
 */
const MIGRATIONS_DIR = path.resolve(
  import.meta.dirname,
  "../../../../supabase/migrations",
);

/** `admin__log(p_actor, 'oracle.patch', …)` and the one dynamic caller. */
function actionsWrittenBySql(): Set<string> {
  const actions = new Set<string>();

  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

    for (const [, action] of sql.matchAll(/admin__log\(\s*p_actor,\s*'([a-z._]+)'/g)) {
      actions.add(action);
    }
    // The review queue builds its action from the request: 'reconciliation.'
    // || p_action, where p_action is validated to confirm|dismiss.
    for (const [, prefix] of sql.matchAll(
      /admin__log\(\s*p_actor,\s*'([a-z._]+)'\s*\|\|\s*p_action/g,
    )) {
      actions.add(`${prefix}confirm`);
      actions.add(`${prefix}dismiss`);
    }
  }

  // The literal-string pass also captured the `'reconciliation.'` prefix of the
  // dynamic call above. A trailing dot is never a whole action.
  for (const action of actions) {
    if (action.endsWith(".")) actions.delete(action);
  }
  return actions;
}

describe("ADMIN_AUDIT_ACTIONS", () => {
  it("lists exactly the actions the migrations write", () => {
    const fromSql = [...actionsWrittenBySql()].sort();
    const declared: string[] = [...ADMIN_AUDIT_ACTIONS];
    expect(declared.sort()).toEqual(fromSql);
  });

  it("found actions at all — a regex that matches nothing would pass vacuously", () => {
    expect(actionsWrittenBySql().size).toBeGreaterThan(10);
  });
});
