import { Elysia, t } from "elysia";
import { SOCIAL_PLATFORM_IDS, validateSocialLink } from "@riftseer/types/social-links";
import { supabaseClients, type SupabaseClients } from "../lib/supabase";
import { createLinkedAccountsRepository } from "../repos/linked-accounts.repo";
import { createProfilesRepository } from "../repos/profiles.repo";
import { authPlugin as defaultAuthPlugin, type createAuthPlugin } from "../plugins/auth";
import { ErrorSchema } from "../schemas";

const ProfileSchema = t.Object({
  id: t.String(),
  handle: t.String(),
  username: t.String(),
  bio: t.Nullable(t.String()),
  pronouns: t.Array(t.String()),
  social_links: t.Record(t.String(), t.String()),
  follower_count: t.Number(),
  following_count: t.Number(),
  created_at: t.String(),
  is_following: t.Optional(t.Boolean()),
  is_supporter: t.Boolean(),
  is_member: t.Boolean(),
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

const HANDLE_RE = /^[a-z0-9_]{3,30}$/;
const SOCIAL_LINK_MAX = 500;

const FollowListQuerySchema = t.Object({
  limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 20 })),
  offset: t.Optional(t.Number({ minimum: 0, default: 0 })),
});

function clampPaging(query: { limit?: number; offset?: number }) {
  return {
    limit: Math.min(Math.max(Math.trunc(query.limit ?? 20), 1), 100),
    offset: Math.max(Math.trunc(query.offset ?? 0), 0),
  };
}

export interface UsersRoutesOptions {
  authPlugin?: ReturnType<typeof createAuthPlugin>;
  /** Supabase clients; the route tests inject an in-memory fake. */
  clients?: SupabaseClients;
}

