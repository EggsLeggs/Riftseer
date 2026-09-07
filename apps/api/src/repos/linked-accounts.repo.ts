import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Linked accounts ──────────────────────────────────────────────────────────
//
// Every `linked_accounts` read and write. Metafy is the only provider today,
// and its supporter flag drives supporter perks, so the OAuth routes, the
// login refresh, the webhook and the public profile all come through here.
// Results are returned as PostgREST answers them (`data`, `error`, `count`).

export interface MetafyLinkRow {
  user_id: string;
  provider: "metafy";
  provider_user_id: string;
  provider_username: string | null;
  access_token: string;
  refresh_token: string | null;
  is_supporter: boolean;
  is_member: boolean;
  status_checked_at: string;
  linked_at: string;
}

export interface MetafyStatusPatch {
  is_supporter?: boolean;
  is_member?: boolean;
  status_checked_at: string;
}

export function createLinkedAccountsRepository(client: SupabaseClient) {
  return {
    /** The link as the status route reports it. */
    getMetafyLink(userId: string) {
      return client
        .from("linked_accounts")
        .select(
          "provider, provider_username, is_supporter, is_member, linked_at, status_checked_at",
        )
        .eq("user_id", userId)
        .eq("provider", "metafy")
        .maybeSingle();
    },

    /** The stored token plus what a refresh echoes back unchanged. */
    getMetafyToken(userId: string) {
      return client
        .from("linked_accounts")
        .select("access_token, provider_username, is_member, linked_at")
        .eq("user_id", userId)
        .eq("provider", "metafy")
        .maybeSingle();
    },

    getMetafyAccessToken(userId: string) {
      return client
        .from("linked_accounts")
        .select("access_token")
        .eq("user_id", userId)
        .eq("provider", "metafy")
        .maybeSingle();
    },

    /** The two flags a public profile shows. */
    getMetafyFlags(userId: string) {
      return client
        .from("linked_accounts")
        .select("is_supporter, is_member")
        .eq("user_id", userId)
        .eq("provider", "metafy")
        .maybeSingle();
    },

    /** Webhook events name the Metafy user, not ours. */
    findMetafyLinkByProviderUser(providerUserId: string) {
      return client
        .from("linked_accounts")
        .select("user_id, status_checked_at")
        .eq("provider", "metafy")
        .eq("provider_user_id", providerUserId)
        .maybeSingle();
    },

    upsertMetafyLink(row: MetafyLinkRow) {
      return client.from("linked_accounts").upsert(row, { onConflict: "user_id,provider" });
    },

    updateMetafyStatus(userId: string, patch: MetafyStatusPatch) {
      return client
        .from("linked_accounts")
        .update(patch)
        .eq("user_id", userId)
        .eq("provider", "metafy");
    },

    deleteMetafyLink(userId: string) {
      return client
        .from("linked_accounts")
        .delete({ count: "exact" })
        .eq("user_id", userId)
        .eq("provider", "metafy");
    },
  };
}

export type LinkedAccountsRepository = ReturnType<typeof createLinkedAccountsRepository>;
