import { t, Elysia } from "elysia";
import {
  FORMAT_CODE_PATTERN,
  LegalityStatusInputSchema,
  AdminPrintingLegalitiesResponseSchema,
  LegalityMutationResponseSchema,
  AdminPrintingRulingsResponseSchema,
  AdminErrorResponses,
} from "./schemas";
import { mutationFailure, safely, type AdminRouteContext } from "./shared";

// ─── Admin printing legalities and rulings readout ────────────────────────────

/** Per-printing legality rows and the rulings that land on a printing. */
export function legalityRoutes(ctx: AdminRouteContext) {
  const { repository } = ctx;
  return (
    new Elysia()
      .use(ctx.adminPlugin)
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

          // The note lives on the stored row, so clearing the status discards it
          // with the row rather than orphaning an explanation of nothing.
          const note = body.note?.trim() || null;
          const rpcResult = await safely("printing.legality", () =>
            repository.callRpc("admin_set_legality", {
              p_oracle_id: oracleId,
              p_printing_id: applyToAll ? null : params.id,
              p_format_code: formatCode,
              // `default` clears the row; every other value is stored as-is.
              p_status: body.status === "default" ? null : body.status,
              p_note: note,
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
            note: body.status === "default" ? null : note,
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
            note: t.Optional(
              t.Nullable(
                t.String({
                  maxLength: 500,
                  description:
                    "Admin-facing explanation shown wherever this status is reported — e.g. “restricted to 1 copy as of the 2026-07 update”.",
                }),
              ),
            ),
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
              "With apply_to_all_printings the status is stored on the card and every per-printing exception for that format is cleared; without it, only this printing is affected. `default` removes the stored status (absence means legal), and takes any note with it.",
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
  );
}
