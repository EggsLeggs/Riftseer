import { Elysia, t } from "elysia";
import { authAdminClient, authClient } from "../lib/supabase";
import { authPlugin } from "../plugins/auth";
import { ErrorSchema } from "../schemas";

const ProfileSchema = t.Object({
  id: t.String(),
  handle: t.String(),
  username: t.String(),
  follower_count: t.Number(),
  following_count: t.Number(),
  created_at: t.String(),
  is_following: t.Optional(t.Boolean()),
});

const ProfileStubSchema = t.Object({
  id: t.String(),
  handle: t.String(),
  username: t.String(),
  created_at: t.String(),
});

const ProfileListSchema = t.Object({
  items: t.Array(ProfileStubSchema),
  total: t.Number(),
});

export function usersRoutes() {
  return (
    new Elysia()

      // ── GET /users/:handle ────────────────────────────────────────────────
      .get(
        "/users/:handle",
        async ({ params, headers, set }) => {
          if (!authAdminClient) {
            set.status = 503;
            return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
          }
          const handle = params.handle.toLowerCase();

          const { data: profile, error: profileError } = await authAdminClient
            .from("profiles")
            .select("id, handle, username, created_at")
            .eq("handle", handle)
            .single();

          if (profileError || !profile) {
            set.status = 404;
            return { error: "Profile not found", code: "NOT_FOUND" };
          }

          const [{ count: followerCount }, { count: followingCount }] = await Promise.all([
            authAdminClient
              .from("follows")
              .select("*", { count: "exact", head: true })
              .eq("following_id", profile.id),
            authAdminClient
              .from("follows")
              .select("*", { count: "exact", head: true })
              .eq("follower_id", profile.id),
          ]);

          let isFollowing: boolean | undefined;
          if (authClient && headers.authorization?.startsWith("Bearer ")) {
            const token = headers.authorization.slice(7);
            try {
              const { data: { user: requester } } = await authClient.auth.getUser(token);
              if (requester && requester.id !== profile.id) {
                const { count } = await authAdminClient
                  .from("follows")
                  .select("*", { count: "exact", head: true })
                  .eq("follower_id", requester.id)
                  .eq("following_id", profile.id);
                isFollowing = (count ?? 0) > 0;
              }
            } catch {
              // auth is optional on this endpoint
            }
          }

          return {
            id: profile.id as string,
            handle: profile.handle as string,
            username: profile.username as string,
            follower_count: followerCount ?? 0,
            following_count: followingCount ?? 0,
            created_at: profile.created_at as string,
            ...(isFollowing !== undefined ? { is_following: isFollowing } : {}),
          };
        },
        {
          params: t.Object({ handle: t.String() }),
          response: {
            200: ProfileSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Users"],
            summary: "Get user profile",
            description: "Returns a public user profile by @handle, with follower/following counts.",
          },
        },
      )

      // ── GET /users/:handle/followers ──────────────────────────────────────
      .get(
        "/users/:handle/followers",
        async ({ params, query, set }) => {
          if (!authAdminClient) {
            set.status = 503;
            return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
          }
          const handle = params.handle.toLowerCase();
          const limit = Math.min(query.limit ?? 20, 100);
          const offset = query.offset ?? 0;

          const { data: target } = await authAdminClient
            .from("profiles")
            .select("id")
            .eq("handle", handle)
            .single();

          if (!target) {
            set.status = 404;
            return { error: "Profile not found", code: "NOT_FOUND" };
          }

          const { data: rows, count } = await authAdminClient
            .from("follows")
            .select("follower_id", { count: "exact" })
            .eq("following_id", target.id)
            .range(offset, offset + limit - 1);

          const ids = (rows ?? []).map((r: { follower_id: string }) => r.follower_id);
          const profiles = ids.length
            ? ((await authAdminClient
                .from("profiles")
                .select("id, handle, username, created_at")
                .in("id", ids)).data ?? [])
            : [];

          return { items: profiles, total: count ?? 0 };
        },
        {
          params: t.Object({ handle: t.String() }),
          query: t.Object({
            limit: t.Optional(t.Number()),
            offset: t.Optional(t.Number()),
          }),
          response: {
            200: ProfileListSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Users"],
            summary: "Get followers",
            description: "Returns a paginated list of profiles that follow the given user.",
          },
        },
      )

      // ── GET /users/:handle/following ──────────────────────────────────────
      .get(
        "/users/:handle/following",
        async ({ params, query, set }) => {
          if (!authAdminClient) {
            set.status = 503;
            return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
          }
          const handle = params.handle.toLowerCase();
          const limit = Math.min(query.limit ?? 20, 100);
          const offset = query.offset ?? 0;

          const { data: target } = await authAdminClient
            .from("profiles")
            .select("id")
            .eq("handle", handle)
            .single();

          if (!target) {
            set.status = 404;
            return { error: "Profile not found", code: "NOT_FOUND" };
          }

          const { data: rows, count } = await authAdminClient
            .from("follows")
            .select("following_id", { count: "exact" })
            .eq("follower_id", target.id)
            .range(offset, offset + limit - 1);

          const ids = (rows ?? []).map((r: { following_id: string }) => r.following_id);
          const profiles = ids.length
            ? ((await authAdminClient
                .from("profiles")
                .select("id, handle, username, created_at")
                .in("id", ids)).data ?? [])
            : [];

          return { items: profiles, total: count ?? 0 };
        },
        {
          params: t.Object({ handle: t.String() }),
          query: t.Object({
            limit: t.Optional(t.Number()),
            offset: t.Optional(t.Number()),
          }),
          response: {
            200: ProfileListSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Users"],
            summary: "Get following",
            description: "Returns a paginated list of profiles that the given user follows.",
          },
        },
      )

      // ── Protected: follow / unfollow ──────────────────────────────────────
      .use(
        new Elysia()
          .use(authPlugin)

          // POST /users/:handle/follow
          .post(
            "/users/:handle/follow",
            async ({ params, user, set }) => {
              if (!authAdminClient) {
                set.status = 503;
                return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
              }
              const handle = params.handle.toLowerCase();

              const { data: target } = await authAdminClient
                .from("profiles")
                .select("id")
                .eq("handle", handle)
                .single();

              if (!target) {
                set.status = 404;
                return { error: "Profile not found", code: "NOT_FOUND" };
              }
              if (target.id === user.id) {
                set.status = 400;
                return { error: "Cannot follow yourself", code: "SELF_FOLLOW" };
              }

              const { error: followError } = await authAdminClient
                .from("follows")
                .insert({ follower_id: user.id, following_id: target.id });

              if (followError) {
                if (followError.code === "23505") {
                  return { message: "Already following" };
                }
                set.status = 500;
                return { error: "Failed to follow", code: "FOLLOW_FAILED" };
              }

              return { message: "Followed successfully" };
            },
            {
              params: t.Object({ handle: t.String() }),
              response: {
                200: t.Object({ message: t.String() }),
                400: ErrorSchema,
                401: ErrorSchema,
                404: ErrorSchema,
                503: ErrorSchema,
              },
              detail: { tags: ["Users"], summary: "Follow user" },
            },
          )

          // DELETE /users/:handle/follow
          .delete(
            "/users/:handle/follow",
            async ({ params, user, set }) => {
              if (!authAdminClient) {
                set.status = 503;
                return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
              }
              const handle = params.handle.toLowerCase();

              const { data: target } = await authAdminClient
                .from("profiles")
                .select("id")
                .eq("handle", handle)
                .single();

              if (!target) {
                set.status = 404;
                return { error: "Profile not found", code: "NOT_FOUND" };
              }

              await authAdminClient
                .from("follows")
                .delete()
                .eq("follower_id", user.id)
                .eq("following_id", target.id);

              return { message: "Unfollowed successfully" };
            },
            {
              params: t.Object({ handle: t.String() }),
              response: {
                200: t.Object({ message: t.String() }),
                401: ErrorSchema,
                404: ErrorSchema,
                503: ErrorSchema,
              },
              detail: { tags: ["Users"], summary: "Unfollow user" },
            },
          ),
      )
  );
}
