import { Elysia } from "elysia";
import { authClient } from "../lib/supabase";

export const authPlugin = new Elysia({ name: "auth" })
  .resolve({ as: "scoped" }, async ({ headers, status }) => {
    if (!authClient) {
      return status(503, { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" });
    }
    const token = headers.authorization?.slice(7);
    if (!token) {
      return status(401, { error: "Missing or invalid Authorization header", code: "MISSING_TOKEN" });
    }
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return status(401, { error: "Invalid or expired token", code: "INVALID_TOKEN" });
    }
    return { user };
  });
