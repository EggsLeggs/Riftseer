import { Elysia } from "elysia";
import {
  type AuthenticatedUser,
  type AuthTokenResolver,
  resolveSupabaseToken,
} from "./auth";

/**
 * Auth that never rejects: a valid bearer token becomes a user, anything else
 * becomes `null`.
 *
 * Used by routes whose answer *depends* on who is asking but which are still
 * meaningful anonymously — a public deck reads the same for a signed-out
 * visitor as for a stranger, and a bad token must not turn that into a 401.
 */
export function createOptionalAuthPlugin(
  resolveToken: AuthTokenResolver | null = resolveSupabaseToken,
) {
  return new Elysia({ name: "optional-auth" }).derive(
    { as: "scoped" },
    async ({ headers }): Promise<{ user: AuthenticatedUser | null }> => {
      if (!resolveToken || !headers.authorization?.startsWith("Bearer ")) {
        return { user: null };
      }
      try {
        return { user: await resolveToken(headers.authorization.slice(7)) };
      } catch {
        return { user: null };
      }
    },
  );
}

export const optionalAuthPlugin = createOptionalAuthPlugin();
