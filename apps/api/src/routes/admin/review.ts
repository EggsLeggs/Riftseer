import { t, Elysia } from "elysia";
import { isConfirmableReconciliationField } from "@riftseer/types/reconciliation";
import type { AdminReconciliationEntry } from "../../repos/admin.repo";
import {
  ReconciliationStatusQuerySchema,
  ReconciliationKindQuerySchema,
  ReconciliationSourceQuerySchema,
  ReconciliationListResponseSchema,
  ReconciliationMutationResponseSchema,
  AdminErrorResponses,
} from "./schemas";
import {
  NON_BLANK_PATTERN,
  RECONCILIATION_MAX_LIMIT,
  mutationFailure,
  safely,
  type AdminRouteContext,
} from "./shared";

// ─── Reconciliation review queue ──────────────────────────────────────────────

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

/** Proposals route through the normal admin mutations so locks survive ingest. */
export function reviewRoutes(ctx: AdminRouteContext) {
  const { repository } = ctx;
  return (
    new Elysia()
      .use(ctx.adminPlugin)
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
          const offset = Math.max(Number.parseInt(query.offset ?? "0", 10) || 0, 0);

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

          const printingId = body?.printing_id?.trim() || entry.proposed_printing_id || null;
          let oracleId = body?.oracle_id?.trim() || entry.proposed_oracle_id || null;

          const hasOraclePatch = Object.keys(patch.oracle).length > 0;
          const hasPrintingPatch = Object.keys(patch.printing).length > 0;
          if (hasPrintingPatch && !printingId) {
            return status(400, {
              error: "Choose a printing to apply this to",
              code: "REVIEW_TARGET_REQUIRED",
            });
          }

          // A field_diff names one printing and never carries proposed_oracle_id,
          // so an oracle-level field (type, energy, might, power) would otherwise
          // be unconfirmable no matter what the admin chose. The printing knows
          // its oracle; ask it rather than making the queue carry the id.
          if (hasOraclePatch && !oracleId && printingId) {
            const derived = await safely("reconciliation.confirm.oracle-lookup", () =>
              repository.getPrintingOracleId(printingId),
            );
            if ("error" in derived) {
              return status(derived.error.status, derived.error.body);
            }
            oracleId = derived.data;
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
  );
}
