import { Elysia } from "elysia";
import { authClient } from "../lib/supabase";

export const authPlugin = new Elysia({ name: "auth" })
  .resolve({ as: "scoped" }, async ({ headers, status }) => {
    if (!authClient) {
      return status(503, { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" });
    }
    if (!headers.authorization?.startsWith("Bearer ")) {
      return status(401, { error: "Missing or invalid Authorization header", code: "MISSING_TOKEN" });
    }
    const token = headers.authorization.slice(7);
    let user, authError;
    try {
      ({ data: { user }, error: authError } = await authClient.auth.getUser(token));
    } catch {
      return status(503, { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" });
    }
    if (authError || !user) {
      return status(401, { error: "Invalid or expired token", code: "INVALID_TOKEN" });
    }
    return { user };
  });
