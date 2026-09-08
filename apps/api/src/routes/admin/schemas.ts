import { t } from "elysia";
import { ADMIN_PRINTING_STATES } from "@riftseer/types/admin-printing";
import { DECK_ZONES, LEGALITY_STATUSES, VIOLATION_SEVERITIES } from "@riftseer/types/deck";
import { CARD_SEARCH_LIMITS } from "@riftseer/core";
import { ErrorSchema, LegalityStatusSchema } from "../../schemas";
import { DATE_PATTERN, NON_BLANK_PATTERN } from "./shared";

// ─── Admin schemas ────────────────────────────────────────────────────────────
//
// Request bodies and response shapes for every admin route. Body keys are the
// RPC column names: `admin_patch_oracle` and friends take a flat jsonb of
// column to value, so the route never translates between two vocabularies.

export const NullableStringSchema = t.Nullable(t.String());
export const NullableNumberSchema = t.Nullable(t.Number());

// ─── Oracle bodies ────────────────────────────────────────────────────────────
//
// The keys are the RPC's column names, not the public payload's nesting:
// `admin_patch_oracle` takes a flat jsonb of column → value, and translating
// between two vocabularies in the route was where the old admin surface kept
// going wrong.

export const AdminOracleFields = {
  card_type: t.Optional(NullableStringSchema),
  supertype: t.Optional(NullableStringSchema),
  is_token: t.Optional(t.Boolean()),
  energy: t.Optional(NullableNumberSchema),
  might: t.Optional(NullableNumberSchema),
  power: t.Optional(NullableNumberSchema),
  /** `0` is a real printed Might bonus, so this is presence-checked, not truthy. */
  might_bonus: t.Optional(NullableNumberSchema),
  equipment_text: t.Optional(NullableStringSchema),
  text_rich: t.Optional(NullableStringSchema),
  text_plain: t.Optional(NullableStringSchema),
  tags: t.Optional(t.Array(t.String(), { maxItems: 100 })),
  domains: t.Optional(t.Array(t.String(), { maxItems: 20 })),
  meta_flags: t.Optional(t.Array(t.String(), { maxItems: 50 })),
};

export const NameSchema = t.String({
  minLength: 1,
  maxLength: 300,
  pattern: NON_BLANK_PATTERN,
});

export const AdminOraclePatchSchema = t.Object({
  name: t.Optional(NameSchema),
  ...AdminOracleFields,
});

export const AdminOracleDefinitionSchema = t.Object({
  name: NameSchema,
  ...AdminOracleFields,
});

export const RelationshipKindSchema = t.UnionEnum(["makes_token", "character", "signature"]);

export const AdminRelationshipEntrySchema = t.Object({
  kind: RelationshipKindSchema,
  to_oracle_id: t.String({ format: "uuid" }),
});

export const AdminRelationshipEdgeSchema = t.Object({
  kind: RelationshipKindSchema,
  oracle_id: t.String(),
  name: t.String(),
  slug: t.String(),
  source: t.UnionEnum(["ingest", "admin"]),
});

export const AdminOracleRelationshipsResponseSchema = t.Object({
  oracle_id: t.String(),
  outgoing: t.Array(AdminRelationshipEdgeSchema),
  incoming: t.Array(AdminRelationshipEdgeSchema, {
    description: "Edges pointing at this oracle — a reverse view, not stored rows.",
  }),
});

// ─── Printing bodies ──────────────────────────────────────────────────────────

export const AdminPrintingFields = {
  collector_number: t.Optional(NullableStringSchema),
  released_at: t.Optional(t.Nullable(t.String({ pattern: DATE_PATTERN }))),
  rarity: t.Optional(NullableStringSchema),
  flavour_text: t.Optional(NullableStringSchema),
  finishes: t.Optional(t.Array(t.String(), { maxItems: 20 })),
  artist: t.Optional(NullableStringSchema),
  is_signature: t.Optional(t.Boolean()),
  is_alternate_art: t.Optional(t.Boolean()),
  is_overnumbered: t.Optional(t.Boolean()),
  is_special_collection: t.Optional(t.Boolean()),
  tcgplayer_id: t.Optional(NullableStringSchema),
  tcgplayer_url: t.Optional(NullableStringSchema),
  cardmarket_url: t.Optional(NullableStringSchema),
};

