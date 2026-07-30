import { Elysia, t } from "elysia";
import type { Card } from "@riftseer/types";
import {
  buildPublicSlugSegments,
  generatePublicSlug,
  joinPublicSlug,
  normalizeCardName,
} from "@riftseer/types";
import { authAdminClient } from "../lib/supabase";
import {
  AdminRepositoryError,
  createAdminDataRepository,
  type AdminDataRepository,
  type AdminRpcResult,
  type AdminSlugCard,
} from "../lib/admin-data";
import {
  adminPlugin,
  createAdminPlugin,
} from "../plugins/admin-auth";
import { ErrorSchema } from "../schemas";

const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";
const NON_BLANK_PATTERN = ".*\\S.*";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
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
          patch.name_normalized = normalizeCardName(name);
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
