import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Profiles and the follow graph ────────────────────────────────────────────
//
// Every `profiles` and `follows` read and write the account routes perform.
// Results are returned as PostgREST answers them (`data`, `error`, `count`)
// because the routes branch on the error codes: `PGRST116` for no rows and
// `23505` for a unique violation.

export interface ProfileStub {
  id: string;
  handle: string;
  username: string;
  created_at: string;
}

export function createProfilesRepository(client: SupabaseClient) {
  return {
    /** The public profile columns, by lower-cased handle. */
    getProfileByHandle(handle: string) {
      return client
        .from("profiles")
        .select("id, handle, username, bio, pronouns, social_links, created_at")
        .eq("handle", handle)
        .single();
    },

    getProfileIdByHandle(handle: string) {
      return client.from("profiles").select("id").eq("handle", handle).single();
    },

    /** The two profile fields a session payload carries. */
    getSessionProfile(userId: string) {
      return client.from("profiles").select("handle, username").eq("id", userId).single();
    },

    /** Resolves profile stubs for `ids`, preserving the order of `ids`. */
    async getProfileStubs(ids: string[]): Promise<ProfileStub[]> {
      if (ids.length === 0) return [];
      const { data } = await client
        .from("profiles")
        .select("id, handle, username, created_at")
        .in("id", ids);
      const byId = new Map<string, ProfileStub>(
        ((data ?? []) as ProfileStub[]).map((p) => [p.id, p]),
      );
      return ids.map((id) => byId.get(id)).filter((p): p is ProfileStub => p !== undefined);
    },

    /** A profile other than `userId` already holding `handle`. */
    getHandleHolder(handle: string, userId: string) {
      return client
        .from("profiles")
        .select("id")
        .eq("handle", handle)
        .neq("id", userId)
        .maybeSingle();
    },

    insertProfile(row: { id: string; username: string; handle: string }) {
      return client.from("profiles").insert(row);
    },

    updateProfile(userId: string, updates: Record<string, unknown>) {
      return client.from("profiles").update(updates).eq("id", userId);
    },

    deleteProfile(userId: string) {
      return client.from("profiles").delete().eq("id", userId);
    },

    countFollowers(profileId: string) {
      return client
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", profileId);
    },

    countFollowing(profileId: string) {
      return client
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", profileId);
    },

    countFollow(followerId: string, followingId: string) {
      return client
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", followerId)
        .eq("following_id", followingId);
    },

    /** Who follows `profileId`, most recent first, with the full count. */
    listFollowerIds(profileId: string, offset: number, limit: number) {
      return client
        .from("follows")
        .select("follower_id", { count: "exact" })
        .eq("following_id", profileId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
    },

    /** Who `profileId` follows, most recent first, with the full count. */
    listFollowingIds(profileId: string, offset: number, limit: number) {
      return client
        .from("follows")
        .select("following_id", { count: "exact" })
        .eq("follower_id", profileId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
    },

    insertFollow(followerId: string, followingId: string) {
      return client.from("follows").insert({ follower_id: followerId, following_id: followingId });
    },

    deleteFollow(followerId: string, followingId: string) {
      return client
        .from("follows")
        .delete()
        .eq("follower_id", followerId)
        .eq("following_id", followingId);
    },
  };
}

export type ProfilesRepository = ReturnType<typeof createProfilesRepository>;
