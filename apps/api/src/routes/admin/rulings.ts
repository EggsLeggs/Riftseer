import { t, Elysia } from "elysia";
import { BadCardSearchQueryError, CARD_SEARCH_LIMITS, parseCardSearchQuery } from "@riftseer/core";
import {
  RulingTypeSchema,
  RulingTargetInputSchema,
  RulingsPageSchema,
  RulingRecordResponseSchema,
  RulePreviewResponseSchema,
  AdminErrorResponses,
} from "./schemas";
import {
  DATE_PATTERN,
  NON_BLANK_PATTERN,
  mutationFailure,
  safely,
  type FailureResponse,
  type AdminRouteContext,
} from "./shared";

// ─── Admin rulings ────────────────────────────────────────────────────────────

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
): { targets: Array<Record<string, unknown>> } | { error: FailureResponse } {
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

/** Rulings are edited here, apart from the cards they land on. */
export function rulingRoutes(ctx: AdminRouteContext) {
  const { repository } = ctx;
  return (
    new Elysia()
      .use(ctx.adminPlugin)
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
              t.Union([t.Literal("oracle"), t.Literal("printing"), t.Literal("query")]),
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
          const built = buildRulingTargets([{ kind: "query", query: body.query }]);
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
              targets: t.Optional(t.Array(RulingTargetInputSchema, { minItems: 1, maxItems: 100 })),
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
            description: "Deletes a ruling and every target it carries, wherever it appeared.",
          },
        },
      )
  );
}
