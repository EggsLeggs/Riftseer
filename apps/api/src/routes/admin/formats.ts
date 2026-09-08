import { t, Elysia } from "elysia";
import { LegalityStatusSchema } from "../../schemas";
import {
  FORMAT_CODE_PATTERN,
  DeckZoneSchema,
  ViolationSeverityInputSchema,
  AdminFormatListResponseSchema,
  FormatMutationResponseSchema,
  FormatDeleteResponseSchema,
  FormatZoneRuleMutationResponseSchema,
  FormatZoneRuleDeleteResponseSchema,
  FormatSeverityMutationResponseSchema,
  AdminErrorResponses,
} from "./schemas";
import { NON_BLANK_PATTERN, mutationFailure, safely, type AdminRouteContext } from "./shared";

// ─── Admin formats and construction rules ─────────────────────────────────────

/** Formats, their order, zone rules and severity overrides. */
export function formatRoutes(ctx: AdminRouteContext) {
  const { repository } = ctx;
  return (
    new Elysia()
      .use(ctx.adminPlugin)
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
          const result = await safely("format.list", () => repository.listFormats());
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

      // ── Format construction rules ─────────────────────────────────────────────
      //
      // A rule per zone, and a format with no rules constrains nothing. Every
      // bound is nullable, and an omitted or null bound is *unconstrained* — the
      // reason these are three nullable numbers rather than three numbers with a
      // sentinel is that `0` is a legitimate limit and must not read as "any".
      .put(
        "/formats/:code/zone-rules/:zone",
        async ({ params, body, adminUser, status }) => {
          if (!repository) {
            return status(503, {
              error: "Admin data service unavailable",
              code: "SERVICE_UNAVAILABLE",
            });
          }
          const code = params.code.trim().toLowerCase();
          const rpcResult = await safely("format.zone_rule", () =>
            repository.callRpc("admin_set_format_zone_rule", {
              p_code: code,
              p_zone: params.zone,
              p_min_count: body.min_count ?? null,
              p_max_count: body.max_count ?? null,
              p_copy_limit: body.copy_limit ?? null,
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
            zone: params.zone,
            min_count: body.min_count ?? null,
            max_count: body.max_count ?? null,
            copy_limit: body.copy_limit ?? null,
          };
        },
        {
          params: t.Object({
            code: t.String({ minLength: 1, maxLength: 64 }),
            zone: DeckZoneSchema,
          }),
          body: t.Object({
            min_count: t.Optional(t.Nullable(t.Integer({ minimum: 0, maximum: 1000 }))),
            max_count: t.Optional(t.Nullable(t.Integer({ minimum: 0, maximum: 1000 }))),
            copy_limit: t.Optional(t.Nullable(t.Integer({ minimum: 0, maximum: 1000 }))),
          }),
          response: {
            200: FormatZoneRuleMutationResponseSchema,
            ...AdminErrorResponses,
          },
          detail: {
            tags: ["Admin"],
            summary: "Set a format's rule for one zone",
            description:
              "Upserts the zone's minimum, maximum and per-oracle copy limit. Send null (or omit) a bound to leave that aspect unconstrained — null is not zero.",
          },
        },
      )
      .delete(
        "/formats/:code/zone-rules/:zone",
        async ({ params, adminUser, status }) => {
          if (!repository) {
            return status(503, {
              error: "Admin data service unavailable",
              code: "SERVICE_UNAVAILABLE",
            });
          }
          const code = params.code.trim().toLowerCase();
          const rpcResult = await safely("format.zone_rule.delete", () =>
            repository.callRpc("admin_delete_format_zone_rule", {
              p_code: code,
              p_zone: params.zone,
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
            zone: params.zone,
            deleted: rpcResult.data.deleted === true,
          };
        },
        {
          params: t.Object({
            code: t.String({ minLength: 1, maxLength: 64 }),
            zone: DeckZoneSchema,
          }),
          response: {
            200: FormatZoneRuleDeleteResponseSchema,
            ...AdminErrorResponses,
          },
          detail: {
            tags: ["Admin"],
            summary: "Remove a format's rule for one zone",
            description:
              "Leaves the zone unconstrained. Idempotent: removing a rule that is not there succeeds with deleted=false.",
          },
        },
      )
      .put(
        "/formats/:code/severities/:legality_status",
        async ({ params, body, adminUser, status }) => {
          if (!repository) {
            return status(503, {
              error: "Admin data service unavailable",
              code: "SERVICE_UNAVAILABLE",
            });
          }
          const code = params.code.trim().toLowerCase();
          // `default` is not a severity: it removes the override so the status
          // falls back to DEFAULT_LEGALITY_SEVERITY, rather than storing a row
          // that duplicates the shared mapping and then drifts from it.
          const severity = body.severity === "default" ? null : body.severity;
          const rpcResult = await safely("format.legality_severity", () =>
            repository.callRpc("admin_set_format_legality_severity", {
              p_code: code,
              p_status: params.legality_status,
              p_severity: severity,
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
            status: params.legality_status,
            severity,
          };
        },
        {
          params: t.Object({
            code: t.String({ minLength: 1, maxLength: 64 }),
            legality_status: LegalityStatusSchema,
          }),
          body: t.Object({ severity: ViolationSeverityInputSchema }),
          response: {
            200: FormatSeverityMutationResponseSchema,
            ...AdminErrorResponses,
          },
          detail: {
            tags: ["Admin"],
            summary: "Override how loudly a status reads in one format",
            description:
              "Stores this format's departure from the shared default severity mapping. `default` deletes the override and falls back; `none` is a stored decision that the status should say nothing.",
          },
        },
      )
  );
}
