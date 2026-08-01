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
 * Oracle, printing and set patches use JSON merge-patch semantics: an omitted key is left
 * alone, and an explicit `null` clears the stored value.
 */

import type { treaty } from "@elysiajs/eden";
import type { App } from "@riftseer/api";

type AdminRoutes = ReturnType<typeof treaty<App>>["api"]["v1"]["admin"];
type OracleById = ReturnType<AdminRoutes["oracles"]>;
type PrintingById = ReturnType<AdminRoutes["printings"]>;
type SetByCode = ReturnType<AdminRoutes["sets"]>;
type FormatByCode = ReturnType<AdminRoutes["formats"]>;
type RulingById = ReturnType<AdminRoutes["rulings"]>;

export type Nullable<T> = T | null;

/** The request body an Eden treaty method accepts. */
type Body<F extends (...args: never) => unknown> = Parameters<F>[0];

/** The 2xx payload an Eden treaty method resolves to. */
type Ok<F extends (...args: never) => unknown> =
  Awaited<ReturnType<F>> extends infer R
    ? R extends { error: null; data: infer D }
      ? D
      : never
    : never;

// ─── Oracles and printings ───────────────────────────────────────────────────

export type AdminOraclePatch = Body<OracleById["patch"]>["patch"];
export type AdminOracleDefinition = Body<AdminRoutes["oracles"]["post"]>["definition"];
export type AdminPrintingPatch = Body<PrintingById["patch"]>["patch"];
export type AdminPrintingDefinition = Body<AdminRoutes["printings"]["post"]>["definition"];
export type AdminPrintingDelta = NonNullable<
  NonNullable<Body<PrintingById["deltas"]["put"]>>["delta"]
>;

export type AdminOracleRelationships = Ok<OracleById["relationships"]["get"]>;

export type AdminRelationshipEntry = Body<
  OracleById["relationships"]["put"]
>["entries"][number];

export type AdminRelationshipKind = AdminRelationshipEntry["kind"];

// ─── Sets ─────────────────────────────────────────────────────────────────────

export type AdminSetPatch = Body<SetByCode["patch"]>["patch"];

export type AdminSetDefinition = Body<AdminRoutes["sets"]["post"]>["definition"];

// ─── Formats, legalities, rulings ─────────────────────────────────────────────

export type AdminFormatListResult = Ok<AdminRoutes["formats"]["get"]>;

export type AdminFormat = AdminFormatListResult["formats"][number];

export type AdminFormatInput = Body<AdminRoutes["formats"]["post"]>;

export type AdminFormatPatch = Body<FormatByCode["patch"]>["patch"];

export type AdminPrintingLegalities = Ok<PrintingById["legalities"]["get"]>;

export type AdminPrintingLegalityEntry = AdminPrintingLegalities["entries"][number];

/** The statuses that can be stored. Absence of a row means legal. */
export type AdminLegalityStatus = AdminPrintingLegalityEntry["status"];

/**
 * What the legality route accepts. `default` is not a stored status — it clears
 * the row — so it is deliberately absent from `AdminLegalityStatus` and display
 * code cannot render it as a badge.
 */
export type AdminLegalityStatusInput = Body<
  PrintingById["legalities"]["put"]
>["status"];

export type AdminPrintingRulings = Ok<PrintingById["rulings"]["get"]>;

export type AdminPrintingRuling = AdminPrintingRulings["entries"][number];

export type AdminRulingType = AdminPrintingRuling["type"];

// ─── Rulings tab (`/admin/rulings`) ───────────────────────────────────────────

export const ADMIN_RULING_TARGET_KINDS = [
  "oracle",
  "printing",
  "query",
] as const;

export type AdminRulingTargetKind =
  (typeof ADMIN_RULING_TARGET_KINDS)[number];

/**
 * A stored target. `query` targets carry the search string the admin typed plus
 * the AST the API parsed it to; `match_count` is how many cards it currently
 * covers, refreshed on save and after every ingest.
 */
export interface AdminRulingTarget {
  id: string;
  kind: AdminRulingTargetKind;
  oracle_id: string | null;
  printing_id: string | null;
  query: string | null;
  match_count: number | null;
}

