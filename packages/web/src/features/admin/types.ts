/**
 * Request/response shapes for `/api/v1/admin/*`.
 *
 * These mirror the Elysia `t` schemas in `packages/api/src/routes/admin.ts`.
 * Card patches use JSON merge-patch semantics: an omitted key is left alone,
 * and an explicit `null` clears the stored value.
 */

export type Nullable<T> = T | null;

export interface AdminExternalIds {
  riftcodex_id?: Nullable<string>;
  riftbound_id?: Nullable<string>;
  tcgplayer_id?: Nullable<string>;
}

export interface AdminAttributes {
  energy?: Nullable<number>;
  might?: Nullable<number>;
  power?: Nullable<number>;
}

export interface AdminClassification {
  type?: Nullable<string>;
  supertype?: Nullable<string>;
  rarity?: Nullable<string>;
  tags?: Nullable<string[]>;
  domains?: Nullable<string[]>;
}

export interface AdminText {
  rich?: Nullable<string>;
  plain?: Nullable<string>;
  flavour?: Nullable<string>;
}

export interface AdminCardMetadata {
  finishes?: Nullable<string[]>;
  signature?: Nullable<boolean>;
  overnumbered?: Nullable<boolean>;
  alternate_art?: Nullable<boolean>;
}

export interface AdminMedia {
  orientation?: Nullable<string>;
  accessibility_text?: Nullable<string>;
}

export interface AdminPurchaseUris {
  cardmarket?: Nullable<string>;
  tcgplayer?: Nullable<string>;
}

export interface AdminPriceEntry {
  normal?: Nullable<number>;
  foil?: Nullable<number>;
  low_normal?: Nullable<number>;
  low_foil?: Nullable<number>;
}

export interface AdminPrices {
  tcgplayer?: Nullable<AdminPriceEntry>;
  cardmarket?: Nullable<AdminPriceEntry>;
}

/** Fields shared by `PATCH /cards/:id` and `POST /cards`. */
export interface AdminCardFields {
  released_at?: Nullable<string>;
  collector_number?: Nullable<string>;
  external_ids?: Nullable<AdminExternalIds>;
  attributes?: Nullable<AdminAttributes>;
  classification?: Nullable<AdminClassification>;
  text?: Nullable<AdminText>;
  artist?: Nullable<string>;
  metadata?: Nullable<AdminCardMetadata>;
  media?: Nullable<AdminMedia>;
  purchase_uris?: Nullable<AdminPurchaseUris>;
  prices?: Nullable<AdminPrices>;
  is_token?: boolean;
}

export interface AdminCardPatch extends AdminCardFields {
  name?: string;
}

export interface AdminSetReference {
  set_code: string;
  set_name: string;
  set_uri?: string;
  set_search_uri?: string;
  published_on?: string;
}

export interface AdminCardDefinition extends AdminCardFields {
  name: string;
  set?: AdminSetReference;
}

export const ADMIN_RELATIONSHIP_KINDS = [
  "all_parts",
  "used_by",
  "related_champions",
  "related_legends",
  "related_signatures",
  "related_printings",
] as const;

export type AdminRelationshipKind = (typeof ADMIN_RELATIONSHIP_KINDS)[number];

export interface AdminRelationshipEntry {
  kind: AdminRelationshipKind;
  related_card_id: string;
  action: "add" | "remove";
}

export interface AdminSetFields {
  set_uri?: Nullable<string>;
  set_search_uri?: Nullable<string>;
  published_on?: Nullable<string>;
  is_promo?: boolean;
  parent_set_code?: Nullable<string>;
  external_ids?: Nullable<{
    riftcodex_set_id?: Nullable<string>;
    tcgplayer_group_id?: Nullable<number>;
    cardmarket_id?: Nullable<string | string[]>;
  }>;
}

export interface AdminSetPatch extends AdminSetFields {
  set_name?: string;
}

export interface AdminSetDefinition extends AdminSetFields {
  set_name: string;
}

// ─── Formats, legalities, rulings ─────────────────────────────────────────────

export const ADMIN_LEGALITY_STATUSES = [
  "legal",
  "not_legal",
  "banned",
] as const;

export type AdminLegalityStatus = (typeof ADMIN_LEGALITY_STATUSES)[number];

/**
 * `default` is not a stored status — it clears the row, and absence of a row
 * means legal. Keep it out of `ADMIN_LEGALITY_STATUSES` so display code cannot
 * accidentally render it as a badge.
 */
export type AdminLegalityStatusInput = AdminLegalityStatus | "default";

export interface AdminFormat {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  active: boolean;
  /** Card-level rows a delete would cascade away. */
  legality_count: number;
  /** Per-printing override rows a delete would cascade away. */
  override_count: number;
}

