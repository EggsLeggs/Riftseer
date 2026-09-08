import { t, Elysia } from "elysia";
import { generateOracleSlug, normalizeCardName, slugifyCardName } from "@riftseer/types";
import { oracleKeyForName } from "@riftseer/types/oracle";
import {
  AdminOraclePatchSchema,
  AdminOracleDefinitionSchema,
  AdminRelationshipEntrySchema,
  AdminOracleRelationshipsResponseSchema,
  OracleMutationResponseSchema,
  AdminErrorResponses,
} from "./schemas";
import { mutationFailure, safely, type AdminRouteContext } from "./shared";

// ─── Admin oracles ────────────────────────────────────────────────────────────

/** Oracle create, patch, soft delete, restore and relationship edges. */
export function oracleRoutes(ctx: AdminRouteContext) {
  const { repository } = ctx;
  return (
    new Elysia()
      .use(ctx.adminPlugin)
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
              p_slug: generateOracleSlug(name, (slug) => takenResult.data.has(slug)),
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
          body: t.Optional(t.Object({ reason: t.Optional(t.String({ maxLength: 2000 })) })),
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
  );
}
