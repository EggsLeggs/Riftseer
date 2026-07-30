import { Elysia } from "elysia";
import {
  type AuthenticatedUser,
  type AuthTokenResolver,
  resolveBearerUser,
  resolveSupabaseToken,
} from "./auth";

export function parseAdminUserIds(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function isAdminUser(
  user: Pick<AuthenticatedUser, "id">,
  raw: string | undefined = process.env.ADMIN_USER_IDS,
): boolean {
  return parseAdminUserIds(raw).has(user.id);
}

export function createAdminPlugin(
  resolveToken: AuthTokenResolver | null = resolveSupabaseToken,
  getAdminUserIds: () => string | undefined = () =>
    process.env.ADMIN_USER_IDS,
) {
  return new Elysia({ name: "admin-auth" })
    .resolve({ as: "scoped" }, async ({ headers, status }) => {
      const authResult = await resolveBearerUser(
        headers.authorization,
        resolveToken,
      );
      if (!("user" in authResult)) {
        return status(authResult.status, {
          error: authResult.error,
          code: authResult.code,
        });
      }
      if (!isAdminUser(authResult.user, getAdminUserIds())) {
        return status(403, {
          error: "Admin access required",
          code: "ADMIN_REQUIRED",
        });
      }
      return { adminUser: authResult.user };
    });
}

export const adminPlugin = createAdminPlugin();
