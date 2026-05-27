import { Elysia, t } from "elysia";
import { authAdminClient, authClient, supabaseUrl, supabaseAnonKey } from "../lib/supabase";
import { authPlugin } from "../plugins/auth";
import { ErrorSchema } from "../schemas";
import { refreshMetafySupporterStatus } from "../lib/metafy";

const SessionSchema = t.Object({
  access_token: t.String({ description: "JWT access token (short-lived)" }),
  refresh_token: t.String({ description: "Refresh token (long-lived, store securely)" }),
  expires_in: t.Number({ description: "Seconds until the access token expires" }),
  token_type: t.String(),
  user: t.Object({
    id: t.String({ description: "User UUID" }),
    email: t.Optional(t.String()),
    created_at: t.String(),
    handle: t.Optional(t.String({ description: "Unique @handle" })),
    username: t.Optional(t.String({ description: "Display name" })),
  }),
});

const ConfirmationSchema = t.Object({
  message: t.String(),
  code: t.Literal("EMAIL_CONFIRMATION_REQUIRED"),
});

const UserSchema = t.Object({
  id: t.String({ description: "User UUID" }),
  email: t.Optional(t.String()),
  created_at: t.String(),
});

export function authRoutes() {
  return (
    new Elysia()
      // ── POST /auth/register ───────────────────────────────────────────────
      .post(
        "/auth/register",
        async ({ body, set }) => {
          if (!authClient || !authAdminClient) {
            set.status = 503;
            return { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" };
          }
          if (!body.accepted_terms) {
            set.status = 400;
            return {
              error: "You must accept the Terms of Service and Privacy Policy.",
              code: "TERMS_REQUIRED",
            };
          }

          const handle = body.handle.toLowerCase().trim();
          if (!/^[a-z0-9_]{3,30}$/.test(handle)) {
            set.status = 400;
            return {
              error: "Handle must be 3–30 characters and contain only lowercase letters, numbers, and underscores.",
              code: "INVALID_HANDLE",
            };
          }

          const acceptedAt = new Date().toISOString();
          const termsVersion = process.env.LEGAL_TERMS_VERSION ?? "1";
          const privacyVersion = process.env.LEGAL_PRIVACY_VERSION ?? "1";

          const consentMeta = {
            terms_accepted_at: acceptedAt,
            terms_version: termsVersion,
            privacy_accepted_at: acceptedAt,
            privacy_version: privacyVersion,
          };

          const { data, error } = await authClient.auth.signUp({
            email: body.email,
            password: body.password,
            options: {
              emailRedirectTo: body.options?.redirect_to,
              data: consentMeta,
            },
          });
          if (error) {
            set.status = (error.status && error.status >= 500) ? 503 : 400;
            return { error: error.message, code: error.code ?? "AUTH_ERROR" };
          }

          if (data.user) {
            const { error: adminError } = await authAdminClient.auth.admin.updateUserById(data.user.id, {
              app_metadata: {
                ...consentMeta,
                registration_consent_recorded_at: acceptedAt,
              },
            });
            if (adminError) {
              console.error("[auth/register] app_metadata update failed:", adminError.message);
              const { error: deleteError } = await authAdminClient.auth.admin.deleteUser(data.user.id);
              if (deleteError) {
                console.error("[auth/register] rollback deleteUser failed:", deleteError.message);
              }
              set.status = 500;
              return {
                error: "Registration could not be completed. Please try again.",
                code: "CONSENT_RECORD_FAILED",
              };
            }

            const { error: profileError } = await authAdminClient
              .from("profiles")
              .insert({ id: data.user.id, username: body.username.trim(), handle });
            if (profileError) {
              console.error("[auth/register] profile insert failed:", profileError.message);
              const { error: deleteError } = await authAdminClient.auth.admin.deleteUser(data.user.id);
              if (deleteError) {
                console.error("[auth/register] rollback deleteUser failed:", deleteError.message);
              }
              if (profileError.code === "23505") {
                set.status = 409;
                return { error: "That handle is already taken.", code: "HANDLE_TAKEN" };
              }
              set.status = 500;
              return { error: "Registration could not be completed. Please try again.", code: "PROFILE_CREATE_FAILED" };
            }
          }

          if (!data.session) {
            set.status = 202;
            return {
              message: "Check your email to confirm your account before signing in.",
              code: "EMAIL_CONFIRMATION_REQUIRED" as const,
            };
          }
          return {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in,
            token_type: data.session.token_type,
            user: {
              id: data.user!.id,
              email: data.user!.email,
              created_at: data.user!.created_at,
              handle,
              username: body.username.trim(),
            },
          };
        },
        {
          body: t.Object({
            email: t.String({ description: "User email address" }),
            password: t.String({ minLength: 8, description: "Password (min 8 characters)" }),
            accepted_terms: t.Boolean({
              description: "Must be true — records acceptance of Terms and Privacy Policy at signup.",
            }),
            username: t.String({ minLength: 1, maxLength: 50, description: "Display name (non-unique)" }),
            handle: t.String({ minLength: 3, maxLength: 30, description: "Unique @handle (lowercase letters, numbers, underscores)" }),
            options: t.Optional(t.Object({
              redirect_to: t.Optional(t.String({ description: "URL to redirect to after email confirmation. Pass window.location.origin + '/auth/callback'." })),
            })),
          }),
          response: {
            200: SessionSchema,
            202: ConfirmationSchema,
            400: ErrorSchema,
            409: ErrorSchema,
            500: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Auth"],
            summary: "Register",
            description:
              "Creates a new user account. Returns a session immediately if email confirmation " +
              "is disabled, or a 202 with a confirmation prompt if email confirmation is enabled.",
          },
        },
      )

      // ── POST /auth/login ──────────────────────────────────────────────────
      .post(
        "/auth/login",
        async ({ body, set }) => {
          if (!authClient) {
            set.status = 503;
            return { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" };
          }
          const { data, error } = await authClient.auth.signInWithPassword({
            email: body.email,
            password: body.password,
          });
          if (error) {
            set.status = error.status === 401 ? 401 : (error.status && error.status >= 500) ? 503 : 400;
            return { error: error.message, code: error.code ?? "AUTH_ERROR" };
          }

          let profile: { handle: string; username: string } | null = null;
          if (authAdminClient) {
            const { data: prof } = await authAdminClient
              .from("profiles")
              .select("handle, username")
              .eq("id", data.user.id)
              .single();
            profile = prof;
          }

          const result = {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in,
            token_type: data.session.token_type,
            user: {
              id: data.user.id,
              email: data.user.email,
              created_at: data.user.created_at,
              handle: profile?.handle ?? undefined,
              username: profile?.username ?? undefined,
            },
          };

          // Best-effort: refresh Metafy supporter status in the background on login.
          // Does not block or affect the login response.
          const communityId = process.env.METAFY_COMMUNITY_ID;
          if (authAdminClient && communityId) {
            void (async () => {
              try {
                const { data: linked } = await authAdminClient
                  .from("linked_accounts")
                  .select("access_token")
                  .eq("user_id", data.user.id)
                  .eq("provider", "metafy")
                  .maybeSingle();
                if (linked?.access_token) {
                  await refreshMetafySupporterStatus(
                    data.user.id,
                    linked.access_token as string,
                    communityId,
                  );
                }
              } catch {
                // never fail login due to Metafy status check
              }
            })();
          }

          return result;
        },
        {
          body: t.Object({
            email: t.String({ description: "User email address" }),
            password: t.String({ description: "Account password" }),
          }),
          response: {
            200: SessionSchema,
            400: ErrorSchema,
            401: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Auth"],
            summary: "Login",
            description: "Authenticates with email and password. Returns an access token and refresh token.",
          },
        },
      )

      // ── POST /auth/refresh ────────────────────────────────────────────────
      .post(
        "/auth/refresh",
        async ({ body, set }) => {
          if (!authClient) {
            set.status = 503;
            return { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" };
          }
          const { data, error } = await authClient.auth.refreshSession({
            refresh_token: body.refresh_token,
          });
          if (error) {
            set.status = (error.status && error.status >= 500) ? 503 : 401;
            return { error: error.message, code: error.code ?? "AUTH_ERROR" };
          }
          if (!data.session) {
            set.status = 401;
            return { error: "Invalid or expired refresh token", code: "INVALID_TOKEN" };
          }
          return {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in,
            token_type: data.session.token_type,
            user: {
              id: data.user!.id,
              email: data.user!.email,
              created_at: data.user!.created_at,
            },
          };
        },
        {
          body: t.Object({
            refresh_token: t.String({ description: "Refresh token from a prior login or refresh" }),
          }),
          response: {
            200: SessionSchema,
            401: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Auth"],
            summary: "Refresh token",
            description:
              "Exchanges a refresh token for a new access token and refresh token pair. " +
              "Refresh tokens are rotated on each use.",
          },
        },
      )

      // ── POST /auth/logout ─────────────────────────────────────────────────
      .post(
        "/auth/logout",
        async ({ headers, set }) => {
          const authHeader = headers.authorization;
          if (!authHeader?.startsWith("Bearer ")) {
            set.status = 401;
            return { error: "Missing or invalid Authorization header", code: "MISSING_TOKEN" };
          }
          if (!authClient) {
            set.status = 503;
            return { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" };
          }
          const accessToken = authHeader.slice(7);
          let res: Response;
          try {
            res = await fetch(`${supabaseUrl}/auth/v1/logout`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                apikey: supabaseAnonKey,
                "Content-Type": "application/json",
              },
            });
          } catch {
            set.status = 503;
            return { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" };
          }
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            set.status = res.status >= 500 ? 503 : 401;
            return {
              error: String(body.error_description ?? body.msg ?? "Logout failed"),
              code: "LOGOUT_FAILED",
            };
          }
          return { message: "Logged out successfully" };
        },
        {
          response: {
            200: t.Object({ message: t.String() }),
            401: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Auth"],
            summary: "Logout",
            description:
              "Invalidates the current session. Requires a valid `Authorization: Bearer <access_token>` header. " +
              "The refresh token is also revoked server-side.",
          },
        },
      )

      // ── POST /auth/forgot-password ───────────────────────────────────────
      .post(
        "/auth/forgot-password",
        async ({ body, set }) => {
          if (!authClient) {
            set.status = 503;
            return { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" };
          }
          const { error } = await authClient.auth.resetPasswordForEmail(body.email, {
            redirectTo: body.options?.redirect_to,
          });
          if (error) {
            set.status = (error.status && error.status >= 500) ? 503 : 400;
            return { error: error.message, code: error.code ?? "AUTH_ERROR" };
          }
          return { message: "If that email is registered, a password reset link has been sent." };
        },
        {
          body: t.Object({
            email: t.String({ description: "Email address of the account to reset" }),
            options: t.Optional(t.Object({
              redirect_to: t.Optional(t.String({ description: "URL to redirect to after clicking the reset link. Pass window.location.origin + '/auth/reset-password'." })),
            })),
          }),
          response: {
            200: t.Object({ message: t.String() }),
            400: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Auth"],
            summary: "Request password reset",
            description:
              "Sends a password reset email. Always returns 200 to avoid leaking whether an " +
              "email is registered. The link in the email contains a short-lived recovery token.",
          },
        },
      )

      // ── Protected routes ──────────────────────────────────────────────────
      // Routes below use authPlugin, which validates the Bearer token and
      // injects `user` into the handler context. Public routes above are
      // unaffected — the plugin scope does not propagate past this sub-app.
      .use(
        new Elysia()
          .use(authPlugin)

          // ── GET /auth/me ────────────────────────────────────────────────
          .get(
            "/auth/me",
            ({ user }) => ({
              id: user.id,
              email: user.email ?? undefined,
              created_at: user.created_at,
            }),
            {
              response: {
                200: UserSchema,
                401: ErrorSchema,
                503: ErrorSchema,
              },
              detail: {
                tags: ["Auth"],
                summary: "Get current user",
                description:
                  "Returns the authenticated user's profile. " +
                  "Requires a valid `Authorization: Bearer <access_token>` header.",
              },
            },
          )

          // ── PATCH /auth/email ───────────────────────────────────────────
          .patch(
            "/auth/email",
            async ({ body, headers, set }) => {
              if (!supabaseUrl || !supabaseAnonKey) {
                set.status = 503;
                return { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" };
              }
              const accessToken = headers.authorization!.slice(7);
              let res: Response;
              try {
                res = await fetch(`${supabaseUrl}/auth/v1/user`, {
                  method: "PATCH",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    apikey: supabaseAnonKey,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ email: body.email }),
                });
              } catch {
                set.status = 503;
                return { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" };
              }
              if (!res.ok) {
                const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
                set.status = res.status >= 500 ? 503 : res.status === 401 ? 401 : 400;
                return {
                  error: String(payload.error_description ?? payload.msg ?? "Email update failed"),
                  code: "UPDATE_FAILED",
                };
              }
              return { message: "A confirmation email has been sent to your new address." };
            },
            {
              body: t.Object({
                email: t.String({ description: "New email address" }),
              }),
              response: {
                200: t.Object({ message: t.String() }),
                400: ErrorSchema,
                401: ErrorSchema,
                503: ErrorSchema,
              },
              detail: {
                tags: ["Auth"],
                summary: "Update email",
                description:
                  "Initiates an email change. Supabase sends a confirmation link to the new address.",
              },
            },
          )

          // ── PATCH /auth/change-password ─────────────────────────────────
          .patch(
            "/auth/change-password",
            async ({ body, user, headers, set }) => {
              if (!authClient || !authAdminClient || !supabaseUrl || !supabaseAnonKey) {
                set.status = 503;
                return { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" };
              }
              if (!user.email) {
                set.status = 400;
                return { error: "Account has no email address.", code: "NO_EMAIL" };
              }
              // Verify current password
              const { error: signInError } = await authClient.auth.signInWithPassword({
                email: user.email,
                password: body.current_password,
              });
              if (signInError) {
                set.status = 401;
                return { error: "Current password is incorrect.", code: "INVALID_CREDENTIALS" };
              }
              // Update password using admin client
              const { error: updateError } = await authAdminClient.auth.admin.updateUserById(user.id, {
                password: body.new_password,
              });
              if (updateError) {
                set.status = 500;
                return { error: "Failed to update password.", code: "UPDATE_FAILED" };
              }
              return { message: "Password updated successfully." };
            },
            {
              body: t.Object({
                current_password: t.String({ description: "Current account password" }),
                new_password: t.String({ minLength: 8, description: "New password (min 8 characters)" }),
              }),
              response: {
                200: t.Object({ message: t.String() }),
                400: ErrorSchema,
                401: ErrorSchema,
                500: ErrorSchema,
                503: ErrorSchema,
              },
              detail: {
                tags: ["Auth"],
                summary: "Change password",
                description: "Changes the authenticated user's password. Requires the current password for verification.",
              },
            },
          )

          // ── POST /auth/reset-password ────────────────────────────────────
          .post(
            "/auth/reset-password",
            async ({ body, headers, set }) => {
              if (!supabaseUrl || !supabaseAnonKey) {
                set.status = 503;
                return { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" };
              }
              const accessToken = headers.authorization!.slice(7);
              let res: Response;
              try {
                res = await fetch(`${supabaseUrl}/auth/v1/user`, {
                  method: "PATCH",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    apikey: supabaseAnonKey,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ password: body.password }),
                });
              } catch {
                set.status = 503;
                return { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" };
              }
              if (!res.ok) {
                const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
                set.status = res.status >= 500 ? 503 : res.status === 401 ? 401 : 400;
                return {
                  error: String(payload.error_description ?? payload.msg ?? "Password update failed"),
                  code: "UPDATE_FAILED",
                };
              }
              return { message: "Password updated successfully." };
            },
            {
              body: t.Object({
                password: t.String({ minLength: 8, description: "New password (min 8 characters)" }),
              }),
              response: {
                200: t.Object({ message: t.String() }),
                400: ErrorSchema,
                401: ErrorSchema,
                503: ErrorSchema,
              },
              detail: {
                tags: ["Auth"],
                summary: "Reset password",
                description:
                  "Sets a new password for the authenticated user. " +
                  "Requires the short-lived recovery token from the reset email as the " +
                  "`Authorization: Bearer <recovery_token>` header.",
              },
            },
          ),
      )
  );
}
