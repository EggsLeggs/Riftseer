import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = process.env.SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/**
 * Identity can live somewhere other than the data.
 *
 * The local docker stack serves PostgREST and nothing else, because Supabase
 * Auth is GoTrue — a separate service with its own schema. Running it locally
 * to click through the admin UI is a lot of moving parts for something that is
 * not what you are testing, so `SUPABASE_AUTH_URL` lets sign-in resolve against
 * a real Supabase project while every card read and write stays local.
 *
 * Defaults to `SUPABASE_URL`, so unset means the previous single-project
 * behaviour. Only token verification and sign-in follow it; `authAdminClient`
 * deliberately does not, because it writes `linked_accounts` rows that belong
 * to whichever database the rest of the app is using.
 */
export const supabaseAuthUrl = process.env.SUPABASE_AUTH_URL || supabaseUrl;
const supabaseAuthAnonKey =
  process.env.SUPABASE_AUTH_ANON_KEY || supabaseAnonKey;

export const authClient =
  supabaseAuthUrl && supabaseAuthAnonKey
    ? createClient(supabaseAuthUrl, supabaseAuthAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

/** Service-role client for trusted writes (e.g. app_metadata). Never expose this key to browsers. */
export const authAdminClient =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;
