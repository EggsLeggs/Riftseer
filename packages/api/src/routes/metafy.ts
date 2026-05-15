import { Elysia, t } from "elysia";
import { authAdminClient } from "../lib/supabase";
import { authPlugin } from "../plugins/auth";
import { ErrorSchema } from "../schemas";
import {
  METAFY_AUTHORIZE_URL,
  METAFY_TOKEN_URL,
  METAFY_SCOPES,
  METAFY_API_BASE,
  refreshMetafySupporterStatus,
  checkMetafyMembership,
} from "../lib/metafy";

const LinkedAccountSchema = t.Object({
  provider: t.String(),
  provider_username: t.Nullable(t.String()),
  is_supporter: t.Boolean(),
  is_member: t.Boolean(),
  linked_at: t.String(),
  status_checked_at: t.Nullable(t.String()),
});

const MetafyStatusSchema = t.Union([
  t.Object({ linked: t.Literal(false) }),
  t.Intersect([t.Object({ linked: t.Literal(true) }), LinkedAccountSchema]),
]);

export function metafyRoutes() {
  return new Elysia().use(
    new Elysia()
      .use(authPlugin)

      // ── GET /auth/metafy/status ────────────────────────────────────────────
      .get(
        "/auth/metafy/status",
        async ({ user, set }) => {
          if (!authAdminClient) {
            set.status = 503;
            return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
          }

          const { data } = await authAdminClient
            .from("linked_accounts")
            .select("provider, provider_username, is_supporter, is_member, linked_at, status_checked_at")
            .eq("user_id", user.id)
            .eq("provider", "metafy")
            .maybeSingle();

          if (!data) return { linked: false as const };

          return {
            linked: true as const,
            provider: data.provider as string,
            provider_username: data.provider_username as string | null,
            is_supporter: data.is_supporter as boolean,
            is_member: data.is_member as boolean,
            linked_at: data.linked_at as string,
            status_checked_at: data.status_checked_at as string | null,
          };
        },
        {
          response: {
            200: MetafyStatusSchema,
            401: ErrorSchema,
            503: ErrorSchema,
          },
          detail: { tags: ["Auth"], summary: "Get Metafy link status" },
        },
      )

      // ── GET /auth/metafy/connect ───────────────────────────────────────────
      .get(
        "/auth/metafy/connect",
        async ({ set }) => {
          const clientId = process.env.METAFY_CLIENT_ID;
          const redirectUri = process.env.METAFY_REDIRECT_URI;

          if (!clientId || !redirectUri) {
            set.status = 503;
            return { error: "Metafy OAuth not configured", code: "NOT_CONFIGURED" };
          }

          const state = crypto.randomUUID();

          const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: METAFY_SCOPES,
            state,
          });

          return { url: `${METAFY_AUTHORIZE_URL}?${params.toString()}`, state };
        },
        {
          response: {
            200: t.Object({ url: t.String(), state: t.String() }),
            401: ErrorSchema,
            503: ErrorSchema,
          },
          detail: { tags: ["Auth"], summary: "Get Metafy OAuth URL" },
        },
      )

      // ── POST /auth/metafy/callback ─────────────────────────────────────────
      .post(
        "/auth/metafy/callback",
        async ({ body, user, set }) => {
          if (!authAdminClient) {
            set.status = 503;
            return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
          }

          const clientId = process.env.METAFY_CLIENT_ID;
          const clientSecret = process.env.METAFY_CLIENT_SECRET;
          const redirectUri = process.env.METAFY_REDIRECT_URI;
          const communityId = process.env.METAFY_COMMUNITY_ID;

          if (!clientId || !clientSecret || !redirectUri || !communityId) {
            set.status = 503;
            return { error: "Metafy OAuth not configured", code: "NOT_CONFIGURED" };
          }

          // Exchange authorization code for tokens
          let tokenRes: Response;
          try {
            tokenRes = await fetch(METAFY_TOKEN_URL, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                grant_type: "authorization_code",
                code: body.code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
              }),
            });
          } catch {
            set.status = 502;
            return { error: "Failed to reach Metafy OAuth server", code: "UPSTREAM_ERROR" };
          }

          if (!tokenRes.ok) {
            set.status = 400;
            return { error: "OAuth token exchange failed", code: "OAUTH_ERROR" };
          }

          const tokens = (await tokenRes.json()) as {
            access_token: string;
            refresh_token?: string;
          };

          if (!tokens.access_token) {
            set.status = 400;
            return { error: "No access token in OAuth response", code: "OAUTH_ERROR" };
          }

          // Fetch Metafy user profile — GET /v1/me returns { user: { id, slug, name, ... } }
          let profileRes: Response;
          try {
            profileRes = await fetch(`${METAFY_API_BASE}/v1/me`, {
              headers: { Authorization: `Bearer ${tokens.access_token}` },
            });
          } catch {
            set.status = 502;
            return { error: "Failed to fetch Metafy profile", code: "UPSTREAM_ERROR" };
          }

          if (!profileRes.ok) {
            set.status = 502;
            return { error: "Failed to fetch Metafy profile", code: "UPSTREAM_ERROR" };
          }

          const { user: metafyUser } = (await profileRes.json()) as {
            user: { id: string; slug: string; name: string };
          };

          const providerUserId = metafyUser.id;
          const providerUsername = metafyUser.slug ?? metafyUser.name ?? null;

          // Check supporter status and community membership in parallel
          const [isSupporter, isMemberResult] = await Promise.all([
            refreshMetafySupporterStatus(user.id, tokens.access_token, communityId),
            checkMetafyMembership(tokens.access_token, communityId),
          ]);
          // Subscribers are always members; non-null membership result overrides
          const isMember = isSupporter || (isMemberResult ?? false);

          // Upsert linked account
          const now = new Date().toISOString();
          const { error: upsertError } = await authAdminClient
            .from("linked_accounts")
            .upsert(
              {
                user_id: user.id,
                provider: "metafy",
                provider_user_id: providerUserId,
                provider_username: providerUsername,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token ?? null,
                is_supporter: isSupporter,
                is_member: isMember,
                status_checked_at: now,
                linked_at: now,
              },
              { onConflict: "user_id,provider" },
            );

          if (upsertError) {
            set.status = 500;
            return { error: "Failed to save linked account", code: "DB_ERROR" };
          }

          return {
            linked: true as const,
            provider: "metafy",
            provider_username: providerUsername,
            is_supporter: isSupporter,
            is_member: isMember,
            linked_at: now,
            status_checked_at: now,
          };
        },
        {
          body: t.Object({
            code: t.String(),
            state: t.String(),
          }),
          response: {
            200: t.Intersect([t.Object({ linked: t.Literal(true) }), LinkedAccountSchema]),
            400: ErrorSchema,
            401: ErrorSchema,
            500: ErrorSchema,
            502: ErrorSchema,
            503: ErrorSchema,
          },
          detail: { tags: ["Auth"], summary: "Complete Metafy OAuth callback" },
        },
      )

      // ── DELETE /auth/metafy/disconnect ────────────────────────────────────
      .delete(
        "/auth/metafy/disconnect",
        async ({ user, set }) => {
          if (!authAdminClient) {
            set.status = 503;
            return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
          }

          await authAdminClient
            .from("linked_accounts")
            .delete()
            .eq("user_id", user.id)
            .eq("provider", "metafy");

          return { message: "Metafy account disconnected" };
        },
        {
          response: {
            200: t.Object({ message: t.String() }),
            401: ErrorSchema,
            503: ErrorSchema,
          },
          detail: { tags: ["Auth"], summary: "Disconnect Metafy account" },
        },
      )

      // ── POST /auth/metafy/refresh-status ──────────────────────────────────
      .post(
        "/auth/metafy/refresh-status",
        async ({ user, set }) => {
          if (!authAdminClient) {
            set.status = 503;
            return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" };
          }

          const communityId = process.env.METAFY_COMMUNITY_ID;
          if (!communityId) {
            set.status = 503;
            return { error: "Metafy OAuth not configured", code: "NOT_CONFIGURED" };
          }

          const { data: linked } = await authAdminClient
            .from("linked_accounts")
            .select("access_token, provider_username, is_member, linked_at")
            .eq("user_id", user.id)
            .eq("provider", "metafy")
            .maybeSingle();

          if (!linked) {
            set.status = 404;
            return { error: "No linked Metafy account", code: "NOT_LINKED" };
          }

          if (!linked.access_token) {
            set.status = 400;
            return { error: "No access token stored for Metafy account", code: "NO_TOKEN" };
          }

          const isSupporter = await refreshMetafySupporterStatus(
            user.id,
            linked.access_token as string,
            communityId,
          );

          return {
            linked: true as const,
            provider: "metafy",
            provider_username: linked.provider_username as string | null,
            is_supporter: isSupporter,
            is_member: (linked.is_member as boolean | null) ?? false,
            linked_at: linked.linked_at as string,
            status_checked_at: new Date().toISOString(),
          };
        },
        {
          response: {
            200: t.Intersect([t.Object({ linked: t.Literal(true) }), LinkedAccountSchema]),
            400: ErrorSchema,
            401: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: { tags: ["Auth"], summary: "Refresh Metafy supporter status" },
        },
      ),
  );
}
