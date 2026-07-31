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
type FormatByCode = ReturnType<AdminRoutes["formats"]>;
type RulingById = ReturnType<CardById["rulings"]>;

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

// ─── Cards ────────────────────────────────────────────────────────────────────

export type AdminCardPatch = Body<CardById["patch"]>["patch"];

export type AdminCardDefinition = Body<AdminRoutes["cards"]["post"]>["definition"];

export type AdminCardRelationships = Ok<CardById["relationships"]["get"]>;

export type AdminRelationshipEntry = Body<
  CardById["relationships"]["put"]
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

export type AdminCardLegalities = Ok<CardById["legalities"]["get"]>;

export type AdminCardLegalityEntry = AdminCardLegalities["entries"][number];

/** The statuses that can be stored. Absence of a row means legal. */
export type AdminLegalityStatus = AdminCardLegalityEntry["effective_status"];

/**
 * What the legality route accepts. `default` is not a stored status — it clears
 * the row — so it is deliberately absent from `AdminLegalityStatus` and display
 * code cannot render it as a badge.
 */
export type AdminLegalityStatusInput = Body<
  CardById["legalities"]["put"]
>["status"];

export type AdminCardRulings = Ok<CardById["rulings"]["get"]>;

export type AdminCardRuling = AdminCardRulings["entries"][number];

export type AdminRulingType = AdminCardRuling["type"];

export type AdminRulingInput = Body<CardById["rulings"]["post"]>;

export type AdminRulingPatch = Body<RulingById["patch"]>["patch"];

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
  oracle_key: string | null;
  card_id: string | null;
  card_name: string | null;
  query: string | null;
  ast: unknown;
  match_count: number | null;
}

/** Target input — the API derives the AST, so only the query text is sent. */
export type AdminRulingTargetInput =
  | { kind: "oracle"; oracle_key: string }
  | { kind: "printing"; card_id: string }
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

// ─── TCGPlayer review queue ───────────────────────────────────────────────────

export const ADMIN_REVIEW_STATUSES = [
  "pending",
  "confirmed",
  "dismissed",
] as const;

export type AdminReviewStatus = (typeof ADMIN_REVIEW_STATUSES)[number];

export const ADMIN_REVIEW_KINDS = [
  "unmatched_product",
  "field_diff",
  "missing_card",
] as const;

export type AdminReviewKind = (typeof ADMIN_REVIEW_KINDS)[number];

export const ADMIN_REVIEW_SOURCES = ["tcgplayer", "gallery"] as const;

/** Which upstream raised the entry; decides which half of the payload is set. */
export type AdminReviewSource = (typeof ADMIN_REVIEW_SOURCES)[number];

/** The only fields ingest proposes; prices are never queued. */
export type AdminReviewField =
  | "collector_number"
  | "released_at"
  | "rarity"
  | "type"
  | "energy"
  | "might"
  | "power"
  | "text";

export interface AdminReviewProduct {
  product_id: number;
  name: string;
  url: string;
  image_url: string | null;
  collector_number: string | null;
  group_id: number;
  set_code: string | null;
}

/** A printing the official gallery lists, as filed for review. */
export interface AdminReviewGalleryCard {
  riftbound_id: string;
  name: string;
  public_code: string | null;
  set_code: string | null;
  set_name?: string | null;
  collector_number: string | null;
  rarity: string | null;
  type: string | null;
  image_url: string | null;
  energy?: number | null;
  might?: number | null;
  power?: number | null;
  text?: string | null;
  might_bonus?: number | null;
  equipment?: string | null;
  signature?: boolean;
  special_collection?: boolean;
  alternate_art?: boolean;
  is_token?: boolean;
}

export interface AdminReviewEntry {
  id: string;
  kind: AdminReviewKind;
  source: AdminReviewSource;
  fingerprint: string;
  status: AdminReviewStatus;
  payload: {
    product?: AdminReviewProduct;
    gallery?: AdminReviewGalleryCard;
    field?: AdminReviewField;
    current_value?: Nullable<string>;
    proposed_value?: Nullable<string>;
    card_id?: string;
    card_name?: string;
  };
  /** Ingest's suggestion, or the card the entry was confirmed against. */
  proposed_card_id: Nullable<string>;
  note: Nullable<string>;
  resolved_by: Nullable<string>;
  resolved_at: Nullable<string>;
  created_at: string;
  last_seen_at: string;
}

export interface AdminReviewPage {
  entries: AdminReviewEntry[];
  total: number;
  /** Totals per status regardless of the current filter, for the tabs. */
  counts: Record<AdminReviewStatus, number>;
  limit: number;
  offset: number;
}

export interface AdminReviewFilters {
  limit?: number;
  offset?: number;
  status?: AdminReviewStatus;
  kind?: AdminReviewKind;
  source?: AdminReviewSource;
}

export interface AdminReviewMutationResult {
  ok: true;
  entry_id: string;
  status: "confirmed" | "dismissed";
  card_id: Nullable<string>;
}

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

export type AdminFormatMutationResult = Ok<AdminRoutes["formats"]["post"]>;

export type AdminFormatDeleteResult = Ok<FormatByCode["delete"]>;

export type AdminReorderResult = Ok<AdminRoutes["formats"]["order"]["put"]>;

export type AdminLegalityMutationResult = Ok<CardById["legalities"]["put"]>;

export type AdminRulingMutationResult = Ok<CardById["rulings"]["post"]>;

/**
 * Every admin call resolves rather than throws, so views can render the API's
 * machine `code` (e.g. `SET_NOT_EMPTY`) instead of a stack trace.
 */
export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; status?: number };
