import { Elysia } from "elysia";
import {
  type AuthenticatedUser,
  type AuthTokenResolver,
  resolveBearerUser,
  resolveSupabaseToken,
} from "./auth";

// Both sides are lowercased: these are Supabase user UUIDs, whose canonical
// form is lowercase, but a hand-pasted ADMIN_USER_IDS entry may not be. An
// undefined value still yields an empty set, so the gate stays closed.
export function parseAdminUserIds(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminUser(
  user: Pick<AuthenticatedUser, "id">,
  raw: string | undefined = process.env.ADMIN_USER_IDS,
): boolean {
  return parseAdminUserIds(raw).has(user.id.toLowerCase());
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