export interface AdminFormatListResult {
  formats: AdminFormat[];
}

export interface AdminFormatInput {
  code: string;
  name: string;
  sort_order?: number;
  active?: boolean;
}

export interface AdminFormatPatch {
  name?: string;
  sort_order?: number;
  active?: boolean;
}

export interface AdminCardLegalityEntry {
  format_id: string;
  format_code: string;
  format_name: string;
  format_active: boolean;
  /** Status shared by every printing, or null when nothing is stored. */
  oracle_status: AdminLegalityStatus | null;
  /** This printing's exception, or null when it inherits. */
  printing_status: AdminLegalityStatus | null;
  effective_status: AdminLegalityStatus;
}

export interface AdminCardLegalities {
  card_id: string;
  oracle_key: string;
  entries: AdminCardLegalityEntry[];
}

export const ADMIN_RULING_TYPES = ["ruling", "note"] as const;

export type AdminRulingType = (typeof ADMIN_RULING_TYPES)[number];

export interface AdminCardRuling {
  id: string;
  type: AdminRulingType;
  text: string;
  dated: string | null;
  source: string | null;
  active: boolean;
  /** Which target kind put this entry on the card being edited. */
  scope: "printing" | "oracle" | "rule";
  /** True when the entry is shared by every printing of this card. */
  all_printings: boolean;
  /**
   * True when the ruling has several targets or any rule target. The panel shows
   * those read-only — retargeting or deleting one here would silently affect
   * other cards, so they are edited from `/admin/rulings`.
   */
  shared: boolean;
  target_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminCardRulings {
  card_id: string;
  oracle_key: string;
  entries: AdminCardRuling[];
}

export interface AdminRulingInput {
  type: AdminRulingType;
  text: string;
  dated?: string;
  source?: string;
  /** Defaults to true — a ruling normally describes the card, not one printing. */
  apply_to_all_printings?: boolean;
}

export interface AdminRulingPatch {
  type?: AdminRulingType;
  text?: string;
  dated?: Nullable<string>;
  source?: Nullable<string>;
  apply_to_all_printings?: boolean;
}

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
] as const;

export type AdminReviewKind = (typeof ADMIN_REVIEW_KINDS)[number];

/** The only fields ingest proposes; prices are never queued. */
export type AdminReviewField = "collector_number" | "released_at";

export interface AdminReviewProduct {
  product_id: number;
  name: string;
  url: string;
  image_url: string | null;
  collector_number: string | null;
  group_id: number;
  set_code: string | null;
}

export interface AdminReviewEntry {
  id: string;
  kind: AdminReviewKind;
  fingerprint: string;
  status: AdminReviewStatus;
  tcgplayer_payload: {
    product: AdminReviewProduct;
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
}

export interface AdminReviewMutationResult {
  ok: true;
  entry_id: string;
  status: "confirmed" | "dismissed";
  card_id: Nullable<string>;
}

// ─── Audit log ────────────────────────────────────────────────────────────────

export interface AdminAuditEntry {
  id: number;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  /** The payload the mutation was called with, for tracing or hand-reverting. */
  detail: Record<string, unknown>;
  created_at: string;
}

export interface AdminAuditPage {
  entries: AdminAuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminAuditFilters {
  limit?: number;
  offset?: number;
  action?: string;
  target_type?: string;
  target_id?: string;
  actor_id?: string;
}

// ─── Responses ────────────────────────────────────────────────────────────────

export interface AdminCardMutationResult {
  ok: true;
  card_id: string;
}

export interface AdminSlugMutationResult {
  ok: true;
  card_id: string;
  public_slug: string;
}

export interface AdminSetMutationResult {
  ok: true;
  set_code: string;
}

export interface AdminFormatMutationResult {
  ok: true;
  code: string;
}

export interface AdminFormatDeleteResult {
  ok: true;
  code: string;
  legalities_removed: number;
  overrides_removed: number;
}

export interface AdminReorderResult {
  ok: true;
}

export interface AdminLegalityMutationResult {
  ok: true;
  card_id: string;
  format_code: string;
  scope: "printing" | "oracle";
  status: AdminLegalityStatus | null;
}

export interface AdminRulingMutationResult {
  ok: true;
  card_id: string;
  ruling_id: string;
}

export interface AdminImageMutationResult {
  ok: true;
  card_id: string;
  source_url: string;
  source_hash: string;
  /** False when the variant queue rejected the job — ingest still picks it up. */
  queued: boolean;
}

/**
 * Every admin call resolves rather than throws, so views can render the API's
 * machine `code` (e.g. `SET_NOT_EMPTY`) instead of a stack trace.
 */
export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; status?: number };
