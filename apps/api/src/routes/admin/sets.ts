import { t, Elysia } from "elysia";
import {
  SetCodeSchema,
  AdminSetPatchSchema,
  AdminSetDefinitionSchema,
  SetMutationResponseSchema,
  AdminErrorResponses,
} from "./schemas";
import { mutationFailure, safely, type AdminRouteContext } from "./shared";

// ─── Admin sets ───────────────────────────────────────────────────────────────

/** Set create, patch and soft delete. */
export function setRoutes(ctx: AdminRouteContext) {
  const { repository } = ctx;
  return (
    new Elysia()
      .use(ctx.adminPlugin)
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
                  parent_set_code: body.definition.parent_set_code.trim().toUpperCase(),
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
                  parent_set_code: body.patch.parent_set_code.trim().toUpperCase(),
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
            description: "Updates a set. Patched keys are locked against the next ingest.",
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
          body: t.Optional(t.Object({ reason: t.Optional(t.String({ maxLength: 2000 })) })),
          response: {
            200: SetMutationResponseSchema,
            ...AdminErrorResponses,
          },
          detail: {
            tags: ["Admin"],
            summary: "Delete a set",
            description: "Soft-deletes an empty set. A set that still holds printings is refused.",
          },
        },
      )
  );
}