export const SetCodeSchema = t.String({
  minLength: 1,
  maxLength: 32,
  pattern: NON_BLANK_PATTERN,
});

export const AdminPrintingPatchSchema = t.Object({
  set_code: t.Optional(SetCodeSchema),
  ...AdminPrintingFields,
});

export const AdminPrintingDefinitionSchema = t.Object(AdminPrintingFields);

/**
 * The same delta mechanism ingest uses, written by hand. Arrays add and remove;
 * scalars override or clear, because there is nothing to "add to" a rules text
 * and NULL in an override column already means inherit.
 */
export const AdminPrintingDeltaSchema = t.Partial(
  t.Object({
    tags_added: t.Array(t.String(), { maxItems: 100 }),
    tags_removed: t.Array(t.String(), { maxItems: 100 }),
    domains_added: t.Array(t.String(), { maxItems: 20 }),
    domains_removed: t.Array(t.String(), { maxItems: 20 }),
    keywords_added: t.Array(t.String(), { maxItems: 50 }),
    keywords_removed: t.Array(t.String(), { maxItems: 50 }),
    meta_flags_added: t.Array(t.String(), { maxItems: 50 }),
    meta_flags_removed: t.Array(t.String(), { maxItems: 50 }),
    name_override: NullableStringSchema,
    card_type_override: NullableStringSchema,
    supertype_override: NullableStringSchema,
    energy_override: NullableNumberSchema,
    might_override: NullableNumberSchema,
    power_override: NullableNumberSchema,
    might_bonus_override: NullableNumberSchema,
    text_rich_override: NullableStringSchema,
    text_plain_override: NullableStringSchema,
    equipment_text_override: NullableStringSchema,
    cleared_fields: t.Array(
      t.UnionEnum([
        "name",
        "card_type",
        "supertype",
        "energy",
        "might",
        "power",
        "might_bonus",
        "text_rich",
        "text_plain",
        "equipment_text",
      ]),
      { maxItems: 10 },
    ),
  }),
);

// ─── Sets ─────────────────────────────────────────────────────────────────────

export const AdminSetFields = {
  set_uri: t.Optional(NullableStringSchema),
  set_search_uri: t.Optional(NullableStringSchema),
  published_on: t.Optional(t.Nullable(t.String({ pattern: DATE_PATTERN }))),
  is_promo: t.Optional(t.Boolean()),
  parent_set_code: t.Optional(NullableStringSchema),
};

export const SetNameSchema = t.String({
  minLength: 1,
  maxLength: 200,
  pattern: NON_BLANK_PATTERN,
});

export const AdminSetPatchSchema = t.Object({
  set_name: t.Optional(SetNameSchema),
  ...AdminSetFields,
});

export const AdminSetDefinitionSchema = t.Object({
  set_name: SetNameSchema,
  ...AdminSetFields,
});

// ─── Mutation responses ───────────────────────────────────────────────────────

export const OracleMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  oracle_id: t.String(),
});

export const PrintingMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  printing_id: t.String(),
});

export const SlugMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  printing_id: t.String(),
  public_slug: t.String(),
});

export const SetMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  set_code: t.String(),
});

export const AuditEntrySchema = t.Object({
  id: t.Number(),
  actor_id: t.String(),
  action: t.String(),
  target_type: t.String(),
  target_id: t.Nullable(t.String()),
  detail: t.Record(t.String(), t.Unknown()),
  created_at: t.String(),
});

export const AuditLogResponseSchema = t.Object({
  entries: t.Array(AuditEntrySchema),
  total: t.Number(),
  limit: t.Number(),
  offset: t.Number(),
});

// ─── Formats, legalities, rulings ─────────────────────────────────────────────

/**
 * Accepted on input in either case — the handler lowercases before the RPC, and
 * the stored code is always lowercase (enforced by `formats_code_check`).
 */
export const FORMAT_CODE_PATTERN = "^[A-Za-z0-9][A-Za-z0-9_-]*$";

/**
 * `default` clears the stored row rather than writing a status: absence of an
 * oracle-level row *is* legal, so this is how a format goes back to unmarked.
 */
export const LegalityStatusInputSchema = t.UnionEnum([...LEGALITY_STATUSES, "default"]);

