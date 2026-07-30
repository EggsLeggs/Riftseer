import { Elysia, t } from "elysia";
import type { Card } from "@riftseer/types";
import {
  buildPublicSlugSegments,
  generatePublicSlug,
  joinPublicSlug,
  normalizeCardName,
} from "@riftseer/types";
import { authAdminClient } from "../lib/supabase";
import { oracleKeyForName } from "@riftseer/types/oracle";
import {
  AdminRepositoryError,
  createAdminDataRepository,
  type AdminDataRepository,
  type AdminReconciliationEntry,
  type AdminRpcResult,
  type AdminSlugCard,
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

const AdminExternalIdsSchema = t.Partial(
  t.Object({
    riftcodex_id: NullableStringSchema,
    riftbound_id: NullableStringSchema,
    tcgplayer_id: NullableStringSchema,
  }),
);

const AdminAttributesSchema = t.Partial(
  t.Object({
    energy: NullableNumberSchema,
    might: NullableNumberSchema,
    power: NullableNumberSchema,
  }),
);

const AdminClassificationSchema = t.Partial(
  t.Object({
    type: NullableStringSchema,
    supertype: NullableStringSchema,
    rarity: NullableStringSchema,
    tags: t.Nullable(t.Array(t.String())),
    domains: t.Nullable(t.Array(t.String())),
  }),
);

const AdminTextSchema = t.Partial(
  t.Object({
    rich: NullableStringSchema,
    plain: NullableStringSchema,
    flavour: NullableStringSchema,
  }),
);

const AdminMetadataSchema = t.Partial(
  t.Object({
    finishes: t.Nullable(t.Array(t.String())),
    signature: t.Nullable(t.Boolean()),
    overnumbered: t.Nullable(t.Boolean()),
    alternate_art: t.Nullable(t.Boolean()),
  }),
);

const AdminMediaSchema = t.Partial(
  t.Object({
    orientation: NullableStringSchema,
    accessibility_text: NullableStringSchema,
  }),
);

const AdminPurchaseUrisSchema = t.Partial(
  t.Object({
    cardmarket: NullableStringSchema,
    tcgplayer: NullableStringSchema,
  }),
);

const AdminPriceEntrySchema = t.Partial(
  t.Object({
    normal: NullableNumberSchema,
    foil: NullableNumberSchema,
    low_normal: NullableNumberSchema,
    low_foil: NullableNumberSchema,
  }),
);

const AdminPricesSchema = t.Partial(
  t.Object({
    tcgplayer: t.Nullable(AdminPriceEntrySchema),
    cardmarket: t.Nullable(AdminPriceEntrySchema),
  }),
);

const AdminSetReferenceSchema = t.Object({
  set_code: t.String({
    minLength: 1,
    maxLength: 32,
    pattern: NON_BLANK_PATTERN,
  }),
  set_name: t.String({
    minLength: 1,
    maxLength: 200,
    pattern: NON_BLANK_PATTERN,
  }),
  set_uri: t.Optional(t.String()),
  set_search_uri: t.Optional(t.String()),
  published_on: t.Optional(
    t.String({ pattern: DATE_PATTERN }),
  ),
});

const AdminCardOptionalFields = {
  released_at: t.Optional(t.Nullable(t.String({ pattern: DATE_PATTERN }))),
  collector_number: t.Optional(NullableStringSchema),
  external_ids: t.Optional(t.Nullable(AdminExternalIdsSchema)),
  attributes: t.Optional(t.Nullable(AdminAttributesSchema)),
  classification: t.Optional(t.Nullable(AdminClassificationSchema)),
  text: t.Optional(t.Nullable(AdminTextSchema)),
  artist: t.Optional(NullableStringSchema),
  metadata: t.Optional(t.Nullable(AdminMetadataSchema)),
  media: t.Optional(t.Nullable(AdminMediaSchema)),
  purchase_uris: t.Optional(t.Nullable(AdminPurchaseUrisSchema)),
  prices: t.Optional(t.Nullable(AdminPricesSchema)),
  is_token: t.Optional(t.Boolean()),
};

const AdminCardPatchSchema = t.Object({
  name: t.Optional(
    t.String({
      minLength: 1,
      maxLength: 300,
      pattern: NON_BLANK_PATTERN,
    }),
  ),
  ...AdminCardOptionalFields,
});

const AdminCardDefinitionSchema = t.Object({
  name: t.String({
    minLength: 1,
    maxLength: 300,
    pattern: NON_BLANK_PATTERN,
  }),
  ...AdminCardOptionalFields,
  set: t.Optional(AdminSetReferenceSchema),
});

const RelationshipKindSchema = t.UnionEnum([
  "all_parts",
  "used_by",
  "related_champions",
  "related_legends",
  "related_signatures",
  "related_printings",
]);

const RelationshipActionSchema = t.UnionEnum(["add", "remove"]);

const AdminSetFields = {
  set_uri: t.Optional(NullableStringSchema),
  set_search_uri: t.Optional(NullableStringSchema),
  published_on: t.Optional(t.Nullable(t.String({ pattern: DATE_PATTERN }))),
  is_promo: t.Optional(t.Boolean()),
  parent_set_code: t.Optional(NullableStringSchema),
  external_ids: t.Optional(
    t.Nullable(
      t.Partial(
        t.Object({
          riftcodex_set_id: NullableStringSchema,
          tcgplayer_group_id: t.Nullable(t.Number()),
          cardmarket_id: t.Nullable(
            t.Union([t.String(), t.Array(t.String())]),
          ),
        }),
      ),
    ),
  ),
};

const AdminSetPatchSchema = t.Object({
  set_name: t.Optional(
    t.String({
      minLength: 1,
      maxLength: 200,
      pattern: NON_BLANK_PATTERN,
    }),
  ),
  ...AdminSetFields,
});

const AdminSetDefinitionSchema = t.Object({
  set_name: t.String({
    minLength: 1,
    maxLength: 200,
    pattern: NON_BLANK_PATTERN,
  }),
  ...AdminSetFields,
});

const CardMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  card_id: t.String(),
});

const SlugMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  card_id: t.String(),
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
 * `default` clears the stored row rather than writing a status: absence of a
 * card-level row *is* legal, so this is how a format goes back to unmarked.
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
    description: "Card-level legality rows a delete would cascade away.",
  }),
  override_count: t.Number({
    description: "Per-printing override rows a delete would cascade away.",
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

const AdminCardLegalitiesResponseSchema = t.Object({
  card_id: t.String(),
  oracle_key: t.String(),
  entries: t.Array(
    t.Object({
      format_id: t.String(),
      format_code: t.String(),
      format_name: t.String(),
      format_active: t.Boolean(),
      oracle_status: t.Nullable(LegalityStatusSchema),
      printing_status: t.Nullable(LegalityStatusSchema),
      effective_status: LegalityStatusSchema,
    }),
  ),
});

const LegalityMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  card_id: t.String(),
  format_code: t.String(),
  scope: t.UnionEnum(["printing", "oracle"]),
  status: t.Nullable(LegalityStatusSchema),
});

const AdminCardRulingsResponseSchema = t.Object({
  card_id: t.String(),
  oracle_key: t.String(),
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
          "Which target kind put this entry on the card: this printing, the " +
          "whole card, or a query-scoped rule.",
      }),
      all_printings: t.Boolean({
        description: "True when the entry is shared by every printing.",
      }),
      shared: t.Boolean({
        description:
          "True when the ruling has several targets or any rule target — it is " +
          "read-only here and edited from /admin/rulings.",
      }),
      target_count: t.Number(),
      created_at: t.Nullable(t.String()),
      updated_at: t.Nullable(t.String()),
    }),
  ),
});

const RulingMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  card_id: t.String(),
  ruling_id: t.String(),
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
    oracle_key: t.String({ minLength: 1, maxLength: 256 }),
  }),
  t.Object({
    kind: t.Literal("printing"),
    card_id: t.String({ minLength: 1, maxLength: 128 }),
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
  oracle_key: t.Nullable(t.String()),
  card_id: t.Nullable(t.String()),
  card_name: t.Nullable(t.String()),
  query: t.Nullable(t.String()),
  ast: t.Unknown(),
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
  | { kind: "oracle"; oracle_key: string }
  | { kind: "printing"; card_id: string }
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
      targets.push({ kind: "oracle", oracle_key: input.oracle_key.trim() });
      continue;
    }
    if (input.kind === "printing") {
      targets.push({ kind: "printing", card_id: input.card_id.trim() });
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
]);

