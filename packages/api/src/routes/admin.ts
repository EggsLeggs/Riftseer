import { Elysia, t } from "elysia";
import {
  adminUploadObjectKey,
  buildPublicSlugSegments,
  generateOracleSlug,
  generatePublicSlug,
  joinPublicSlug,
  normalizeCardName,
  slugifyCardName,
  type SlugPrinting,
} from "@riftseer/types";
import { authAdminClient } from "../lib/supabase";
import { oracleKeyForName } from "@riftseer/types/oracle";
import { isConfirmableReconciliationField } from "@riftseer/types/reconciliation";
import {
  AdminRepositoryError,
  createAdminDataRepository,
  type AdminDataRepository,
  type AdminReconciliationEntry,
  type AdminRpcResult,
} from "../lib/admin-data";
import {
  adminPlugin,
  createAdminPlugin,
} from "../plugins/admin-auth";
import {
  BadCardSearchQueryError,
  CARD_SEARCH_LIMITS,
  parseCardSearchQuery,
} from "@riftseer/core";
import { ErrorSchema } from "../schemas";

const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";
const NON_BLANK_PATTERN = ".*\\S.*";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const AUDIT_LOG_MAX_LIMIT = 200;
const RECONCILIATION_MAX_LIMIT = 200;
const ADMIN_IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

const NullableStringSchema = t.Nullable(t.String());
const NullableNumberSchema = t.Nullable(t.Number());

// ─── Oracle bodies ────────────────────────────────────────────────────────────
//
// The keys are the RPC's column names, not the public payload's nesting:
// `admin_patch_oracle` takes a flat jsonb of column → value, and translating
// between two vocabularies in the route was where the old admin surface kept
// going wrong.

const AdminOracleFields = {
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

const NameSchema = t.String({
  minLength: 1,
  maxLength: 300,
  pattern: NON_BLANK_PATTERN,
});

const AdminOraclePatchSchema = t.Object({
  name: t.Optional(NameSchema),
  ...AdminOracleFields,
});

const AdminOracleDefinitionSchema = t.Object({
  name: NameSchema,
  ...AdminOracleFields,
});

const RelationshipKindSchema = t.UnionEnum([
  "makes_token",
  "character",
  "signature",
]);

const AdminRelationshipEntrySchema = t.Object({
  kind: RelationshipKindSchema,
  to_oracle_id: t.String({ format: "uuid" }),
});

const AdminRelationshipEdgeSchema = t.Object({
  kind: RelationshipKindSchema,
  oracle_id: t.String(),
  name: t.String(),
  slug: t.String(),
  source: t.UnionEnum(["ingest", "admin"]),
});

const AdminOracleRelationshipsResponseSchema = t.Object({
  oracle_id: t.String(),
  outgoing: t.Array(AdminRelationshipEdgeSchema),
  incoming: t.Array(AdminRelationshipEdgeSchema, {
    description: "Edges pointing at this oracle — a reverse view, not stored rows.",
  }),
});

// ─── Printing bodies ──────────────────────────────────────────────────────────

const AdminPrintingFields = {
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

const SetCodeSchema = t.String({
  minLength: 1,
  maxLength: 32,
  pattern: NON_BLANK_PATTERN,
});

const AdminPrintingPatchSchema = t.Object({
  set_code: t.Optional(SetCodeSchema),
  ...AdminPrintingFields,
});

const AdminPrintingDefinitionSchema = t.Object(AdminPrintingFields);

/**
 * The same delta mechanism ingest uses, written by hand. Arrays add and remove;
 * scalars override or clear, because there is nothing to "add to" a rules text
 * and NULL in an override column already means inherit.
 */
const AdminPrintingDeltaSchema = t.Partial(
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

const AdminSetFields = {
  set_uri: t.Optional(NullableStringSchema),
  set_search_uri: t.Optional(NullableStringSchema),
  published_on: t.Optional(t.Nullable(t.String({ pattern: DATE_PATTERN }))),
  is_promo: t.Optional(t.Boolean()),
  parent_set_code: t.Optional(NullableStringSchema),
};

const SetNameSchema = t.String({
  minLength: 1,
  maxLength: 200,
  pattern: NON_BLANK_PATTERN,
});

const AdminSetPatchSchema = t.Object({
  set_name: t.Optional(SetNameSchema),
  ...AdminSetFields,
});

const AdminSetDefinitionSchema = t.Object({
  set_name: SetNameSchema,
  ...AdminSetFields,
});

// ─── Mutation responses ───────────────────────────────────────────────────────

const OracleMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  oracle_id: t.String(),
});

const PrintingMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  printing_id: t.String(),
});

const SlugMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  printing_id: t.String(),
  public_slug: t.String(),
});

const SetMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  set_code: t.String(),
});

const AuditEntrySchema = t.Object({
  id: t.Number(),
  actor_id: t.String(),
  action: t.String(),
  target_type: t.String(),
  target_id: t.Nullable(t.String()),
  detail: t.Record(t.String(), t.Unknown()),
  created_at: t.String(),
});

const AuditLogResponseSchema = t.Object({
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
const FORMAT_CODE_PATTERN = "^[A-Za-z0-9][A-Za-z0-9_-]*$";

const LegalityStatusSchema = t.UnionEnum(["legal", "not_legal", "banned"]);

/**
 * `default` clears the stored row rather than writing a status: absence of an
 * oracle-level row *is* legal, so this is how a format goes back to unmarked.
 */
const LegalityStatusInputSchema = t.UnionEnum([
  "legal",
  "not_legal",
  "banned",
  "default",
]);

const RulingTypeSchema = t.UnionEnum(["ruling", "note"]);

const AdminFormatSchema = t.Object({
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
});

const AdminFormatListResponseSchema = t.Object({
  formats: t.Array(AdminFormatSchema),
});

const FormatMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  code: t.String(),
});

const FormatDeleteResponseSchema = t.Object({
  ok: t.Literal(true),
  code: t.String(),
  legalities_removed: t.Number(),
  overrides_removed: t.Number(),
});

const AdminPrintingLegalitiesResponseSchema = t.Object({
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
    }),
  ),
});

const LegalityMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  printing_id: t.String(),
  format_code: t.String(),
  scope: t.UnionEnum(["printing", "oracle"]),
  status: t.Nullable(LegalityStatusSchema),
});

