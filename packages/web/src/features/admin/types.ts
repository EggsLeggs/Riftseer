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