export const DeckZoneSchema = t.UnionEnum([...DECK_ZONES]);

export const ViolationSeveritySchema = t.UnionEnum([...VIOLATION_SEVERITIES]);

/**
 * `default` deletes the override so the status falls back to
 * `DEFAULT_LEGALITY_SEVERITY` in `@riftseer/types`. It is distinct from
 * `"none"`, which is a stored decision that this status should say nothing.
 */
export const ViolationSeverityInputSchema = t.UnionEnum([...VIOLATION_SEVERITIES, "default"]);

/**
 * A zone's bounds. Every one is nullable and null means **unconstrained**, not
 * zero: a format that says nothing about a zone allows anything there.
 */
export const FormatZoneRuleSchema = t.Object({
  zone: DeckZoneSchema,
  min_count: t.Nullable(t.Number()),
  max_count: t.Nullable(t.Number()),
  copy_limit: t.Nullable(t.Number()),
});

export const FormatSeverityOverrideSchema = t.Object({
  status: LegalityStatusSchema,
  severity: ViolationSeveritySchema,
});

export const RulingTypeSchema = t.UnionEnum(["ruling", "note"]);

export const AdminFormatSchema = t.Object({
  id: t.String(),
  code: t.String(),
  name: t.String(),
  sort_order: t.Number(),
  active: t.Boolean(),
  legality_count: t.Number({
    description: "Oracle-level legality rows a delete would cascade away.",
  }),
  override_count: t.Number({
    description: "Per-printing exception rows a delete would cascade away.",
  }),
  zone_rules: t.Array(FormatZoneRuleSchema, {
    description:
      "What this format demands of each zone. An empty array is a format that constrains nothing — that absence is how the sandbox format works.",
  }),
  severity_overrides: t.Array(FormatSeverityOverrideSchema, {
    description:
      "Only the statuses whose severity this format disagrees with; the rest fall through to the default mapping in @riftseer/types.",
  }),
});

export const AdminFormatListResponseSchema = t.Object({
  formats: t.Array(AdminFormatSchema),
});

export const FormatMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  code: t.String(),
});

export const FormatDeleteResponseSchema = t.Object({
  ok: t.Literal(true),
  code: t.String(),
  legalities_removed: t.Number(),
  overrides_removed: t.Number(),
});

export const AdminPrintingLegalitiesResponseSchema = t.Object({
  printing_id: t.String(),
  oracle_id: t.String(),
  entries: t.Array(
    t.Object({
      format_id: t.String(),
      format_code: t.String(),
      format_name: t.String(),
      status: LegalityStatusSchema,
      scope: t.UnionEnum(["printing", "oracle", "default"], {
        description:
          "Which layer decided the status: this printing's exception, the oracle row, or the default.",
      }),
      note: t.Nullable(t.String(), {
        description:
          "Admin-authored explanation stored on the row that decided the status, shown in the deck builder's legality tooltip. Null at default scope.",
      }),
    }),
  ),
});

export const LegalityMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  printing_id: t.String(),
  format_code: t.String(),
  scope: t.UnionEnum(["printing", "oracle"]),
  status: t.Nullable(LegalityStatusSchema),
  note: t.Nullable(t.String()),
});

export const FormatZoneRuleMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  code: t.String(),
  zone: DeckZoneSchema,
  min_count: t.Nullable(t.Number()),
  max_count: t.Nullable(t.Number()),
  copy_limit: t.Nullable(t.Number()),
});

export const FormatZoneRuleDeleteResponseSchema = t.Object({
  ok: t.Literal(true),
  code: t.String(),
  zone: DeckZoneSchema,
  deleted: t.Boolean({
    description:
      "False when there was no rule to remove. The zone is unconstrained either way, so this is reported rather than treated as an error.",
  }),
});

export const FormatSeverityMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  code: t.String(),
  status: LegalityStatusSchema,
  severity: t.Nullable(ViolationSeveritySchema),
});

