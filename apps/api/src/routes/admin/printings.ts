import { t, Elysia } from "elysia";
import {
  buildPublicSlugSegments,
  generatePublicSlug,
  joinPublicSlug,
  type SlugPrinting,
} from "@riftseer/types";
import {
  SetCodeSchema,
  AdminPrintingPatchSchema,
  AdminPrintingDefinitionSchema,
  AdminPrintingDeltaSchema,
  PrintingMutationResponseSchema,
  SlugMutationResponseSchema,
  PrintingStateQuerySchema,
  PrintingListResponseSchema,
  AdminErrorResponses,
} from "./schemas";
import {
  NON_BLANK_PATTERN,
  PRINTING_LIST_MAX_LIMIT,
  mutationFailure,
  safely,
  type AdminRouteContext,
} from "./shared";

// ─── Admin printings ──────────────────────────────────────────────────────────

/** Printing listing, create, patch, delete, restore, slug and delta. */
export function printingRoutes(ctx: AdminRouteContext) {
  const { repository } = ctx;
  return (
    new Elysia()
      .use(ctx.adminPlugin)
      // ── Printings ─────────────────────────────────────────────────────────────
      .get(
        "/printings",
        async ({ query, status }) => {
          if (!repository) {
            return status(503, {
              error: "Admin data service unavailable",
              code: "SERVICE_UNAVAILABLE",
            });
          }

          const limit = Math.min(
            Math.max(Number.parseInt(query.limit ?? "50", 10) || 50, 1),
            PRINTING_LIST_MAX_LIMIT,
          );
          const offset = Math.max(Number.parseInt(query.offset ?? "0", 10) || 0, 0);

          const result = await safely("printing.list", () =>
            repository.listPrintings({
              limit,
              offset,
              state: query.state ?? "live",
              q: query.q?.trim() || undefined,
              setCode: query.set?.trim().toUpperCase() || undefined,
              id: query.id?.trim() || undefined,
            }),
          );
          if ("error" in result) {
            return status(result.error.status, result.error.body);
          }

          return {
            printings: result.data.printings,
            total: result.data.total,
            limit,
            offset,
          };
        },
        {
          query: t.Object({
            limit: t.Optional(t.String()),
            offset: t.Optional(t.String()),
            state: t.Optional(PrintingStateQuerySchema),
            q: t.Optional(t.String()),
            set: t.Optional(t.String()),
            id: t.Optional(t.String()),
          }),
          response: {
            200: PrintingListResponseSchema,
            ...AdminErrorResponses,
          },
          detail: {
            tags: ["Admin"],
            summary: "List printings for the admin catalogue",
            description:
              "The admin card list. Unlike public search this can see the catalogue's bookkeeping — soft-deleted rows, manually created rows, admin-locked columns, printings carrying a delta, and printings with no hosted image — none of which the search grammar expresses, because that grammar is a language about cards rather than about the catalogue. Defaults to live printings.",
          },
        },
      )
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
            repository.getTakenPrintingSlugs(joinPublicSlug(buildPublicSlugSegments(slugPrinting))),
          );
          if ("error" in takenResult) {
            return status(takenResult.error.status, takenResult.error.body);
          }

          const rpcResult = await safely("printing.create", () =>
            repository.callRpc("admin_create_printing", {
              p_printing_id: printingId,
              p_oracle_id: body.oracle_id,
              p_set_code: setCode,
              p_public_slug: generatePublicSlug(slugPrinting, (slug) => takenResult.data.has(slug)),
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
          body: t.Optional(t.Object({ reason: t.Optional(t.String({ maxLength: 2000 })) })),
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

          const printingResult = await safely("printing.regenerate_slug.load", () =>
            repository.getSlugPrinting(params.id),
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

          const takenResult = await safely("printing.regenerate_slug.load_slugs", () =>
            repository.getTakenPrintingSlugs(
              joinPublicSlug(buildPublicSlugSegments(slugPrinting)),
              params.id,
            ),
          );
          if ("error" in takenResult) {
            return status(takenResult.error.status, takenResult.error.body);
          }
          const publicSlug = generatePublicSlug(slugPrinting, (slug) => takenResult.data.has(slug));

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
          const delta = body?.delta && Object.keys(body.delta).length > 0 ? body.delta : null;

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
          body: t.Optional(t.Object({ delta: t.Optional(t.Nullable(AdminPrintingDeltaSchema)) })),
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
  );
}
