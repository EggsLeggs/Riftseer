import { Elysia } from "elysia";
import { authClient } from "../lib/supabase";

export interface AuthenticatedUser {
  id: string;
  email?: string;
  created_at: string;
}

export type AuthTokenResolver = (
  token: string,
) => Promise<AuthenticatedUser | null>;

export const resolveSupabaseToken: AuthTokenResolver = async (token) => {
  // Read the imported binding at request time. Besides avoiding stale config in
  // long-lived isolates, this keeps Bun module mocks usable across the full
  // route test suite.
  if (!authClient) {
    throw new Error("Auth service unavailable");
  }
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);
  return error || !user
    ? null
    : {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      };
};

export type BearerAuthResult =
  | { user: AuthenticatedUser }
  | {
      status: 401 | 503;
      error: string;
      code: string;
    };

export async function resolveBearerUser(
  authorization: string | undefined,
  resolveToken: AuthTokenResolver | null = resolveSupabaseToken,
): Promise<BearerAuthResult> {
  if (!resolveToken) {
    return {
      status: 503,
      error: "Auth service unavailable",
      code: "SERVICE_UNAVAILABLE",
    };
  }
  if (!authorization?.startsWith("Bearer ")) {
    return {
      status: 401,
      error: "Missing or invalid Authorization header",
      code: "MISSING_TOKEN",
    };
  }

  try {
    const user = await resolveToken(authorization.slice(7));
    return user
      ? { user }
      : {
          status: 401,
          error: "Invalid or expired token",
          code: "INVALID_TOKEN",
        };
  } catch (error) {
    // The public response stays deliberately opaque; the detail only goes to
    // the Worker log, where an auth outage is otherwise invisible.
    console.error(
      JSON.stringify({
        message: "auth token resolution failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return {
      status: 503,
      error: "Auth service unavailable",
      code: "SERVICE_UNAVAILABLE",
    };
  }
}

export function createAuthPlugin(
  resolveToken: AuthTokenResolver | null = resolveSupabaseToken,
) {
  return new Elysia({ name: "auth" })
    .resolve({ as: "scoped" }, async ({ headers, status }) => {
      const result = await resolveBearerUser(
        headers.authorization,
        resolveToken,
      );
      if (!("user" in result)) {
        return status(result.status, {
          error: result.error,
          code: result.code,
        });
      }
      return { user: result.user };
    });
}

export const authPlugin = createAuthPlugin();