export function usersRoutes(options: UsersRoutesOptions = {}) {
  const { authClient, authAdminClient } = options.clients ?? supabaseClients;
  const profiles = authAdminClient ? createProfilesRepository(authAdminClient) : null;
  const linkedAccounts = authAdminClient ? createLinkedAccountsRepository(authAdminClient) : null;
  const routeAuthPlugin = options.authPlugin ?? defaultAuthPlugin;

  return (
    new Elysia()

      // ── GET /users/:handle ────────────────────────────────────────────────
      .get(
        "/users/:handle",
        async ({ params, headers, set }) => {
          if (!profiles || !linkedAccounts) {
            set.status = 503;
            return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
          }
          const handle = params.handle.toLowerCase();

          const { data: profile, error: profileError } = await profiles.getProfileByHandle(handle);

          if (profileError) {
            // PGRST116 = no rows matched → genuine 404
            if (profileError.code === "PGRST116") {
              set.status = 404;
              return { error: "Profile not found", code: "NOT_FOUND" };
            }
            // Any other DB error (e.g. unknown column) → schema mismatch or transient failure
            console.error(
              "[users/:handle] profile query error:",
              profileError.code,
              profileError.message,
            );
            set.status = 503;
            return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
          }

          if (!profile) {
            set.status = 404;
            return { error: "Profile not found", code: "NOT_FOUND" };
          }

          const [{ count: followerCount }, { count: followingCount }] = await Promise.all([
            profiles.countFollowers(profile.id),
            profiles.countFollowing(profile.id),
          ]);

          let isFollowing: boolean | undefined;
          if (authClient && headers.authorization?.startsWith("Bearer ")) {
            const token = headers.authorization.slice(7);
            try {
              const {
                data: { user: requester },
              } = await authClient.auth.getUser(token);
              if (requester && requester.id !== profile.id) {
                const { count } = await profiles.countFollow(requester.id, profile.id);
                isFollowing = (count ?? 0) > 0;
              }
            } catch {
              // auth is optional on this endpoint
            }
          }

          const { data: linked } = await linkedAccounts.getMetafyFlags(profile.id);

          return {
            id: profile.id as string,
            handle: profile.handle as string,
            username: profile.username as string,
            bio: (profile.bio as string | null) ?? null,
            pronouns: (profile.pronouns as string[] | null) ?? [],
            social_links: (profile.social_links as Record<string, string> | null) ?? {},
            follower_count: followerCount ?? 0,
            following_count: followingCount ?? 0,
            created_at: profile.created_at as string,
            is_supporter: (linked?.is_supporter as boolean | null) ?? false,
            is_member: (linked?.is_member as boolean | null) ?? false,
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
            description:
              "Returns a public profile by handle (case-insensitive) with follower and " +
              "following counts. `is_supporter` and `is_member` come from the user's " +
              "linked Metafy account. With a bearer token, `is_following` reports whether " +
              "the caller follows this user; it is absent when anonymous or viewing yourself.",
          },
        },
      )

      // ── GET /users/:handle/followers ──────────────────────────────────────
      .get(
        "/users/:handle/followers",
        async ({ params, query, set }) => {
          if (!profiles) {
            set.status = 503;
            return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
          }
          const handle = params.handle.toLowerCase();
          const { limit, offset } = clampPaging(query);

          const { data: target } = await profiles.getProfileIdByHandle(handle);

          if (!target) {
            set.status = 404;
            return { error: "Profile not found", code: "NOT_FOUND" };
          }

          const { data: rows, count } = await profiles.listFollowerIds(target.id, offset, limit);

          const ids = (rows ?? []).map((r: { follower_id: string }) => r.follower_id);

          return { items: await profiles.getProfileStubs(ids), total: count ?? 0 };
        },
        {
          params: t.Object({ handle: t.String() }),
          query: FollowListQuerySchema,
          response: {
            200: ProfileListSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Users"],
            summary: "Get followers",
            description:
              "Profiles that follow this user, most recent follow first. Paginated with " +
              "`limit` (1–100, default 20) and `offset`; `total` is the full count.",
          },
        },
      )

      // ── GET /users/:handle/following ──────────────────────────────────────
      .get(
        "/users/:handle/following",
        async ({ params, query, set }) => {
          if (!profiles) {
            set.status = 503;
            return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
          }
          const handle = params.handle.toLowerCase();
          const { limit, offset } = clampPaging(query);

          const { data: target } = await profiles.getProfileIdByHandle(handle);

          if (!target) {
            set.status = 404;
            return { error: "Profile not found", code: "NOT_FOUND" };
          }

          const { data: rows, count } = await profiles.listFollowingIds(target.id, offset, limit);

          const ids = (rows ?? []).map((r: { following_id: string }) => r.following_id);

          return { items: await profiles.getProfileStubs(ids), total: count ?? 0 };
        },
        {
          params: t.Object({ handle: t.String() }),
          query: FollowListQuerySchema,
          response: {
            200: ProfileListSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Users"],
            summary: "Get following",
            description:
              "Profiles this user follows, most recent follow first. Paginated with " +
              "`limit` (1–100, default 20) and `offset`; `total` is the full count.",
          },
        },
      )

      // ── Protected routes ──────────────────────────────────────────────────
      .use(
        new Elysia()
          .use(routeAuthPlugin)

          // ── PATCH /users/me ─────────────────────────────────────────────
          .patch(
            "/users/me",
            async ({ user, body, set }) => {
              if (!profiles) {
                set.status = 503;
                return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
              }

              const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

              if (body.username !== undefined) {
                const username = body.username.trim();
                if (username.length < 1 || username.length > 50) {
                  set.status = 400;
                  return {
                    error: "Display name must be 1–50 characters.",
                    code: "INVALID_USERNAME",
                  };
                }
                updates.username = username;
              }

              if (body.handle !== undefined) {
                const handle = body.handle.toLowerCase().trim();
                if (!HANDLE_RE.test(handle)) {
                  set.status = 400;
                  return {
                    error:
                      "Handle must be 3–30 characters: lowercase letters, numbers, underscores only.",
                    code: "INVALID_HANDLE",
                  };
                }
                const { data: existing } = await profiles.getHandleHolder(handle, user.id);
                if (existing) {
                  set.status = 409;
                  return { error: "That handle is already taken.", code: "HANDLE_TAKEN" };
                }
                updates.handle = handle;
              }

              if (body.bio !== undefined) {
                const bio = body.bio.trim();
                if (bio.length > 300) {
                  set.status = 400;
                  return { error: "Bio must be 300 characters or fewer.", code: "INVALID_BIO" };
                }
                updates.bio = bio || null;
              }

              if (body.pronouns !== undefined) {
                const pronouns = body.pronouns
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .slice(0, 3);
                updates.pronouns = pronouns;
              }

              if (body.social_links !== undefined) {
                const cleaned: Record<string, string> = {};
                for (const [k, v] of Object.entries(body.social_links)) {
                  if (!(SOCIAL_PLATFORM_IDS as readonly string[]).includes(k)) continue;

                  const val = String(v).trim();
                  if (!val) continue;

                  const linkError = validateSocialLink(k, val);
                  if (linkError) {
                    set.status = 400;
                    return { error: linkError, code: "INVALID_SOCIAL_LINK" };
                  }
                  if (val.length > SOCIAL_LINK_MAX) {
                    set.status = 400;
                    return {
                      error: `Social link must be ${SOCIAL_LINK_MAX} characters or fewer.`,
                      code: "INVALID_SOCIAL_LINK",
                    };
                  }
                  cleaned[k] = val;
                }
                updates.social_links = cleaned;
              }

              const { error } = await profiles.updateProfile(user.id, updates);

              if (error) {
                if (error.code === "23505") {
                  set.status = 409;
                  return { error: "That handle is already taken.", code: "HANDLE_TAKEN" };
                }
                set.status = 500;
                return { error: "Failed to update profile.", code: "UPDATE_FAILED" };
              }

              return {
                message: "Profile updated.",
                handle: updates.handle as string | undefined,
                username: updates.username as string | undefined,
              };
            },
            {
              body: t.Object({
                username: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
                handle: t.Optional(t.String({ minLength: 3, maxLength: 30 })),
                bio: t.Optional(t.String({ maxLength: 300 })),
                pronouns: t.Optional(t.Array(t.String(), { maxItems: 3 })),
                social_links: t.Optional(t.Record(t.String(), t.String())),
              }),
              response: {
                200: t.Object({
                  message: t.String(),
                  handle: t.Optional(t.String()),
                  username: t.Optional(t.String()),
                }),
                400: ErrorSchema,
                401: ErrorSchema,
                409: ErrorSchema,
                500: ErrorSchema,
                503: ErrorSchema,
              },
              detail: {
                tags: ["Users"],
                summary: "Update own profile",
                description:
                  "Only the keys sent change. `handle` is lower-cased, must be 3–30 " +
                  "characters of lowercase letters, digits and underscores, and must be " +
                  "unique (409 `HANDLE_TAKEN`). `username` is the 1–50 character display " +
                  "name. `bio` is at most 300 characters and blank clears it. `pronouns` " +
                  "keeps the first three non-empty entries. `social_links` is keyed by " +
                  "platform id; unknown platforms are dropped and each value is validated " +
                  "for its platform.",
              },
            },
          )

          // ── DELETE /users/me ────────────────────────────────────────────
          .delete(
            "/users/me",
            async ({ user, set }) => {
              if (!authAdminClient || !profiles) {
                set.status = 503;
                return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
              }

              // Delete the auth user first — the profiles row cascades from
              // auth.users, so a failure here leaves the account fully intact.
              const { error } = await authAdminClient.auth.admin.deleteUser(user.id);
              if (error) {
                set.status = 500;
                return { error: "Failed to delete account.", code: "DELETE_FAILED" };
              }

              // Fallback for the case where the cascade did not remove the profile.
              const { error: profileError } = await profiles.deleteProfile(user.id);
              if (profileError) {
                console.error(
                  `[users/me] profile cleanup failed for ${user.id}:`,
                  profileError.message,
                );
              }

              return { message: "Account deleted." };
            },
            {
              response: {
                200: t.Object({ message: t.String() }),
                401: ErrorSchema,
                500: ErrorSchema,
                503: ErrorSchema,
              },
              detail: {
                tags: ["Users"],
                summary: "Delete own account",
                description:
                  "Permanently deletes the caller's account. The auth user is removed " +
                  "first and the profile cascades from it. There is no undo.",
              },
            },
          )

          // ── POST /users/:handle/follow ───────────────────────────────────
          .post(
            "/users/:handle/follow",
            async ({ params, user, set }) => {
              if (!profiles) {
                set.status = 503;
                return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
              }
              const handle = params.handle.toLowerCase();

              const { data: target } = await profiles.getProfileIdByHandle(handle);

              if (!target) {
                set.status = 404;
                return { error: "Profile not found", code: "NOT_FOUND" };
              }
              if (target.id === user.id) {
                set.status = 400;
                return { error: "Cannot follow yourself", code: "SELF_FOLLOW" };
              }

              const { error: followError } = await profiles.insertFollow(user.id, target.id);

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
                500: ErrorSchema,
                503: ErrorSchema,
              },
              detail: {
                tags: ["Users"],
                summary: "Follow user",
                description:
                  "Follows the user with this handle. Idempotent: following someone you " +
                  "already follow returns 200. You cannot follow yourself (400 `SELF_FOLLOW`).",
              },
            },
          )

          // ── DELETE /users/:handle/follow ─────────────────────────────────
          .delete(
            "/users/:handle/follow",
            async ({ params, user, set }) => {
              if (!profiles) {
                set.status = 503;
                return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
              }
              const handle = params.handle.toLowerCase();

              const { data: target } = await profiles.getProfileIdByHandle(handle);

              if (!target) {
                set.status = 404;
                return { error: "Profile not found", code: "NOT_FOUND" };
              }

              const { error: unfollowError } = await profiles.deleteFollow(user.id, target.id);

              if (unfollowError) {
                console.error(`[users/:handle/follow] unfollow failed:`, unfollowError.message);
                set.status = 500;
                return { error: "Failed to unfollow", code: "UNFOLLOW_FAILED" };
              }

              return { message: "Unfollowed successfully" };
            },
            {
              params: t.Object({ handle: t.String() }),
              response: {
                200: t.Object({ message: t.String() }),
                401: ErrorSchema,
                404: ErrorSchema,
                500: ErrorSchema,
                503: ErrorSchema,
              },
              detail: {
                tags: ["Users"],
                summary: "Unfollow user",
                description: "Idempotent: not following the user is not an error.",
              },
            },
          ),
      )
  );
}
