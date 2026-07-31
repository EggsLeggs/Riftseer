/**
 * Request/response shapes for `/api/v1/admin/*`.
 *
 * These are derived from the Elysia route definitions via the type-only `App`
 * import and the Eden treaty client, so they cannot drift from the `t` schemas
 * in `packages/api/src/routes/admin.ts` — a schema change surfaces here as a
 * type error rather than a runtime surprise. `features/admin/api.ts` still
 * fetches by hand because it needs `AdminResult` and a per-call timeout, but the
 * contracts it speaks are the API's own.
 *
 * Card and set patches use JSON merge-patch semantics: an omitted key is left
 * alone, and an explicit `null` clears the stored value.
 */

import type { treaty } from "@elysiajs/eden";
import type { App } from "@riftseer/api";

type AdminRoutes = ReturnType<typeof treaty<App>>["api"]["v1"]["admin"];
type CardById = ReturnType<AdminRoutes["cards"]>;
type SetByCode = ReturnType<AdminRoutes["sets"]>;

/** The request body an Eden treaty method accepts. */
type Body<F extends (...args: never) => unknown> = Parameters<F>[0];

/** The 2xx payload an Eden treaty method resolves to. */
type Ok<F extends (...args: never) => unknown> =
  Awaited<ReturnType<F>> extends infer R
    ? R extends { error: null; data: infer D }
      ? D
      : never
    : never;

// ─── Cards ────────────────────────────────────────────────────────────────────

export type AdminCardPatch = Body<CardById["patch"]>["patch"];

export type AdminCardDefinition = Body<AdminRoutes["cards"]["post"]>["definition"];

export type AdminRelationshipEntry = Body<
  CardById["relationships"]["put"]
>["entries"][number];

export type AdminRelationshipKind = AdminRelationshipEntry["kind"];

// ─── Sets ─────────────────────────────────────────────────────────────────────

export type AdminSetPatch = Body<SetByCode["patch"]>["patch"];

export type AdminSetDefinition = Body<AdminRoutes["sets"]["post"]>["definition"];

// ─── Audit log ────────────────────────────────────────────────────────────────

export type AdminAuditPage = Ok<AdminRoutes["audit-log"]["get"]>;

export type AdminAuditEntry = AdminAuditPage["entries"][number];

type AdminAuditQuery = NonNullable<
  NonNullable<Body<AdminRoutes["audit-log"]["get"]>>["query"]
>;

/**
 * The audit-log filters as callers hold them. The wire query is all strings;
 * `limit`/`offset` are numbers here and serialised in `api.ts`.
 */
export type AdminAuditFilters = Omit<AdminAuditQuery, "limit" | "offset"> & {
  limit?: number;
  offset?: number;
};

// ─── Responses ────────────────────────────────────────────────────────────────

export type AdminCardMutationResult = Ok<CardById["patch"]>;

export type AdminSlugMutationResult = Ok<CardById["regenerate-slug"]["post"]>;

export type AdminSetMutationResult = Ok<SetByCode["patch"]>;

export type AdminImageMutationResult = Ok<CardById["image"]["post"]>;

/**
 * Every admin call resolves rather than throws, so views can render the API's
 * machine `code` (e.g. `SET_NOT_EMPTY`) instead of a stack trace.
 */
export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; status?: number };
