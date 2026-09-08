import { Elysia } from "elysia";
import { authAdminClient } from "../../lib/supabase";
import { createAdminDataRepository, type AdminDataRepository } from "../../repos/admin.repo";
import { adminPlugin, createAdminPlugin } from "../../plugins/admin-auth";
import type { AdminImageBindings, AdminRouteContext } from "./shared";
import { auditLogRoutes, statsRoutes } from "./dashboard";
import { formatRoutes } from "./formats";
import { imageRoutes } from "./images";
import { legalityRoutes } from "./legalities";
import { oracleRoutes } from "./oracles";
import { printingRoutes } from "./printings";
import { reviewRoutes } from "./review";
import { rulingRoutes } from "./rulings";
import { setRoutes } from "./sets";

// ─── Admin routes ─────────────────────────────────────────────────────────────
//
// Every group is mounted under `/admin` behind the scoped admin auth plugin,
// in the order below because the OpenAPI spec lists paths in registration
// order.

export type { AdminImageBindings, AdminImageJob } from "./shared";

export interface AdminRoutesOptions {
  repository?: AdminDataRepository | null;
  imageBindings?: AdminImageBindings | null;
  adminAuthPlugin?: ReturnType<typeof createAdminPlugin>;
}

export function adminRoutes(options: AdminRoutesOptions = {}) {
  const repository =
    options.repository ?? (authAdminClient ? createAdminDataRepository(authAdminClient) : null);
  const imageBindings = options.imageBindings ?? null;
  const routeAdminPlugin = options.adminAuthPlugin ?? adminPlugin;
  const ctx: AdminRouteContext = { repository, imageBindings, adminPlugin: routeAdminPlugin };

  // There is no API-side rule-rematch call any more: every mutating RPC that can
  // move a printing into or out of a rule's reach — admin_patch_oracle,
  // admin_patch_printing, admin_create_printing, admin_set_printing_delta,
  // admin_restore_printing — calls refresh_ruling_matches_for_printing itself
  // before returning, inside the same transaction as the write.

  return new Elysia({ prefix: "/admin" })
    .onError(({ code, error, status }) => {
      if (code === "VALIDATION" || code === "PARSE" || String(code).startsWith("INVALID_")) {
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
    .use(auditLogRoutes(ctx))
    .use(reviewRoutes(ctx))
    .use(oracleRoutes(ctx))
    .use(statsRoutes(ctx))
    .use(printingRoutes(ctx))
    .use(imageRoutes(ctx))
    .use(legalityRoutes(ctx))
    .use(formatRoutes(ctx))
    .use(rulingRoutes(ctx))
    .use(setRoutes(ctx));
}