const AdminPrintingRulingsResponseSchema = t.Object({
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
const RulingTargetInputSchema = t.Union([
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

const RulingTargetSchema = t.Object({
  id: t.String(),
  kind: t.UnionEnum(["oracle", "printing", "query"]),
  oracle_id: t.Nullable(t.String()),
  printing_id: t.Nullable(t.String()),
  query: t.Nullable(t.String()),
  match_count: t.Nullable(t.Number()),
});

const RulingSchema = t.Object({
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

const RulingsPageSchema = t.Object({
  rulings: t.Array(RulingSchema),
  total: t.Number(),
});

const RulingRecordResponseSchema = t.Object({
  ok: t.Literal(true),
  ruling: t.Unknown(),
});

const RulePreviewResponseSchema = t.Object({
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

type RulingTargetInput =
  | { kind: "oracle"; oracle_id: string }
  | { kind: "printing"; printing_id: string }
  | { kind: "query"; query: string };

/**
 * Map target inputs to the RPC payload, parsing every rule query up front.
 *
 * Returns a `FailureResponse` instead of throwing so a bad query reports which
 * one failed and why — an admin editing four rules needs to know which of them
 * is wrong, not just that something is.
 */
function buildRulingTargets(
  inputs: readonly RulingTargetInput[],
):
  | { targets: Array<Record<string, unknown>> }
  | { error: FailureResponse } {
  if (inputs.length === 0) {
    return {
      error: {
        status: 400,
        body: {
          error: "A ruling needs at least one target",
          code: "RULING_TARGETS_REQUIRED",
        },
      },
    };
  }

  const targets: Array<Record<string, unknown>> = [];
  for (const input of inputs) {
    if (input.kind === "oracle") {
      targets.push({ kind: "oracle", oracle_id: input.oracle_id.trim() });
      continue;
    }
    if (input.kind === "printing") {
      targets.push({ kind: "printing", printing_id: input.printing_id.trim() });
      continue;
    }

    const query = input.query.trim();
    let ast: unknown;
    try {
      ast = parseCardSearchQuery(query).ast;
    } catch (err) {
      return {
        error: {
          status: 400,
          body: {
            error:
              err instanceof BadCardSearchQueryError
                ? `Rule "${query}": ${err.message}`
                : `Rule "${query}" could not be parsed`,
            code: "RULING_RULE_INVALID",
          },
        },
      };
    }
    // A query that parses to nothing (whitespace, or only stripped tokens) would
    // render as `true` and silently attach the ruling to the entire catalogue.
    if (!ast) {
      return {
        error: {
          status: 400,
          body: {
            error: `Rule "${query}" does not select anything`,
            code: "RULING_RULE_EMPTY",
          },
        },
      };
    }
    targets.push({ kind: "query", query, ast });
  }
  return { targets };
}

// ─── Reconciliation queue ─────────────────────────────────────────────────────

const ReconciliationKindSchema = t.UnionEnum([
  "unmatched_product",
  "field_diff",
  "missing_printing",
  "unmatched_oracle",
]);

const ReconciliationSourceSchema = t.UnionEnum(["tcgplayer", "gallery"]);

const ReconciliationStatusSchema = t.UnionEnum([
  "pending",
  "confirmed",
  "dismissed",
]);

const ReconciliationFieldSchema = t.UnionEnum([
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
const ReconciliationStatusQuerySchema = t.Union([
  t.Literal("pending"),
  t.Literal("confirmed"),
  t.Literal("dismissed"),
]);

const ReconciliationKindQuerySchema = t.Union([
  t.Literal("unmatched_product"),
  t.Literal("field_diff"),
  t.Literal("missing_printing"),
  t.Literal("unmatched_oracle"),
]);

const ReconciliationSourceQuerySchema = t.Union([
  t.Literal("tcgplayer"),
  t.Literal("gallery"),
]);

const ReconciliationProductSchema = t.Object({
  product_id: t.Number(),
  name: t.String(),
  url: t.String(),
  image_url: NullableStringSchema,
  collector_number: NullableStringSchema,
  group_id: t.Number(),
  set_code: NullableStringSchema,
});

const ReconciliationGalleryCardSchema = t.Object({
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

const ReconciliationEntrySchema = t.Object({
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
    card_name: t.Optional(t.String()),
  }),
  proposed_printing_id: NullableStringSchema,
  proposed_oracle_id: NullableStringSchema,
  note: NullableStringSchema,
  resolved_by: NullableStringSchema,
  resolved_at: NullableStringSchema,
  created_at: t.String(),
  last_seen_at: t.String(),
});

const ReconciliationListResponseSchema = t.Object({
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

const ReconciliationMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  entry_id: t.String(),
  status: t.UnionEnum(["confirmed", "dismissed"]),
  printing_id: NullableStringSchema,
  oracle_id: NullableStringSchema,
});

const ImageMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  printing_id: t.String(),
  source_url: t.String(),
  source_hash: t.String(),
  queued: t.Boolean(),
});

const AdminErrorResponses = {
  400: ErrorSchema,
  401: ErrorSchema,
  403: ErrorSchema,
  404: ErrorSchema,
  409: ErrorSchema,
  500: ErrorSchema,
  503: ErrorSchema,
};

export interface AdminImageJob {
  version: 1;
  printingId: string;
  sourceUrl: string;
  sourceHash: string;
  sourceProvider: "admin";
}

export interface AdminImageBindings {
  bucket: {
    put(
      key: string,
      value: ArrayBuffer,
      options: {
        httpMetadata: {
          contentType: string;
          cacheControl: string;
        };
        customMetadata: Record<string, string>;
      },
    ): Promise<unknown>;
    delete(key: string): Promise<void>;
  };
  queue: {
    send(job: AdminImageJob): Promise<unknown>;
  };
  baseUrl: string;
}

export interface AdminRoutesOptions {
  repository?: AdminDataRepository | null;
  imageBindings?: AdminImageBindings | null;
  adminAuthPlugin?: ReturnType<typeof createAdminPlugin>;
}

interface FailureResponse {
  status: 400 | 404 | 409;
  body: {
    error: string;
    code: string;
  };
}

type SafeResult<T> =
  | { data: T }
  | {
      error: {
        status: 409 | 500;
        body: {
          error: string;
          code: string;
        };
      };
    };

function mutationFailure(result: AdminRpcResult): FailureResponse | null {
  if (result.ok) return null;

  switch (result.reason) {
    case "oracle_not_found":
      return {
        status: 404,
        body: { error: "Card not found", code: "ORACLE_NOT_FOUND" },
      };
    case "printing_not_found":
      return {
        status: 404,
        body: { error: "Printing not found", code: "PRINTING_NOT_FOUND" },
      };
    case "related_oracle_not_found":
      return {
        status: 404,
        body: {
          error: "Related card not found",
          code: "RELATED_ORACLE_NOT_FOUND",
        },
      };
    case "set_not_found":
      return {
        status: 404,
        body: { error: "Set not found", code: "SET_NOT_FOUND" },
      };
    case "format_not_found":
      return {
        status: 404,
        body: { error: "Format not found", code: "FORMAT_NOT_FOUND" },
      };
    case "ruling_not_found":
      return {
        status: 404,
        body: { error: "Ruling not found", code: "RULING_NOT_FOUND" },
      };
    case "reconciliation_entry_not_found":
      return {
        status: 404,
        body: {
          error: "Review entry not found",
          code: "REVIEW_ENTRY_NOT_FOUND",
        },
      };
    case "oracle_exists":
      return {
        status: 409,
        body: { error: "Card already exists", code: "ORACLE_EXISTS" },
      };
    case "printing_exists":
      return {
        status: 409,
        body: { error: "Printing id already exists", code: "PRINTING_EXISTS" },
      };
    case "set_exists":
      return {
        status: 409,
        body: { error: "Set already exists", code: "SET_EXISTS" },
      };
    case "format_exists":
      return {
        status: 409,
        body: { error: "Format code already exists", code: "FORMAT_EXISTS" },
      };
    case "slug_taken":
      return {
        status: 409,
        body: { error: "That slug is already in use", code: "SLUG_TAKEN" },
      };
    case "set_not_empty":
      return {
        status: 409,
        body: {
          error: "Move or delete every printing in the set first",
          code: "SET_NOT_EMPTY",
        },
      };
    case "reconciliation_entry_resolved":
      return {
        status: 409,
        body: {
          error: "Review entry has already been resolved",
          code: "REVIEW_ENTRY_RESOLVED",
        },
      };
    case "invalid_kind":
      return {
        status: 400,
        body: {
          error: "Unsupported relationship kind",
          code: "INVALID_RELATIONSHIP_KIND",
        },
      };
    case "self_relation":
      return {
        status: 400,
        body: {
          error: "A card cannot be related to itself",
          code: "SELF_RELATIONSHIP",
        },
      };
    default:
      return {
        status: 400,
        body: {
          error: "Admin mutation was rejected",
          code: "ADMIN_MUTATION_REJECTED",
        },
      };
  }
}

async function safely<T>(
  action: string,
  operation: () => Promise<T>,
): Promise<SafeResult<T>> {
  try {
    return { data: await operation() };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown admin operation error";
    const databaseCode =
      error instanceof AdminRepositoryError
        ? error.databaseCode
        : undefined;
    console.error(
      JSON.stringify({
        message: "admin operation failed",
        action,
        error: message,
        databaseCode,
      }),
    );
    const isConflict = databaseCode === "23505";
    return {
      error: {
        status: isConflict ? 409 : 500,
        body: isConflict
          ? {
              error: "Admin mutation conflicts with existing data",
              code: "ADMIN_CONFLICT",
            }
          : {
              error: "Admin operation failed",
              code: "ADMIN_OPERATION_FAILED",
            },
      },
    };
  }
}

/**
 * What a confirmation applies, split by which table owns the field — printed
 * facts go to the printing, rules-object facts to the oracle.
 *
 * Built here rather than in SQL so the coercion rules stay in one place and the
 * RPC never has to interpret a payload shape. Returns null when the payload
 * carries a field this API cannot apply.
 */
interface ConfirmPatch {
  printing: Record<string, unknown>;
  oracle: Record<string, unknown>;
}

function buildConfirmPatch(entry: AdminReconciliationEntry): ConfirmPatch | null {
  const payload = entry.payload;
  const nothing: ConfirmPatch = { printing: {}, oracle: {} };

  // Confirming an unmatched product is what "creates a persistent link": the
  // tcgplayer_id lands in the printing's locked_fields, so the next ingest
  // matches it automatically and the product stops being unmatched.
  if (entry.kind === "unmatched_product") {
    if (!payload.product) return null;
    return {
      oracle: {},
      printing: {
        tcgplayer_id: String(payload.product.product_id),
        tcgplayer_url: payload.product.url,
      },
    };
  }

  // A gallery card we hold no printing (or no oracle) for. There is nothing to
  // patch — an admin creates the row by hand; confirming records the gap as
  // handled so the entry does not resurface.
  if (entry.kind === "missing_printing" || entry.kind === "unmatched_oracle") {
    return nothing;
  }

  // The shared list the admin UI disables Confirm from, so the button and this
  // switch cannot disagree about what is applicable.
  if (!isConfirmableReconciliationField(payload.field)) return null;

  const value = payload.proposed_value ?? null;
  switch (payload.field) {
    case "collector_number":
      return { ...nothing, printing: { collector_number: value } };
    case "released_at":
      return { ...nothing, printing: { released_at: value } };
    case "rarity":
      return { ...nothing, printing: { rarity: value } };
    case "type":
      return { ...nothing, oracle: { card_type: value } };
    // Stats are numbers on the oracle but text in the payload, and a value that
    // does not parse must not become a NaN or a null on a real card.
    case "energy":
    case "might":
    case "power": {
      const numeric = value === null ? null : Number(value);
      if (numeric !== null && !Number.isFinite(numeric)) return null;
      return { ...nothing, oracle: { [payload.field]: numeric } };
    }
    // Unreachable while every confirmable field has a case above; the contract
    // test in `__tests__/routes/admin.test.ts` is what keeps that true.
    default:
      return null;
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("CARD_IMAGE_BASE_URL must use HTTP or HTTPS");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

async function sha256Hex(value: ArrayBuffer | Uint8Array): Promise<string> {
  // A `Uint8Array` is typed over `ArrayBufferLike`, which the DOM lib's
  // `BufferSource` rejects because it admits `SharedArrayBuffer`. Every runtime
  // we target accepts the view as-is, and copying would clone whole uploads, so
  // assert the contract rather than reallocating.
  const digest = await crypto.subtle.digest("SHA-256", value as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function sourceHash(sourceUrl: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(sourceUrl));
}

function detectAdminImageType(bytes: ArrayBuffer): string | null {
  const value = new Uint8Array(bytes);
  if (
    value.length >= 8 &&
    value[0] === 0x89 &&
    value[1] === 0x50 &&
    value[2] === 0x4e &&
    value[3] === 0x47 &&
    value[4] === 0x0d &&
    value[5] === 0x0a &&
    value[6] === 0x1a &&
    value[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    value.length >= 3 &&
    value[0] === 0xff &&
    value[1] === 0xd8 &&
    value[2] === 0xff
  ) {
    return "image/jpeg";
  }

  const ascii = (start: number, end: number) =>
    String.fromCharCode(...value.slice(start, end));
  if (
    value.length >= 6 &&
    (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")
  ) {
    return "image/gif";
  }
  if (
    value.length >= 12 &&
    ascii(0, 4) === "RIFF" &&
    ascii(8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    value.length >= 12 &&
    ascii(4, 8) === "ftyp" &&
    (ascii(8, 12) === "avif" || ascii(8, 12) === "avis")
  ) {
    return "image/avif";
  }
  return null;
}

async function cleanupUpload(
  bindings: AdminImageBindings,
  key: string,
): Promise<void> {
  try {
    await bindings.bucket.delete(key);
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "admin image cleanup failed",
        key,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

export function adminRoutes(options: AdminRoutesOptions = {}) {
  const repository =
    options.repository ??
    (authAdminClient
      ? createAdminDataRepository(authAdminClient)
      : null);
  const imageBindings = options.imageBindings ?? null;
  const routeAdminPlugin = options.adminAuthPlugin ?? adminPlugin;

  // There is no API-side rule-rematch call any more: every mutating RPC that can
  // move a printing into or out of a rule's reach — admin_patch_oracle,
  // admin_patch_printing, admin_create_printing, admin_set_printing_delta,
  // admin_restore_printing — calls refresh_ruling_matches_for_printing itself
  // before returning, inside the same transaction as the write.

  return new Elysia({ prefix: "/admin" })
    .use(routeAdminPlugin)
    .onError(({ code, error, status }) => {
      if (
        code === "VALIDATION" ||
        code === "PARSE" ||
        String(code).startsWith("INVALID_")
      ) {
        return status(400, {
          error: "Invalid admin request",
          code: "INVALID_REQUEST",
        });
      }
      if (code === "NOT_FOUND") {
        return status(404, {
          error: "Admin endpoint not found",
          code: "NOT_FOUND",
        });
      }
      console.error(
        JSON.stringify({
          message: "unhandled admin route error",
          code,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return status(500, {
        error: "Admin operation failed",
        code: "ADMIN_OPERATION_FAILED",
      });
    })
    .get(
      "/audit-log",
      async ({ query, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }

        const limit = Math.min(
          Math.max(Number.parseInt(query.limit ?? "50", 10) || 50, 1),
          AUDIT_LOG_MAX_LIMIT,
        );
        const offset = Math.max(
          Number.parseInt(query.offset ?? "0", 10) || 0,
          0,
        );

        const result = await safely("audit_log.list", () =>
          repository.listAuditLog({
            limit,
            offset,
            action: query.action?.trim() || undefined,
            targetType: query.target_type?.trim() || undefined,
            targetId: query.target_id?.trim() || undefined,
            actorId: query.actor_id?.trim() || undefined,
          }),
        );
        if ("error" in result) {
          return status(result.error.status, result.error.body);
        }

        return {
          entries: result.data.entries,
          total: result.data.total,
          limit,
          offset,
        };
      },
      {
        query: t.Object({
          limit: t.Optional(t.String()),
          offset: t.Optional(t.String()),
          action: t.Optional(t.String({ maxLength: 100 })),
          target_type: t.Optional(t.String({ maxLength: 50 })),
          target_id: t.Optional(t.String({ maxLength: 128 })),
          actor_id: t.Optional(t.String({ maxLength: 64 })),
        }),
        response: {
          200: AuditLogResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Read the admin audit log",
          description:
            "Returns admin mutations newest first, optionally filtered by action, target, or actor.",
        },
      },
    )

    // ── Review queue ──────────────────────────────────────────────────────────
    .get(
      "/reconciliation",
      async ({ query, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }

        const limit = Math.min(
          Math.max(Number.parseInt(query.limit ?? "50", 10) || 50, 1),
          RECONCILIATION_MAX_LIMIT,
        );
        const offset = Math.max(
          Number.parseInt(query.offset ?? "0", 10) || 0,
          0,
        );

        const result = await safely("reconciliation.list", () =>
          repository.listReconciliation({
            limit,
            offset,
            // Default to the only actionable status — the review page opens on
            // work to do, not on a history of everything ever dismissed.
            status: query.status ?? "pending",
            kind: query.kind,
            source: query.source,
          }),
        );
        if ("error" in result) {
          return status(result.error.status, result.error.body);
        }

        return {
          entries: result.data.entries,
          total: result.data.total,
          counts: result.data.counts,
          limit,
          offset,
        };
      },
      {
        query: t.Object({
          limit: t.Optional(t.String()),
          offset: t.Optional(t.String()),
          status: t.Optional(ReconciliationStatusQuerySchema),
          kind: t.Optional(ReconciliationKindQuerySchema),
          source: t.Optional(ReconciliationSourceQuerySchema),
        }),
        response: {
          200: ReconciliationListResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "List review-queue entries",
          description:
            "What ingest could not reconcile: TCGPlayer products that match no printing, printings and cards the official gallery lists that we do not hold, and field disagreements from either source. Defaults to pending entries, newest first.",
        },
      },
    )
    .post(
      "/reconciliation/:id/confirm",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }

        const entryResult = await safely("reconciliation.confirm.load", () =>
          repository.getReconciliationEntry(params.id),
        );
        if ("error" in entryResult) {
          return status(entryResult.error.status, entryResult.error.body);
        }
        if (!entryResult.data) {
          return status(404, {
            error: "Review entry not found",
            code: "REVIEW_ENTRY_NOT_FOUND",
          });
        }
        const entry = entryResult.data;

        const patch = buildConfirmPatch(entry);
        if (!patch) {
          return status(400, {
            error: "This entry proposes a field the API cannot apply",
            code: "REVIEW_FIELD_UNSUPPORTED",
          });
        }

        const printingId =
          body?.printing_id?.trim() || entry.proposed_printing_id || null;
        const oracleId =
          body?.oracle_id?.trim() || entry.proposed_oracle_id || null;

        const hasOraclePatch = Object.keys(patch.oracle).length > 0;
        const hasPrintingPatch = Object.keys(patch.printing).length > 0;
        if (hasPrintingPatch && !printingId) {
          return status(400, {
            error: "Choose a printing to apply this to",
            code: "REVIEW_TARGET_REQUIRED",
          });
        }
        if (hasOraclePatch && !oracleId) {
          return status(400, {
            error: "Choose a card to apply this to",
            code: "REVIEW_TARGET_REQUIRED",
          });
        }

        // An oracle field cannot ride along on admin_resolve_reconciliation_entry,
        // which only knows how to patch a printing. It is applied first so a
        // failure leaves the entry pending rather than closing it over a write
        // that never landed.
        if (hasOraclePatch) {
          const oracleResult = await safely("reconciliation.confirm.oracle", () =>
            repository.callRpc("admin_patch_oracle", {
              p_oracle_id: oracleId,
              p_patch: patch.oracle,
              p_actor: adminUser.id,
            }),
          );
          if ("error" in oracleResult) {
            return status(oracleResult.error.status, oracleResult.error.body);
          }
          const oracleFailure = mutationFailure(oracleResult.data);
          if (oracleFailure) {
            return status(oracleFailure.status, oracleFailure.body);
          }
        }

        const rpcResult = await safely("reconciliation.confirm", () =>
          repository.callRpc("admin_resolve_reconciliation_entry", {
            p_entry_id: params.id,
            p_action: "confirm",
            p_printing_id: hasPrintingPatch ? printingId : null,
            p_patch: patch.printing,
            p_note: body?.note ?? null,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);

        return {
          ok: true as const,
          entry_id: params.id,
          status: "confirmed" as const,
          printing_id: hasPrintingPatch ? printingId : null,
          oracle_id: hasOraclePatch ? oracleId : null,
        };
      },
      {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        body: t.Optional(
          t.Object({
            /** Overrides ingest's suggestion; required when it made none. */
            printing_id: t.Optional(
              t.String({
                minLength: 1,
                maxLength: 128,
                pattern: NON_BLANK_PATTERN,
              }),
            ),
            oracle_id: t.Optional(t.String({ format: "uuid" })),
            note: t.Optional(t.String({ maxLength: 2000 })),
          }),
        ),
        response: {
          200: ReconciliationMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Confirm a review entry",
          description:
            "Applies the proposal through the normal admin path — so it lands in locked_fields and survives the next ingest — and closes the entry. Printed fields go to the printing; rules-object fields go to the oracle.",
        },
      },
    )
    .post(
      "/reconciliation/:id/dismiss",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }

        const rpcResult = await safely("reconciliation.dismiss", () =>
          repository.callRpc("admin_resolve_reconciliation_entry", {
            p_entry_id: params.id,
            p_action: "dismiss",
            p_printing_id: null,
            p_patch: {},
            p_note: body?.note ?? null,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);

        return {
          ok: true as const,
          entry_id: params.id,
          status: "dismissed" as const,
          printing_id: null,
          oracle_id: null,
        };
      },
      {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        body: t.Optional(
          t.Object({
            note: t.Optional(t.String({ maxLength: 2000 })),
          }),
        ),
        response: {
          200: ReconciliationMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Dismiss a review entry",
          description:
            "Closes the entry without touching any card. The dismissal is durable, so later ingests do not resurface it.",
        },
      },
    )

    // ── Oracles ───────────────────────────────────────────────────────────────
    .post(
      "/oracles",
      async ({ body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }

        const name = body.definition.name.trim();
        const takenResult = await safely("oracle.create.load_slugs", () =>
          repository.getTakenOracleSlugs(slugifyCardName(name) || "card"),
        );
        if ("error" in takenResult) {
          return status(takenResult.error.status, takenResult.error.body);
        }

        const rpcResult = await safely("oracle.create", () =>
          repository.callRpc("admin_create_oracle", {
            p_oracle_key: oracleKeyForName(name),
            p_slug: generateOracleSlug(name, (slug) =>
              takenResult.data.has(slug),
            ),
            p_definition: {
              ...body.definition,
              name,
              name_normalized: normalizeCardName(name),
            },
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);

        return {
          ok: true as const,
          oracle_id: String(rpcResult.data.oracle_id ?? ""),
        };
      },
      {
        body: t.Object({ definition: AdminOracleDefinitionSchema }),
        response: {
          200: OracleMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Create a card",
          description:
            "Creates a manual oracle — the rules object. Printings are added separately with POST /admin/printings.",
        },
      },
    )
    .patch(
      "/oracles/:id",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        if (Object.keys(body.patch).length === 0) {
          return status(400, {
            error: "Patch must contain at least one field",
            code: "EMPTY_PATCH",
          });
        }

        const patch: Record<string, unknown> = { ...body.patch };
        if (typeof body.patch.name === "string") {
          const name = body.patch.name.trim();
          patch.name = name;
          // Both derived values are computed here, never in SQL, so the
          // normalization rules live in exactly one place. The slug is
          // deliberately not regenerated: a public URL does not move because a
          // typo was fixed.
          patch.name_normalized = normalizeCardName(name);
          patch.oracle_key = oracleKeyForName(name);
        }

        const rpcResult = await safely("oracle.patch", () =>
          repository.callRpc("admin_patch_oracle", {
            p_oracle_id: params.id,
            p_patch: patch,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, oracle_id: params.id };
      },
      {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        body: t.Object({ patch: AdminOraclePatchSchema }),
        response: {
          200: OracleMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Patch a card",
          description:
            "Updates the rules object. Every patched key is added to locked_fields, which is what makes the edit survive the next ingest.",
        },
      },
    )
    .delete(
      "/oracles/:id",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const rpcResult = await safely("oracle.delete", () =>
          repository.callRpc("admin_delete_oracle", {
            p_oracle_id: params.id,
            p_reason: body?.reason ?? null,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, oracle_id: params.id };
      },
      {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        body: t.Optional(
          t.Object({ reason: t.Optional(t.String({ maxLength: 2000 })) }),
        ),
        response: {
          200: OracleMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Delete a card",
          description:
            "Soft-deletes the oracle and every printing of it. `deleted_at` both hides the row from readers and stops ingest resurrecting it.",
        },
      },
    )
    .post(
      "/oracles/:id/restore",
      async ({ params, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const rpcResult = await safely("oracle.restore", () =>
          repository.callRpc("admin_restore_oracle", {
            p_oracle_id: params.id,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, oracle_id: params.id };
      },
      {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        response: {
          200: OracleMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Restore a deleted card",
          description:
            "Clears `deleted_at` on the oracle and its printings and rebuilds the projection.",
        },
      },
    )
    .get(
      "/oracles/:id/relationships",
      async ({ params, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const result = await safely("oracle.relationships.list", () =>
          repository.listOracleRelationships(params.id),
        );
        if ("error" in result) {
          return status(result.error.status, result.error.body);
        }
        if (!result.data) {
          return status(404, {
            error: "Card not found",
            code: "ORACLE_NOT_FOUND",
          });
        }
        return result.data;
      },
      {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        response: {
          200: AdminOracleRelationshipsResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Read a card's relationship edges",
          description:
            "Outgoing edges are the stored rows; incoming ones are the reverse view — `used_by` is not separately stored.",
        },
      },
    )
    .put(
      "/oracles/:id/relationships",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const identities = new Set<string>();
        for (const entry of body.entries) {
          if (entry.to_oracle_id === params.id) {
            return status(400, {
              error: "A card cannot be related to itself",
              code: "SELF_RELATIONSHIP",
            });
          }
          const identity = `${entry.kind}\0${entry.to_oracle_id}`;
          if (identities.has(identity)) {
            return status(400, {
              error: "Relationship entries must be unique by kind and target",
              code: "DUPLICATE_RELATIONSHIP",
            });
          }
          identities.add(identity);
        }

        const rpcResult = await safely("oracle.relationships", () =>
          repository.callRpc("admin_set_oracle_relationships", {
            p_oracle_id: params.id,
            p_entries: body.entries,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, oracle_id: params.id };
      },
      {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        body: t.Object({
          entries: t.Array(AdminRelationshipEntrySchema, { maxItems: 500 }),
        }),
        response: {
          200: OracleMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Replace a card's relationship edges",
          description:
            "Full replacement of this oracle's outgoing edges, which also locks them against ingest. Oracle scope only — a relationship is a property of the rules object, so there is no per-printing exception to express.",
        },
      },
    )

    // ── Printings ─────────────────────────────────────────────────────────────
    .post(
      "/printings",
      async ({ body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }

        const printingId = body.id.trim();
        const setCode = body.set_code.trim().toUpperCase();

        const nameResult = await safely("printing.create.load_oracle", () =>
          repository.getOracleName(body.oracle_id),
        );
        if ("error" in nameResult) {
          return status(nameResult.error.status, nameResult.error.body);
        }
        if (!nameResult.data) {
          return status(404, {
            error: "Card not found",
            code: "ORACLE_NOT_FOUND",
          });
        }

        const slugPrinting: SlugPrinting = {
          id: printingId,
          name: nameResult.data,
          setCode,
          collectorNumber: body.definition.collector_number ?? undefined,
          alternateArt: body.definition.is_alternate_art ?? false,
          signature: body.definition.is_signature ?? false,
        };
        const takenResult = await safely("printing.create.load_slugs", () =>
          repository.getTakenPrintingSlugs(
            joinPublicSlug(buildPublicSlugSegments(slugPrinting)),
          ),
        );
        if ("error" in takenResult) {
          return status(takenResult.error.status, takenResult.error.body);
        }

        const rpcResult = await safely("printing.create", () =>
          repository.callRpc("admin_create_printing", {
            p_printing_id: printingId,
            p_oracle_id: body.oracle_id,
            p_set_code: setCode,
            p_public_slug: generatePublicSlug(slugPrinting, (slug) =>
              takenResult.data.has(slug),
            ),
            p_definition: body.definition,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, printing_id: printingId };
      },
      {
        body: t.Object({
          id: t.String({
            minLength: 1,
            maxLength: 128,
            pattern: NON_BLANK_PATTERN,
          }),
          oracle_id: t.String({ format: "uuid" }),
          set_code: SetCodeSchema,
          definition: AdminPrintingDefinitionSchema,
        }),
        response: {
          200: PrintingMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Create a printing",
          description:
            "Adds a physical printing to an existing card. The public slug is generated from the shared slug rules and pinned.",
        },
      },
    )
    .patch(
      "/printings/:id",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        if (Object.keys(body.patch).length === 0) {
          return status(400, {
            error: "Patch must contain at least one field",
            code: "EMPTY_PATCH",
          });
        }

        const patch: Record<string, unknown> = { ...body.patch };
        if (typeof body.patch.set_code === "string") {
          patch.set_code = body.patch.set_code.trim().toUpperCase();
        }

        const rpcResult = await safely("printing.patch", () =>
          repository.callRpc("admin_patch_printing", {
            p_printing_id: params.id,
            p_patch: patch,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, printing_id: params.id };
      },
      {
        body: t.Object({ patch: AdminPrintingPatchSchema }),
        response: {
          200: PrintingMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Patch a printing",
          description:
            "Updates printed fields. `set_code` moves the printing to another set — there is no separate move endpoint.",
        },
      },
    )
    .delete(
      "/printings/:id",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const rpcResult = await safely("printing.delete", () =>
          repository.callRpc("admin_delete_printing", {
            p_printing_id: params.id,
            p_reason: body?.reason ?? null,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, printing_id: params.id };
      },
      {
        body: t.Optional(
          t.Object({ reason: t.Optional(t.String({ maxLength: 2000 })) }),
        ),
        response: {
          200: PrintingMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Delete a printing",
          description:
            "Soft-deletes one printing. The card and its other printings are untouched.",
        },
      },
    )
    .post(
      "/printings/:id/restore",
      async ({ params, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const rpcResult = await safely("printing.restore", () =>
          repository.callRpc("admin_restore_printing", {
            p_printing_id: params.id,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, printing_id: params.id };
      },
      {
        response: {
          200: PrintingMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Restore a deleted printing",
          description: "Clears `deleted_at` and re-evaluates rule-scoped rulings.",
        },
      },
    )
    .post(
      "/printings/:id/regenerate-slug",
      async ({ params, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }

        const printingResult = await safely(
          "printing.regenerate_slug.load",
          () => repository.getSlugPrinting(params.id),
        );
        if ("error" in printingResult) {
          return status(printingResult.error.status, printingResult.error.body);
        }
        const slugPrinting = printingResult.data;
        if (!slugPrinting) {
          return status(404, {
            error: "Printing not found",
            code: "PRINTING_NOT_FOUND",
          });
        }

        const takenResult = await safely(
          "printing.regenerate_slug.load_slugs",
          () =>
            repository.getTakenPrintingSlugs(
              joinPublicSlug(buildPublicSlugSegments(slugPrinting)),
              params.id,
            ),
        );
        if ("error" in takenResult) {
          return status(takenResult.error.status, takenResult.error.body);
        }
        const publicSlug = generatePublicSlug(slugPrinting, (slug) =>
          takenResult.data.has(slug),
        );

        const rpcResult = await safely("printing.regenerate_slug", () =>
          repository.callRpc("admin_set_printing_slug", {
            p_printing_id: params.id,
            p_slug: publicSlug,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return {
          ok: true as const,
          printing_id: params.id,
          public_slug: publicSlug,
        };
      },
      {
        response: {
          200: SlugMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Regenerate a printing's public slug",
          description:
            "Recomputes the slug with the shared rules and repins it. Slugs are otherwise never overwritten, so this breaks existing links deliberately.",
        },
      },
    )
    // Read before write: the panel authors a delta against what is already
    // stored, so without this it could only ever clear-and-replace.
    .get(
      "/printings/:id/deltas",
      async ({ params, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const result = await safely("printing.delta.read", () =>
          repository.getPrintingDelta(params.id),
        );
        if ("error" in result) {
          return status(result.error.status, result.error.body);
        }
        if (!result.data) {
          return status(404, { error: "Printing not found", code: "NOT_FOUND" });
        }
        return result.data;
      },
      {
        params: t.Object({ id: t.String() }),
        detail: {
          tags: ["Admin"],
          summary: "Read a printing's admin-authored delta",
          description:
            "Returns `delta: null` when the printing inherits its oracle wholesale. Ingest-authored deltas are deliberately not returned — they record genuine upstream divergence, not an admin decision.",
        },
      },
    )
    .put(
      "/printings/:id/deltas",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }

        // An empty or absent delta clears the admin row entirely and the
        // printing goes back to inheriting its oracle.
        const delta =
          body?.delta && Object.keys(body.delta).length > 0 ? body.delta : null;

        const rpcResult = await safely("printing.delta", () =>
          repository.callRpc("admin_set_printing_delta", {
            p_printing_id: params.id,
            p_delta: delta,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, printing_id: params.id };
      },
      {
        body: t.Optional(
          t.Object({ delta: t.Optional(t.Nullable(AdminPrintingDeltaSchema)) }),
        ),
        response: {
          200: PrintingMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Set or clear a printing's delta",
          description:
            "Records how this printing genuinely differs from its oracle. Arrays add and remove; scalars override, and `cleared_fields` is how a scalar is blanked (NULL already means inherit). An empty or null body clears the delta.",
        },
      },
    )
    .post(
      "/printings/:id/image",
      async ({ params, body, adminUser, status }) => {
        if (!repository || !imageBindings) {
          return status(503, {
            error: "Admin image service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }

        const bytes = await body.file.arrayBuffer();
        const detectedContentType = detectAdminImageType(bytes);
        if (
          !detectedContentType ||
          body.file.type !== detectedContentType
        ) {
          return status(400, {
            error: "Unsupported image type or mismatched content",
            code: "INVALID_IMAGE_TYPE",
          });
        }
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
          return status(400, {
            error: "Image must be between 1 byte and 20 MB",
            code: "INVALID_IMAGE_SIZE",
          });
        }

        const contentHash = await sha256Hex(bytes);
        const key = adminUploadObjectKey(params.id, contentHash);
        const baseUrl = normalizeBaseUrl(imageBindings.baseUrl);
        const uploadedSourceUrl = `${baseUrl}/${key}`;
        const uploadedSourceHash = await sourceHash(uploadedSourceUrl);

        const putResult = await safely("printing.image.store", () =>
          imageBindings.bucket.put(key, bytes, {
            httpMetadata: {
              contentType: detectedContentType,
              cacheControl: ADMIN_IMAGE_CACHE_CONTROL,
            },
            customMetadata: {
              printingId: params.id,
              contentHash,
              sourceProvider: "admin",
            },
          }),
        );
        if ("error" in putResult) {
          return status(503, {
            error: "Admin image storage unavailable",
            code: "IMAGE_STORAGE_UNAVAILABLE",
          });
        }

        const persisted = await safely("printing.image.persist", () =>
          repository.setPrintingImageSource(
            params.id,
            {
              source_url: uploadedSourceUrl,
              source_hash: uploadedSourceHash,
              alt_text: body.accessibility_text,
            },
            adminUser.id,
          ),
        );
        if ("error" in persisted) {
          await cleanupUpload(imageBindings, key);
          return status(persisted.error.status, persisted.error.body);
        }
        if (!persisted.data) {
          await cleanupUpload(imageBindings, key);
          return status(404, {
            error: "Printing not found",
            code: "PRINTING_NOT_FOUND",
          });
        }

        // A failed enqueue is reported, not rolled back. The printing already
        // carries the admin source_url, a valid source_hash and a null
        // image_hosted_at, which is exactly the state the ingest catalogue scan
        // looks for, so the next run re-queues it. Rolling back would instead
        // discard an upload the admin made.
        let queued = true;
        try {
          await imageBindings.queue.send({
            version: 1,
            printingId: params.id,
            sourceUrl: uploadedSourceUrl,
            sourceHash: uploadedSourceHash,
            sourceProvider: "admin",
          });
        } catch (error) {
          queued = false;
          console.error(
            JSON.stringify({
              message: "admin image queue send failed",
              printingId: params.id,
              sourceHash: uploadedSourceHash,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }

        return status(202, {
          ok: true as const,
          printing_id: params.id,
          source_url: uploadedSourceUrl,
          source_hash: uploadedSourceHash,
          queued,
        });
      },
      {
        body: t.Object({
          file: t.File({
            minSize: 1,
            maxSize: "20m",
          }),
          accessibility_text: t.Optional(
            t.String({ maxLength: 2000 }),
          ),
        }),
        response: {
          202: ImageMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Upload a printing's image",
          description:
            "Stores a content-addressed admin source in R2, points the printing at it, locks the image against ingest, and queues WebP variants.",
        },
      },
    )

    // ── Printing legalities and rulings ───────────────────────────────────────
    .get(
      "/printings/:id/legalities",
      async ({ params, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const result = await safely("printing.legalities.list", () =>
          repository.listPrintingLegalities(params.id),
        );
        if ("error" in result) {
          return status(result.error.status, result.error.body);
        }
        if (!result.data) {
          return status(404, {
            error: "Printing not found",
            code: "PRINTING_NOT_FOUND",
          });
        }
        return result.data;
      },
      {
        response: {
          200: AdminPrintingLegalitiesResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Read a printing's legalities",
          description:
            "One entry per active format with the resolved status and the layer that decided it, so the editor can show whether the status came from the card or from this printing.",
        },
      },
    )
    .put(
      "/printings/:id/legalities",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const formatCode = body.format_code.trim().toLowerCase();
        const applyToAll = body.apply_to_all_printings ?? false;

        // Which id is passed is the whole scope mechanism: an oracle id sets the
        // card-wide status (and clears every printing exception in that format),
        // a printing id writes an exception to it.
        let oracleId: string | null = null;
        if (applyToAll) {
          const owner = await safely("printing.legality.load_oracle", () =>
            repository.getPrintingOracleId(params.id),
          );
          if ("error" in owner) {
            return status(owner.error.status, owner.error.body);
          }
          if (!owner.data) {
            return status(404, {
              error: "Printing not found",
              code: "PRINTING_NOT_FOUND",
            });
          }
          oracleId = owner.data;
        }

        const rpcResult = await safely("printing.legality", () =>
          repository.callRpc("admin_set_legality", {
            p_oracle_id: oracleId,
            p_printing_id: applyToAll ? null : params.id,
            p_format_code: formatCode,
            // `default` clears the row; every other value is stored as-is.
            p_status: body.status === "default" ? null : body.status,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return {
          ok: true as const,
          printing_id: params.id,
          format_code: formatCode,
          scope: applyToAll ? ("oracle" as const) : ("printing" as const),
          status: body.status === "default" ? null : body.status,
        };
      },
      {
        body: t.Object({
          format_code: t.String({
            minLength: 1,
            maxLength: 64,
            pattern: FORMAT_CODE_PATTERN,
          }),
          status: LegalityStatusInputSchema,
          apply_to_all_printings: t.Optional(t.Boolean()),
        }),
        response: {
          200: LegalityMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Set a legality in one format",
          description:
            "With apply_to_all_printings the status is stored on the card and every per-printing exception for that format is cleared; without it, only this printing is affected. `default` removes the stored status (absence means legal).",
        },
      },
    )
    .get(
      "/printings/:id/rulings",
      async ({ params, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const result = await safely("printing.rulings.list", () =>
          repository.listPrintingRulings(params.id),
        );
        if ("error" in result) {
          return status(result.error.status, result.error.body);
        }
        if (!result.data) {
          return status(404, {
            error: "Printing not found",
            code: "PRINTING_NOT_FOUND",
          });
        }
        return result.data;
      },
      {
        response: {
          200: AdminPrintingRulingsResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Read the rulings reaching a printing",
          description:
            "Every ruling that lands on this printing and how it got there. Read-only: rulings are created and retargeted from /admin/rulings, because one ruling can cover many cards.",
        },
      },
    )

    // ── Formats ───────────────────────────────────────────────────────────────
    .get(
      "/formats",
      async ({ status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const result = await safely("format.list", () =>
          repository.listFormats(),
        );
        if ("error" in result) {
          return status(result.error.status, result.error.body);
        }
        return { formats: result.data };
      },
      {
        response: {
          200: AdminFormatListResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "List formats",
          description:
            "Returns every format including retired ones, each with the legality row counts a delete would cascade away.",
        },
      },
    )
    .post(
      "/formats",
      async ({ body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const code = body.code.trim().toLowerCase();
        const rpcResult = await safely("format.create", () =>
          repository.callRpc("admin_create_format", {
            p_code: code,
            p_name: body.name.trim(),
            p_sort_order: body.sort_order ?? null,
            p_active: body.active ?? true,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, code };
      },
      {
        body: t.Object({
          code: t.String({
            minLength: 1,
            maxLength: 64,
            pattern: FORMAT_CODE_PATTERN,
          }),
          name: t.String({
            minLength: 1,
            maxLength: 120,
            pattern: NON_BLANK_PATTERN,
          }),
          sort_order: t.Optional(t.Integer({ minimum: 0, maximum: 10_000 })),
          active: t.Optional(t.Boolean()),
        }),
        response: {
          200: FormatMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Create a format",
          description:
            "Creates a play format. Omitting sort_order appends it to the end of the list.",
        },
      },
    )
    // Registered before /formats/:code so "order" is never read as a format code.
    .put(
      "/formats/order",
      async ({ body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const codes = body.codes.map((code) => code.trim().toLowerCase());
        if (new Set(codes).size !== codes.length) {
          return status(400, {
            error: "Format codes must be unique",
            code: "DUPLICATE_FORMAT",
          });
        }
        const rpcResult = await safely("format.reorder", () =>
          repository.callRpc("admin_reorder_formats", {
            p_codes: codes,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const };
      },
      {
        body: t.Object({
          codes: t.Array(
            t.String({
              minLength: 1,
              maxLength: 64,
              pattern: FORMAT_CODE_PATTERN,
            }),
            { maxItems: 200 },
          ),
        }),
        response: {
          200: t.Object({ ok: t.Literal(true) }),
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Reorder formats",
          description:
            "Rewrites sort_order from the position of each code. Send the complete list — an unknown code is rejected rather than skipped.",
        },
      },
    )
    .patch(
      "/formats/:code",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        if (Object.keys(body.patch).length === 0) {
          return status(400, {
            error: "Patch must contain at least one field",
            code: "EMPTY_PATCH",
          });
        }
        const code = params.code.trim().toLowerCase();
        const patch: Record<string, unknown> = { ...body.patch };
        if (typeof body.patch.name === "string") {
          patch.name = body.patch.name.trim();
        }
        const rpcResult = await safely("format.patch", () =>
          repository.callRpc("admin_patch_format", {
            p_code: code,
            p_patch: patch,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, code };
      },
      {
        body: t.Object({
          patch: t.Object({
            name: t.Optional(
              t.String({
                minLength: 1,
                maxLength: 120,
                pattern: NON_BLANK_PATTERN,
              }),
            ),
            sort_order: t.Optional(t.Integer({ minimum: 0, maximum: 10_000 })),
            active: t.Optional(t.Boolean()),
          }),
        }),
        response: {
          200: FormatMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Patch a format",
          description:
            "Updates a format's name, order or active flag. `code` is immutable — it is the public handle used by API clients.",
        },
      },
    )
    .delete(
      "/formats/:code",
      async ({ params, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const code = params.code.trim().toLowerCase();
        const rpcResult = await safely("format.delete", () =>
          repository.callRpc("admin_delete_format", {
            p_code: code,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return {
          ok: true as const,
          code,
          legalities_removed: Number(rpcResult.data.legalities_removed ?? 0),
          overrides_removed: Number(rpcResult.data.overrides_removed ?? 0),
        };
      },
      {
        response: {
          200: FormatDeleteResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Delete a format",
          description:
            "Deletes a format and cascades away its legality rows. The response reports how many were removed.",
        },
      },
    )

    // ── Rulings ───────────────────────────────────────────────────────────────
    // A ruling is separate from what it applies to, so it is edited here rather
    // than per card: one ruling can point at an oracle, a printing, or a saved
    // query that keeps matching cards as they are released.
    .get(
      "/rulings",
      async ({ query, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const result = await safely("ruling.list", () =>
          repository.listRulings({
            limit: query.limit ?? 50,
            offset: query.offset ?? 0,
            query: query.q?.trim() || undefined,
            kind: query.kind,
          }),
        );
        if ("error" in result) {
          return status(result.error.status, result.error.body);
        }
        return result.data;
      },
      {
        query: t.Object({
          q: t.Optional(t.String({ maxLength: 200 })),
          // A t.Union of literals, not t.UnionEnum: UnionEnum fills in its first
          // member when the key is absent, which would silently filter every
          // unfiltered list to `oracle`.
          kind: t.Optional(
            t.Union([
              t.Literal("oracle"),
              t.Literal("printing"),
              t.Literal("query"),
            ]),
          ),
          limit: t.Optional(t.Number({ minimum: 1, maximum: 200 })),
          offset: t.Optional(t.Number({ minimum: 0 })),
        }),
        response: {
          200: RulingsPageSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "List rulings",
          description:
            "Every ruling with its targets, newest first. `q` matches ruling text; `kind` narrows to rulings carrying a target of that kind.",
        },
      },
    )
    .post(
      "/rulings/preview",
      async ({ body, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const built = buildRulingTargets([
          { kind: "query", query: body.query },
        ]);
        if ("error" in built) {
          return status(built.error.status, built.error.body);
        }
        const ast = built.targets[0]?.ast;
        const result = await safely("ruling.preview", () =>
          repository.previewRule(ast, body.limit ?? 20),
        );
        if ("error" in result) {
          return status(result.error.status, result.error.body);
        }
        return { query: body.query.trim(), ...result.data };
      },
      {
        body: t.Object({
          query: t.String({
            minLength: 1,
            maxLength: CARD_SEARCH_LIMITS.maxInputLength,
            pattern: NON_BLANK_PATTERN,
          }),
          limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
        }),
        response: {
          200: RulePreviewResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Preview what a rule matches",
          description:
            "Evaluates a rule query without storing anything, returning the match count plus a bounded sample of printings. Backs the rule editor's live readout.",
        },
      },
    )
    .post(
      "/rulings",
      async ({ body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const built = buildRulingTargets(body.targets);
        if ("error" in built) {
          return status(built.error.status, built.error.body);
        }
        const rpcResult = await safely("ruling.create", () =>
          repository.callRpc("admin_create_ruling", {
            p_type: body.type,
            p_text: body.text.trim(),
            p_dated: body.dated ?? null,
            p_source: body.source?.trim() || null,
            p_targets: built.targets,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, ruling: rpcResult.data.ruling };
      },
      {
        body: t.Object({
          type: RulingTypeSchema,
          text: t.String({
            minLength: 1,
            maxLength: 4000,
            pattern: NON_BLANK_PATTERN,
          }),
          dated: t.Optional(t.String({ pattern: DATE_PATTERN })),
          source: t.Optional(t.String({ maxLength: 500 })),
          targets: t.Array(RulingTargetInputSchema, {
            minItems: 1,
            maxItems: 100,
          }),
        }),
        response: {
          200: RulingRecordResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Create a ruling",
          description:
            "Creates a ruling and its targets. Rule targets are materialised immediately, so the response already reports what each one matched.",
        },
      },
    )
    .patch(
      "/rulings/:rulingId",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        if (Object.keys(body.patch).length === 0) {
          return status(400, {
            error: "Patch must contain at least one field",
            code: "EMPTY_PATCH",
          });
        }

        // `targets` replaces the whole list, so it is parsed and validated
        // before anything is written; omitting the key leaves targeting alone.
        const { targets, ...rest } = body.patch;
        const patch: Record<string, unknown> = { ...rest };
        if (targets !== undefined) {
          const built = buildRulingTargets(targets);
          if ("error" in built) {
            return status(built.error.status, built.error.body);
          }
          patch.targets = built.targets;
        }

        const rpcResult = await safely("ruling.patch", () =>
          repository.callRpc("admin_patch_ruling", {
            p_ruling_id: params.rulingId,
            p_patch: patch,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, ruling: rpcResult.data.ruling };
      },
      {
        params: t.Object({ rulingId: t.String({ format: "uuid" }) }),
        body: t.Object({
          patch: t.Object({
            type: t.Optional(RulingTypeSchema),
            text: t.Optional(
              t.String({
                minLength: 1,
                maxLength: 4000,
                pattern: NON_BLANK_PATTERN,
              }),
            ),
            dated: t.Optional(t.Nullable(t.String({ pattern: DATE_PATTERN }))),
            source: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
            active: t.Optional(t.Boolean()),
            targets: t.Optional(
              t.Array(RulingTargetInputSchema, { minItems: 1, maxItems: 100 }),
            ),
          }),
        }),
        response: {
          200: RulingRecordResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Edit a ruling",
          description:
            "Patches a ruling. `targets` replaces the entire target list; omit it to leave targeting unchanged. Rule targets are re-materialised on every patch.",
        },
      },
    )
    .delete(
      "/rulings/:rulingId",
      async ({ params, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const rpcResult = await safely("ruling.delete", () =>
          repository.callRpc("admin_delete_ruling", {
            p_ruling_id: params.rulingId,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, ruling_id: params.rulingId };
      },
      {
        params: t.Object({ rulingId: t.String({ format: "uuid" }) }),
        response: {
          200: t.Object({ ok: t.Literal(true), ruling_id: t.String() }),
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Delete a ruling",
          description:
            "Deletes a ruling and every target it carries, wherever it appeared.",
        },
      },
    )

    // ── Sets ──────────────────────────────────────────────────────────────────
    .post(
      "/sets",
      async ({ body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const setCode = body.set_code.trim().toUpperCase();
        const definition = {
          ...body.definition,
          set_name: body.definition.set_name.trim(),
          ...(typeof body.definition.parent_set_code === "string"
            ? {
                parent_set_code:
                  body.definition.parent_set_code.trim().toUpperCase(),
              }
            : {}),
        };
        const rpcResult = await safely("set.create", () =>
          repository.callRpc("admin_create_set", {
            p_set_code: setCode,
            p_definition: definition,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, set_code: setCode };
      },
      {
        body: t.Object({
          set_code: SetCodeSchema,
          definition: AdminSetDefinitionSchema,
        }),
        response: {
          200: SetMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Create a manual set",
          description: "Creates a set that ingest will not prune.",
        },
      },
    )
    .patch(
      "/sets/:setCode",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        if (Object.keys(body.patch).length === 0) {
          return status(400, {
            error: "Patch must contain at least one field",
            code: "EMPTY_PATCH",
          });
        }
        const setCode = params.setCode.trim().toUpperCase();
        const patch = {
          ...body.patch,
          ...(typeof body.patch.set_name === "string"
            ? { set_name: body.patch.set_name.trim() }
            : {}),
          ...(typeof body.patch.parent_set_code === "string"
            ? {
                parent_set_code:
                  body.patch.parent_set_code.trim().toUpperCase(),
              }
            : {}),
        };
        const rpcResult = await safely("set.patch", () =>
          repository.callRpc("admin_patch_set", {
            p_set_code: setCode,
            p_patch: patch,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, set_code: setCode };
      },
      {
        body: t.Object({ patch: AdminSetPatchSchema }),
        response: {
          200: SetMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Patch a set",
          description:
            "Updates a set. Patched keys are locked against the next ingest.",
        },
      },
    )
    .delete(
      "/sets/:setCode",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const setCode = params.setCode.trim().toUpperCase();
        const rpcResult = await safely("set.delete", () =>
          repository.callRpc("admin_delete_set", {
            p_set_code: setCode,
            p_reason: body?.reason ?? null,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        return { ok: true as const, set_code: setCode };
      },
      {
        body: t.Optional(
          t.Object({ reason: t.Optional(t.String({ maxLength: 2000 })) }),
        ),
        response: {
          200: SetMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Delete a set",
          description:
            "Soft-deletes an empty set. A set that still holds printings is refused.",
        },
      },
    );
}