const ReconciliationStatusSchema = t.UnionEnum([
  "pending",
  "confirmed",
  "dismissed",
]);

const ReconciliationFieldSchema = t.UnionEnum([
  "collector_number",
  "released_at",
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

const ReconciliationEntrySchema = t.Object({
  id: t.String(),
  kind: ReconciliationKindSchema,
  fingerprint: t.String(),
  status: ReconciliationStatusSchema,
  tcgplayer_payload: t.Object({
    product: ReconciliationProductSchema,
    field: t.Optional(ReconciliationFieldSchema),
    current_value: t.Optional(NullableStringSchema),
    proposed_value: t.Optional(NullableStringSchema),
    card_id: t.Optional(t.String()),
    card_name: t.Optional(t.String()),
  }),
  proposed_card_id: NullableStringSchema,
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
  card_id: NullableStringSchema,
});

const ImageMutationResponseSchema = t.Object({
  ok: t.Literal(true),
  card_id: t.String(),
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
  cardId: string;
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
    case "card_not_found":
      return {
        status: 404,
        body: { error: "Card not found", code: "CARD_NOT_FOUND" },
      };
    case "set_not_found":
      return {
        status: 404,
        body: { error: "Set not found", code: "SET_NOT_FOUND" },
      };
    case "card_exists":
      return {
        status: 409,
        body: { error: "Card already exists", code: "CARD_EXISTS" },
      };
    case "set_exists":
      return {
        status: 409,
        body: { error: "Set already exists", code: "SET_EXISTS" },
      };
    case "card_deleted":
      return {
        status: 409,
        body: {
          error: "Card id has a durable deletion record",
          code: "CARD_DELETED",
        },
      };
    case "set_deleted":
      return {
        status: 409,
        body: {
          error: "Set code has a durable deletion record",
          code: "SET_DELETED",
        },
      };
    case "set_not_empty":
      return {
        status: 409,
        body: {
          error: "Move or delete every card in the set first",
          code: "SET_NOT_EMPTY",
        },
      };
    case "format_not_found":
      return {
        status: 404,
        body: { error: "Format not found", code: "FORMAT_NOT_FOUND" },
      };
    case "format_exists":
      return {
        status: 409,
        body: { error: "Format code already exists", code: "FORMAT_EXISTS" },
      };
    case "ruling_not_found":
      return {
        status: 404,
        body: { error: "Ruling not found", code: "RULING_NOT_FOUND" },
      };
    case "ruling_is_shared":
      return {
        status: 409,
        body: {
          error:
            "This ruling applies to more than one card — retarget it from the Rulings tab",
          code: "RULING_IS_SHARED",
        },
      };
    case "reconciliation_entry_not_found":
      return {
        status: 404,
        body: {
          error: "Review entry not found",
          code: "REVIEW_ENTRY_NOT_FOUND",
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
    case "card_required":
      return {
        status: 400,
        body: {
          error: "Choose a card to link this product to",
          code: "CARD_REQUIRED",
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

function toSlugCard(card: AdminSlugCard): Card {
  return {
    object: "card",
    id: card.id,
    name: card.name,
    name_normalized: card.name_normalized,
    collector_number: card.collector_number,
    set: card.set,
    metadata: card.metadata,
    is_token: false,
    all_parts: [],
    used_by: [],
    related_champions: [],
    related_legends: [],
    related_signatures: [],
    related_printings: [],
  };
}

/**
 * The card patch a confirmation applies, built here rather than in SQL so the
 * `name`-derivation rules stay in one place and the RPC never has to interpret
 * a payload shape.
 *
 * Confirming an unmatched product is what "creates a persistent link": the
 * `tcgplayer_id` lands in `card_overrides`, ingest's override overlay re-applies
 * it every run, and the product stops being unmatched. Returns null when the
 * payload carries a field this API does not know how to apply.
 */
function buildConfirmPatch(
  entry: AdminReconciliationEntry,
): Record<string, unknown> | null {
  const payload = entry.tcgplayer_payload;

  if (entry.kind === "unmatched_product") {
    return {
      external_ids: { tcgplayer_id: String(payload.product.product_id) },
      purchase_uris: { tcgplayer: payload.product.url },
    };
  }

  const value = payload.proposed_value ?? null;
  switch (payload.field) {
    case "collector_number":
      return { collector_number: value };
    case "released_at":
      return { released_at: value };
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

  /**
   * Re-evaluate rule-scoped rulings against one card after it has been written.
   *
   * Ingest refreshes every rule at the end of a run, but that is up to six hours
   * away — an admin who creates a card with `[Deathknell]`, or edits one into
   * matching a rule, should see the ruling attach straight away. Also handles
   * the reverse: an edit can move a card *out* of a rule.
   *
   * Advisory by design. Rulings are supplementary to the card page, and the
   * write has already committed by the time this runs, so a failure is
   * swallowed rather than reported as a failed edit — the next ingest
   * recomputes it either way.
   */
  async function refreshCardRuleMatches(cardId: string): Promise<void> {
    if (!repository) return;
    try {
      await repository.callRpc("refresh_ruling_matches_for_card", {
        p_card_id: cardId,
      });
    } catch {
      // Deliberately ignored — see above.
    }
  }

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

    // ── TCGPlayer review queue ────────────────────────────────────────────────
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
        }),
        response: {
          200: ReconciliationListResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "List review-queue entries",
          description:
            "TCGPlayer products ingest could not attach to a card, plus field disagreements. Defaults to pending entries, newest first.",
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

        const patch = buildConfirmPatch(entryResult.data);
        if (!patch) {
          return status(400, {
            error: "This entry proposes a field the API cannot apply",
            code: "REVIEW_FIELD_UNSUPPORTED",
          });
        }

        const rpcResult = await safely("reconciliation.confirm", () =>
          repository.callRpc("admin_resolve_reconciliation_entry", {
            p_entry_id: params.id,
            p_action: "confirm",
            p_card_id: body?.card_id?.trim() || null,
            p_patch: patch,
            p_note: body?.note ?? null,
            p_actor: adminUser.id,
          }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);

        // Confirming applies a card patch, so the card may have moved into (or
        // out of) a rule's reach.
        const confirmedCardId =
          typeof rpcResult.data.card_id === "string"
            ? rpcResult.data.card_id
            : null;
        if (confirmedCardId) await refreshCardRuleMatches(confirmedCardId);

        return {
          ok: true as const,
          entry_id: params.id,
          status: "confirmed" as const,
          card_id: confirmedCardId,
        };
      },
      {
        params: t.Object({ id: t.String({ format: "uuid" }) }),
        body: t.Optional(
          t.Object({
            /** Overrides ingest's suggestion; required when it made none. */
            card_id: t.Optional(
              t.String({
                minLength: 1,
                maxLength: 128,
                pattern: NON_BLANK_PATTERN,
              }),
            ),
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
            "Applies the proposal as a durable card override and closes the entry. Linking a product writes its tcgplayer_id, so the next ingest matches it automatically.",
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
            p_card_id: null,
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
          card_id: null,
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

    .post(
      "/cards",
      async ({ body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }

        const cardId = body.id.trim();
        const name = body.definition.name.trim();
        const normalizedSet = body.definition.set
          ? {
              ...body.definition.set,
              set_code: body.definition.set.set_code.trim().toUpperCase(),
              set_name: body.definition.set.set_name.trim(),
            }
          : undefined;
        const slugCard: AdminSlugCard = {
          id: cardId,
          name,
          name_normalized: normalizeCardName(name),
          collector_number:
            body.definition.collector_number ?? undefined,
          set: normalizedSet
            ? {
                set_code: normalizedSet.set_code,
                set_name: normalizedSet.set_name,
              }
            : undefined,
          metadata: body.definition.metadata
            ? {
                alternate_art:
                  body.definition.metadata.alternate_art ?? undefined,
                signature:
                  body.definition.metadata.signature ?? undefined,
              }
            : undefined,
        };

        const createCard = toSlugCard(slugCard);
        const takenResult = await safely(
          "card.create.load_slugs",
          () =>
            repository.getTakenSlugs(
              joinPublicSlug(buildPublicSlugSegments(createCard)),
            ),
        );
        if ("error" in takenResult) {
          return status(takenResult.error.status, takenResult.error.body);
        }
        const publicSlug = generatePublicSlug(
          createCard,
          (slug) => takenResult.data.has(slug),
        );

        const definition: Record<string, unknown> = {
          ...body.definition,
          name,
          name_normalized: normalizeCardName(name),
          oracle_key: oracleKeyForName(name),
          public_slug: publicSlug,
          is_token: body.definition.is_token ?? false,
        };
        if (normalizedSet) definition.set = normalizedSet;

        const rpcResult = await safely(
          "card.create",
          () =>
            repository.callRpc("admin_create_manual_card", {
              p_id: cardId,
              p_definition: definition,
              p_actor: adminUser.id,
            }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);

        await refreshCardRuleMatches(cardId);
        return { ok: true as const, card_id: cardId };
      },
      {
        body: t.Object({
          id: t.String({
            minLength: 1,
            maxLength: 128,
            pattern: NON_BLANK_PATTERN,
          }),
          definition: AdminCardDefinitionSchema,
        }),
        response: {
          200: CardMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Create a manual card",
          description:
            "Creates a live card and a durable manual-card definition in one transaction.",
        },
      },
    )
    .patch(
      "/cards/:id",
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
          // normalization rules live in exactly one place. A rename also moves
          // the card into a new oracle group, which re-points its rulings.
          patch.name_normalized = normalizeCardName(name);
          patch.oracle_key = oracleKeyForName(name);
        }

        const rpcResult = await safely(
          "card.patch",
          () =>
            repository.callRpc("admin_patch_card", {
              p_card_id: params.id,
              p_patch: patch,
              p_note: body.note ?? null,
              p_actor: adminUser.id,
            }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        await refreshCardRuleMatches(params.id);
        return { ok: true as const, card_id: params.id };
      },
      {
        body: t.Object({
          patch: AdminCardPatchSchema,
          note: t.Optional(t.String({ maxLength: 2000 })),
        }),
        response: {
          200: CardMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Patch a card",
          description:
            "Applies a JSON merge patch immediately and stores the durable override.",
        },
      },
    )
    .delete(
      "/cards/:id",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const rpcResult = await safely(
          "card.delete",
          () =>
            repository.callRpc("admin_delete_card", {
              p_card_id: params.id,
              p_reason: body?.reason ?? null,
              p_actor: adminUser.id,
            }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        await refreshCardRuleMatches(params.id);
        return { ok: true as const, card_id: params.id };
      },
      {
        body: t.Optional(
          t.Object({
            reason: t.Optional(t.String({ maxLength: 2000 })),
          }),
        ),
        response: {
          200: CardMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Delete a card",
          description:
            "Creates a durable deletion record and removes the live card.",
        },
      },
    )
    .post(
      "/cards/:id/regenerate-slug",
      async ({ params, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }

        const cardResult = await safely(
          "card.regenerate_slug.load_card",
          () => repository.getSlugCard(params.id),
        );
        if ("error" in cardResult) {
          return status(cardResult.error.status, cardResult.error.body);
        }
        if (!cardResult.data) {
          return status(404, {
            error: "Card not found",
            code: "CARD_NOT_FOUND",
          });
        }

        const regenerateCard = toSlugCard(cardResult.data);
        const takenResult = await safely(
          "card.regenerate_slug.load_slugs",
          () =>
            repository.getTakenSlugs(
              joinPublicSlug(buildPublicSlugSegments(regenerateCard)),
              params.id,
            ),
        );
        if ("error" in takenResult) {
          return status(takenResult.error.status, takenResult.error.body);
        }
        const publicSlug = generatePublicSlug(
          regenerateCard,
          (slug) => takenResult.data.has(slug),
        );

        const rpcResult = await safely(
          "card.regenerate_slug",
          () =>
            repository.callRpc("admin_set_card_slug", {
              p_card_id: params.id,
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
          card_id: params.id,
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
          summary: "Regenerate a card slug",
          description:
            "Regenerates the stable slug with the shared card-slug rules and persists it as an override.",
        },
      },
    )
    .post(
      "/cards/:id/move",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const setCode = body.set_code.trim().toUpperCase();
        const rpcResult = await safely(
          "card.move",
          () =>
            repository.callRpc("admin_move_card", {
              p_card_id: params.id,
              p_set_code: setCode,
              p_actor: adminUser.id,
            }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        await refreshCardRuleMatches(params.id);
        return { ok: true as const, card_id: params.id };
      },
      {
        body: t.Object({
          set_code: t.String({
            minLength: 1,
            maxLength: 32,
            pattern: NON_BLANK_PATTERN,
          }),
        }),
        response: {
          200: CardMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Move a card",
          description:
            "Moves a card to an existing set immediately and stores the set override.",
        },
      },
    )
    .put(
      "/cards/:id/relationships",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const identities = new Set<string>();
        const entries = body.entries.map((entry) => ({
          ...entry,
          related_card_id: entry.related_card_id.trim(),
        }));
        for (const entry of entries) {
          if (entry.related_card_id === params.id) {
            return status(400, {
              error: "A card cannot be related to itself",
              code: "SELF_RELATIONSHIP",
            });
          }
          const identity = `${entry.kind}\0${entry.related_card_id}`;
          if (identities.has(identity)) {
            return status(400, {
              error:
                "Relationship entries must be unique by kind and related_card_id",
              code: "DUPLICATE_RELATIONSHIP",
            });
          }
          identities.add(identity);
        }

        const rpcResult = await safely(
          "card.relationships",
          () =>
            repository.callRpc("admin_set_card_relationships", {
              p_card_id: params.id,
              p_entries: entries,
              p_actor: adminUser.id,
            }),
        );
        if ("error" in rpcResult) {
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) return status(failure.status, failure.body);
        await refreshCardRuleMatches(params.id);
        return { ok: true as const, card_id: params.id };
      },
      {
        body: t.Object({
          entries: t.Array(
            t.Object({
              kind: RelationshipKindSchema,
              related_card_id: t.String({
                minLength: 1,
                maxLength: 128,
                pattern: NON_BLANK_PATTERN,
              }),
              action: RelationshipActionSchema,
            }),
            { maxItems: 500 },
          ),
        }),
        response: {
          200: CardMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Replace relationship overrides",
          description:
            "Replaces a card's add/remove relationship overrides and reconciles the live arrays.",
        },
      },
    )
    .post(
      "/cards/:id/image",
      async ({ params, body, adminUser, status }) => {
        if (!repository || !imageBindings) {
          return status(503, {
            error: "Admin image service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }

        const cardResult = await safely(
          "card.image.load_card",
          () => repository.getSlugCard(params.id),
        );
        if ("error" in cardResult) {
          return status(cardResult.error.status, cardResult.error.body);
        }
        if (!cardResult.data) {
          return status(404, {
            error: "Card not found",
            code: "CARD_NOT_FOUND",
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
        const key =
          `cards/${encodeURIComponent(params.id)}/uploads/${contentHash}`;
        const baseUrl = normalizeBaseUrl(imageBindings.baseUrl);
        const uploadedSourceUrl = `${baseUrl}/${key}`;
        const uploadedSourceHash = await sourceHash(uploadedSourceUrl);

        const putResult = await safely(
          "card.image.store",
          () =>
            imageBindings.bucket.put(key, bytes, {
              httpMetadata: {
                contentType: detectedContentType,
                cacheControl: ADMIN_IMAGE_CACHE_CONTROL,
              },
              customMetadata: {
                cardId: params.id,
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

        const mediaPatch: Record<string, unknown> = {
          source_url: uploadedSourceUrl,
          source_hash: uploadedSourceHash,
          source_provider: "admin",
          media_urls: null,
        };
        if (body.accessibility_text !== undefined) {
          mediaPatch.accessibility_text = body.accessibility_text;
        }

        const rpcResult = await safely(
          "card.image.persist",
          () =>
            repository.callRpc("admin_set_card_image", {
              p_card_id: params.id,
              p_media: mediaPatch,
              p_actor: adminUser.id,
            }),
        );
        if ("error" in rpcResult) {
          await cleanupUpload(imageBindings, key);
          return status(rpcResult.error.status, rpcResult.error.body);
        }
        const failure = mutationFailure(rpcResult.data);
        if (failure) {
          await cleanupUpload(imageBindings, key);
          return status(failure.status, failure.body);
        }

        // A failed enqueue is reported, not rolled back. The media row already
        // carries the admin source_url, a valid source_hash and a null
        // media_urls, which is exactly the state the ingest catalogue scan
        // (loadPendingCardImageJobs) looks for, so the next run re-queues this
        // card. Rolling back would instead discard an upload the admin made.
        let queued = true;
        try {
          await imageBindings.queue.send({
            version: 1,
            cardId: params.id,
            sourceUrl: uploadedSourceUrl,
            sourceHash: uploadedSourceHash,
            sourceProvider: "admin",
          });
        } catch (error) {
          queued = false;
          console.error(
            JSON.stringify({
              message: "admin image queue send failed",
              cardId: params.id,
              sourceHash: uploadedSourceHash,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }

        return status(202, {
          ok: true as const,
          card_id: params.id,
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
          summary: "Upload a card image",
          description:
            "Stores a content-addressed admin source in R2, persists the override, and queues WebP variants.",
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

    // ── Card legalities ───────────────────────────────────────────────────────
    .get(
      "/cards/:id/legalities",
      async ({ params, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const result = await safely("card.legalities.list", () =>
          repository.listCardLegalities(params.id),
        );
        if ("error" in result) {
          return status(result.error.status, result.error.body);
        }
        if (!result.data) {
          return status(404, {
            error: "Card not found",
            code: "CARD_NOT_FOUND",
          });
        }
        return result.data;
      },
      {
        response: {
          200: AdminCardLegalitiesResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Read a card's legalities",
          description:
            "One entry per format with the card-level status and this printing's override exposed separately, plus the resolved status.",
        },
      },
    )
    .put(
      "/cards/:id/legalities",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const formatCode = body.format_code.trim().toLowerCase();
        const applyToAll = body.apply_to_all_printings ?? false;
        const rpcResult = await safely("card.legality", () =>
          repository.callRpc("admin_set_card_legality", {
            p_card_id: params.id,
            p_format_code: formatCode,
            // `default` clears the row; every other value is stored as-is.
            p_status: body.status === "default" ? null : body.status,
            p_all_printings: applyToAll,
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
          card_id: params.id,
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
          summary: "Set a card's legality in one format",
          description:
            "With apply_to_all_printings the status is stored on the card and every per-printing override for that format is cleared; " +
            "without it, only this printing is affected. `default` removes the stored status (absence means legal).",
        },
      },
    )

    // ── Card rulings and notes ────────────────────────────────────────────────
    .get(
      "/cards/:id/rulings",
      async ({ params, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const result = await safely("card.rulings.list", () =>
          repository.listCardRulings(params.id),
        );
        if ("error" in result) {
          return status(result.error.status, result.error.body);
        }
        if (!result.data) {
          return status(404, {
            error: "Card not found",
            code: "CARD_NOT_FOUND",
          });
        }
        return result.data;
      },
      {
        response: {
          200: AdminCardRulingsResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Read a card's rulings",
          description:
            "Rulings and notes visible on this printing: the card-wide entries plus any scoped to this printing.",
        },
      },
    )
    .post(
      "/cards/:id/rulings",
      async ({ params, body, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const rpcResult = await safely("card.ruling.create", () =>
          repository.callRpc("admin_create_card_ruling", {
            p_card_id: params.id,
            p_all_printings: body.apply_to_all_printings ?? true,
            p_type: body.type,
            p_text: body.text.trim(),
            p_dated: body.dated ?? null,
            p_source: body.source?.trim() || null,
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
          card_id: params.id,
          ruling_id: String(rpcResult.data.ruling_id ?? ""),
        };
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
          /** Defaults to true: a ruling normally describes the card, not a printing. */
          apply_to_all_printings: t.Optional(t.Boolean()),
        }),
        response: {
          200: RulingMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Add a ruling or note",
          description:
            "Adds an entry to the card. It applies to every printing unless apply_to_all_printings is false.",
        },
      },
    )
    .patch(
      "/cards/:id/rulings/:rulingId",
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
        if (typeof body.patch.text === "string") {
          patch.text = body.patch.text.trim();
        }
        // The RPC takes the durable `all_printings` shape, not the request's
        // `apply_to_all_printings`, so translate rather than pass through.
        if (body.patch.apply_to_all_printings !== undefined) {
          delete patch.apply_to_all_printings;
          patch.all_printings = body.patch.apply_to_all_printings;
        }
        const rpcResult = await safely("card.ruling.patch", () =>
          repository.callRpc("admin_patch_card_ruling", {
            p_card_id: params.id,
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
        return {
          ok: true as const,
          card_id: params.id,
          ruling_id: params.rulingId,
        };
      },
      {
        params: t.Object({
          id: t.String({ minLength: 1, maxLength: 128 }),
          rulingId: t.String({ format: "uuid" }),
        }),
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
            dated: t.Optional(
              t.Nullable(t.String({ pattern: DATE_PATTERN })),
            ),
            source: t.Optional(t.Nullable(t.String({ maxLength: 500 }))),
            apply_to_all_printings: t.Optional(t.Boolean()),
          }),
        }),
        response: {
          200: RulingMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Edit a ruling or note",
          description:
            "Patches an entry reached through this card. A ruling belonging to a different card is rejected as not found.",
        },
      },
    )
    .delete(
      "/cards/:id/rulings/:rulingId",
      async ({ params, adminUser, status }) => {
        if (!repository) {
          return status(503, {
            error: "Admin data service unavailable",
            code: "SERVICE_UNAVAILABLE",
          });
        }
        const rpcResult = await safely("card.ruling.delete", () =>
          repository.callRpc("admin_delete_card_ruling", {
            p_card_id: params.id,
            p_ruling_id: params.rulingId,
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
          card_id: params.id,
          ruling_id: params.rulingId,
        };
      },
      {
        params: t.Object({
          id: t.String({ minLength: 1, maxLength: 128 }),
          rulingId: t.String({ format: "uuid" }),
        }),
        response: {
          200: RulingMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Delete a ruling or note",
          description:
            "Removes an entry reached through this card. A ruling shared with other cards is detached from this one instead of destroyed.",
        },
      },
    )

    // ── Rulings tab ───────────────────────────────────────────────────────────
    // Card-independent CRUD. Unlike the per-card routes above, these can point a
    // ruling at several printings at once, or at a search query that keeps
    // matching new cards as they are released.
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
            "Every ruling with its targets, newest first. `q` matches ruling text or source; `kind` narrows to rulings carrying a target of that kind.",
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
            "Evaluates a rule query without storing anything, returning the match count plus a bounded sample. Backs the rule editor's live readout.",
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
        const rpcResult = await safely(
          "set.create",
          () =>
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
          set_code: t.String({
            minLength: 1,
            maxLength: 32,
            pattern: NON_BLANK_PATTERN,
          }),
          definition: AdminSetDefinitionSchema,
        }),
        response: {
          200: SetMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Create a manual set",
          description:
            "Creates a live set and durable manual-set definition in one transaction.",
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
        const rpcResult = await safely(
          "set.patch",
          () =>
            repository.callRpc("admin_patch_set", {
              p_set_code: setCode,
              p_patch: patch,
              p_note: body.note ?? null,
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
          patch: AdminSetPatchSchema,
          note: t.Optional(t.String({ maxLength: 2000 })),
        }),
        response: {
          200: SetMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Patch a set",
          description:
            "Applies a set patch immediately and stores the durable override.",
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
        const rpcResult = await safely(
          "set.delete",
          () =>
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
          t.Object({
            reason: t.Optional(t.String({ maxLength: 2000 })),
          }),
        ),
        response: {
          200: SetMutationResponseSchema,
          ...AdminErrorResponses,
        },
        detail: {
          tags: ["Admin"],
          summary: "Delete a set",
          description:
            "Creates a durable set deletion and removes an empty live set.",
        },
      },
    );
}