/** Target input — the API derives the AST, so only the query text is sent. */
export type AdminRulingTargetInput =
  | { kind: "oracle"; oracle_id: string }
  | { kind: "printing"; printing_id: string }
  | { kind: "query"; query: string };

export interface AdminRuling {
  id: string;
  type: AdminRulingType;
  text: string;
  dated: string | null;
  source: string | null;
  active: boolean;
  targets: AdminRulingTarget[];
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminRulingsPage {
  rulings: AdminRuling[];
  total: number;
}

export interface AdminRulingsQuery {
  q?: string;
  kind?: AdminRulingTargetKind;
  limit?: number;
  offset?: number;
}

export interface AdminRulingCreateInput {
  type: AdminRulingType;
  text: string;
  dated?: string;
  source?: string;
  targets: AdminRulingTargetInput[];
}

export interface AdminRulingRecordPatch {
  type?: AdminRulingType;
  text?: string;
  dated?: Nullable<string>;
  source?: Nullable<string>;
  active?: boolean;
  /** Replaces the entire target list; omit to leave targeting unchanged. */
  targets?: AdminRulingTargetInput[];
}

export interface AdminRulePreviewCard {
  id: string;
  name: string;
  set_code: string | null;
  collector_number: string | null;
  public_slug: string | null;
}

export interface AdminRulePreview {
  query: string;
  total: number;
  sample: AdminRulePreviewCard[];
}

// ─── Review queue (TCGPlayer + official gallery) ──────────────────────────────

export type AdminReviewPage = Ok<AdminRoutes["reconciliation"]["get"]>;

export type AdminReviewEntry = AdminReviewPage["entries"][number];

export type AdminReviewStatus = AdminReviewEntry["status"];

export type AdminReviewKind = AdminReviewEntry["kind"];

/** Which upstream raised the entry; decides which half of the payload is set. */
export type AdminReviewSource = AdminReviewEntry["source"];

/** The only fields ingest proposes; prices are never queued. */
export type AdminReviewField = NonNullable<
  AdminReviewEntry["payload"]["field"]
>;

export type AdminReviewProduct = NonNullable<
  AdminReviewEntry["payload"]["product"]
>;

/** A printing the official gallery lists, as filed for review. */
export type AdminReviewGalleryCard = NonNullable<
  AdminReviewEntry["payload"]["gallery"]
>;

// Runtime lists for the filter selects. `satisfies` ties each to the derived
// union, so a value the API drops (or gains) fails to compile here.
export const ADMIN_REVIEW_STATUSES = [
  "pending",
  "confirmed",
  "dismissed",
] as const satisfies readonly AdminReviewStatus[];

export const ADMIN_REVIEW_KINDS = [
  "unmatched_product",
  "field_diff",
  "missing_printing",
  "unmatched_oracle",
] as const satisfies readonly AdminReviewKind[];

export const ADMIN_REVIEW_SOURCES = [
  "tcgplayer",
  "gallery",
] as const satisfies readonly AdminReviewSource[];

export interface AdminReviewFilters {
  limit?: number;
  offset?: number;
  status?: AdminReviewStatus;
  kind?: AdminReviewKind;
  source?: AdminReviewSource;
}

export type AdminReviewMutationResult = Ok<
  ReturnType<AdminRoutes["reconciliation"]>["confirm"]["post"]
>;

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

export type AdminOracleMutationResult = Ok<OracleById["patch"]>;

export type AdminPrintingMutationResult = Ok<PrintingById["patch"]>;

export type AdminSlugMutationResult = Ok<PrintingById["regenerate-slug"]["post"]>;

export type AdminSetMutationResult = Ok<SetByCode["patch"]>;

export type AdminImageMutationResult = Ok<PrintingById["image"]["post"]>;

export type AdminFormatMutationResult = Ok<AdminRoutes["formats"]["post"]>;

export type AdminFormatDeleteResult = Ok<FormatByCode["delete"]>;

export type AdminReorderResult = Ok<AdminRoutes["formats"]["order"]["put"]>;

export type AdminLegalityMutationResult = Ok<PrintingById["legalities"]["put"]>;

/**
 * Every admin call resolves rather than throws, so views can render the API's
 * machine `code` (e.g. `SET_NOT_EMPTY`) instead of a stack trace.
 */
export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; status?: number };