export const AdminPrintingRulingsResponseSchema = t.Object({
  printing_id: t.String(),
  oracle_id: t.String(),
  entries: t.Array(
    t.Object({
      id: t.String(),
      type: RulingTypeSchema,
      text: t.String(),
      dated: t.Nullable(t.String()),
      source: t.Nullable(t.String()),
      active: t.Boolean(),
      scope: t.UnionEnum(["printing", "oracle", "rule"], {
        description:
          "Which target kind put this entry on the printing: this printing, its oracle, or a query-scoped rule.",
      }),
      shared: t.Boolean({
        description:
          "True when the ruling has several targets or any rule target — it is read-only here and edited from /admin/rulings.",
      }),
      target_count: t.Number(),
      created_at: t.Nullable(t.String()),
      updated_at: t.Nullable(t.String()),
    }),
  ),
});

// ─── Rulings tab ──────────────────────────────────────────────────────────────

/**
 * What a ruling applies to. A `query` target carries the search string the admin
 * typed; the API parses it with the same parser the search bar uses and stores
 * the resulting AST alongside it, so the rule language and the search language
 * can never drift apart.
 */
export const RulingTargetInputSchema = t.Union([
  t.Object({
    kind: t.Literal("oracle"),
    oracle_id: t.String({ format: "uuid" }),
  }),
  t.Object({
    kind: t.Literal("printing"),
    printing_id: t.String({ minLength: 1, maxLength: 128 }),
  }),
  t.Object({
    kind: t.Literal("query"),
    query: t.String({
      minLength: 1,
      maxLength: CARD_SEARCH_LIMITS.maxInputLength,
      pattern: NON_BLANK_PATTERN,
    }),
  }),
]);

export const RulingTargetSchema = t.Object({
  id: t.String(),
  kind: t.UnionEnum(["oracle", "printing", "query"]),
  oracle_id: t.Nullable(t.String()),
  printing_id: t.Nullable(t.String()),
  query: t.Nullable(t.String()),
  match_count: t.Nullable(t.Number()),
  label: t.Nullable(t.String()),
  deleted: t.Boolean(),
});

export const RulingSchema = t.Object({
  id: t.String(),
  type: RulingTypeSchema,
  text: t.String(),
  dated: t.Nullable(t.String()),
  source: t.Nullable(t.String()),
  active: t.Boolean(),
  targets: t.Array(RulingTargetSchema),
  created_at: t.Nullable(t.String()),
  updated_at: t.Nullable(t.String()),
});

export const RulingsPageSchema = t.Object({
  rulings: t.Array(RulingSchema),
  total: t.Number(),
});

export const RulingRecordResponseSchema = t.Object({
  ok: t.Literal(true),
  ruling: t.Unknown(),
});

export const RulePreviewResponseSchema = t.Object({
  query: t.String(),
  total: t.Number(),
  sample: t.Array(
    t.Object({
      id: t.String(),
      name: t.String(),
      set_code: t.Nullable(t.String()),
      collector_number: t.Nullable(t.String()),
      public_slug: t.Nullable(t.String()),
    }),
  ),
});

// ─── Reconciliation queue ─────────────────────────────────────────────────────

export const ReconciliationKindSchema = t.UnionEnum([
  "unmatched_product",
  "field_diff",
  "missing_printing",
  "unmatched_oracle",
]);

export const ReconciliationSourceSchema = t.UnionEnum(["tcgplayer", "gallery"]);

export const ReconciliationStatusSchema = t.UnionEnum(["pending", "confirmed", "dismissed"]);

export const ReconciliationFieldSchema = t.UnionEnum([
  "collector_number",
  "released_at",
  "rarity",
  "type",
  "energy",
  "might",
  "power",
  "text",
]);

/**
 * Query-position variants. `t.UnionEnum` fills in its first member as a default
 * when the key is absent — harmless in a body where the field is required, but
 * in a query it would silently filter every unfiltered list to that one value.
 * A union of literals stays undefined when omitted.
 */
export const ReconciliationStatusQuerySchema = t.Union([
  t.Literal("pending"),
  t.Literal("confirmed"),
  t.Literal("dismissed"),
]);

export const ReconciliationKindQuerySchema = t.Union([
  t.Literal("unmatched_product"),
  t.Literal("field_diff"),
  t.Literal("missing_printing"),
  t.Literal("unmatched_oracle"),
]);

export const ReconciliationSourceQuerySchema = t.Union([
  t.Literal("tcgplayer"),
  t.Literal("gallery"),
]);

