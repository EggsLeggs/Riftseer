import { t, Elysia } from "elysia";
import { AuditLogResponseSchema, StatsResponseSchema, AdminErrorResponses } from "./schemas";
import { AUDIT_LOG_MAX_LIMIT, safely, type AdminRouteContext } from "./shared";

// ─── Admin dashboard reads ────────────────────────────────────────────────────

/** The audit log, newest first. */
export function auditLogRoutes(ctx: AdminRouteContext) {
  const { repository } = ctx;
  return new Elysia().use(ctx.adminPlugin).get(
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
      const offset = Math.max(Number.parseInt(query.offset ?? "0", 10) || 0, 0);

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
  );
}

/** Catalogue counts and the review backlog. */
export function statsRoutes(ctx: AdminRouteContext) {
  const { repository } = ctx;
  return new Elysia().use(ctx.adminPlugin).get(
    "/stats",
    async ({ status }) => {
      if (!repository) {
        return status(503, {
          error: "Admin data service unavailable",
          code: "SERVICE_UNAVAILABLE",
        });
      }
      const result = await safely("stats.read", () => repository.getStats());
      if ("error" in result) {
        return status(result.error.status, result.error.body);
      }
      return {
        sets: result.data.sets,
        oracles: result.data.oracles,
        printings: result.data.printings,
        pending_review: result.data.pendingReview,
      };
    },
    {
      response: { 200: StatsResponseSchema, ...AdminErrorResponses },
      detail: {
        tags: ["Admin"],
        summary: "Dashboard totals",
        description:
          "Live counts of sets, oracles and printings, plus the pending review backlog. Oracles and printings are counted separately because one card carries many printings — a single catalogue number would answer neither question.",
      },
    },
  );
}
