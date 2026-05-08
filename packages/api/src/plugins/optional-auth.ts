import { Elysia } from "elysia";
import { authClient } from "../lib/supabase";

export const optionalAuthPlugin = new Elysia({ name: "optional-auth" })
  .derive({ as: "scoped" }, async ({ headers }) => {
    const token = headers.authorization?.slice(7);
    if (!token || !authClient) return { user: null };
    try {
      const { data: { user } } = await authClient.auth.getUser(token);
      return { user };
    } catch {
      return { user: null };
    }
  });
