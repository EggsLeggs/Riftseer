import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = process.env.SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? "";

export const authClient =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;
