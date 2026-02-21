import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Returns a lazy singleton Supabase client.
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment.
 * Only throws when called — safe to import without env vars set.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use the Supabase client"
      );
    }
    _client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return _client;
}