export const ReconciliationProductSchema = t.Object({
  product_id: t.Number(),
  name: t.String(),
  url: t.String(),
  image_url: NullableStringSchema,
  collector_number: NullableStringSchema,
  group_id: t.Number(),
  set_code: NullableStringSchema,
});

export const ReconciliationGalleryCardSchema = t.Object({
  riftbound_id: t.String(),
  name: t.String(),
  public_code: NullableStringSchema,
  set_code: NullableStringSchema,
  set_name: t.Optional(NullableStringSchema),
  collector_number: NullableStringSchema,
  rarity: NullableStringSchema,
  type: NullableStringSchema,
  image_url: NullableStringSchema,
  energy: t.Optional(NullableNumberSchema),
  might: t.Optional(NullableNumberSchema),
  power: t.Optional(NullableNumberSchema),
  text: t.Optional(NullableStringSchema),
  might_bonus: t.Optional(NullableNumberSchema),
  equipment: t.Optional(NullableStringSchema),
  signature: t.Optional(t.Boolean()),
  special_collection: t.Optional(t.Boolean()),
  alternate_art: t.Optional(t.Boolean()),
  is_token: t.Optional(t.Boolean()),
});

export const ReconciliationEntrySchema = t.Object({
  id: t.String(),
  kind: ReconciliationKindSchema,
  source: ReconciliationSourceSchema,
  fingerprint: t.String(),
  status: ReconciliationStatusSchema,
  payload: t.Object({
    product: t.Optional(ReconciliationProductSchema),
    gallery: t.Optional(ReconciliationGalleryCardSchema),
    field: t.Optional(ReconciliationFieldSchema),
    current_value: t.Optional(NullableStringSchema),
    proposed_value: t.Optional(NullableStringSchema),
    printing_id: t.Optional(t.String()),
    oracle_id: t.Optional(t.String()),
    printing_name: t.Optional(t.String()),
  }),
  proposed_printing_id: NullableStringSchema,
  proposed_oracle_id: NullableStringSchema,
  note: NullableStringSchema,
  resolved_by: NullableStringSchema,
  resolved_at: NullableStringSchema,
  created_at: t.String(),
  last_seen_at: t.String(),
});

// A union of literals, not t.UnionEnum: Elysia fills a UnionEnum's first member
// in when the key is absent, which would silently filter an unfiltered request.
export const PrintingStateQuerySchema = t.Union(
  ADMIN_PRINTING_STATES.map((state) => t.Literal(state)),
);

export const PrintingListEntrySchema = t.Object({
  id: t.String(),
  name: t.String(),
  oracle_id: t.String(),
  is_token: t.Boolean(),
  set_code: NullableStringSchema,
  collector_number: NullableStringSchema,
  rarity: NullableStringSchema,
  public_slug: t.String(),
  source: t.String(),
  deleted_at: NullableStringSchema,
  locked_fields: t.Array(t.String()),
  oracle_locked_fields: t.Array(t.String()),
  delta_source: t.Union([t.Literal("ingest"), t.Literal("admin"), t.Null()]),
  has_hosted_image: t.Boolean(),
});

export const StatsResponseSchema = t.Object({
  sets: t.Number(),
  oracles: t.Number(),
  printings: t.Number(),
  pending_review: t.Number(),
});

export const PrintingListResponseSchema = t.Object({
  printings: t.Array(PrintingListEntrySchema),
  total: t.Number(),
  limit: t.Number(),
  offset: t.Number(),
});

export const ReconciliationListResponseSchema = t.Object({
  entries: t.Array(ReconciliationEntrySchema),
  total: t.Number(),
  counts: t.Object({
    pending: t.Number(),
    confirmed: t.Number(),
    dismissed: t.Number(),
  }),
  limit: t.Number(),
  offset: t.Number(),
});

export const ReconciliationMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  entry_id: t.String(),
  status: t.UnionEnum(["confirmed", "dismissed"]),
  printing_id: NullableStringSchema,
  oracle_id: NullableStringSchema,
});

export const ImageMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  printing_id: t.String(),
  source_url: t.String(),
  source_hash: t.String(),
  queued: t.Boolean(),
});

export const AdminErrorResponses = {
  400: ErrorSchema,
  401: ErrorSchema,
  403: ErrorSchema,
  404: ErrorSchema,
  409: ErrorSchema,
  500: ErrorSchema,
  503: ErrorSchema,
};
