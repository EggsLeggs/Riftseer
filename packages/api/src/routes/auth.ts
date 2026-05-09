import { Elysia, t } from "elysia";
import { authClient, supabaseUrl, supabaseAnonKey } from "../lib/supabase";
import { authPlugin } from "../plugins/auth";
import { ErrorSchema } from "../schemas";

const SessionSchema = t.Object({
  access_token: t.String({ description: "JWT access token (short-lived)" }),
  refresh_token: t.String({ description: "Refresh token (long-lived, store securely)" }),
  expires_in: t.Number({ description: "Seconds until the access token expires" }),
  token_type: t.String(),
  user: t.Object({
    id: t.String({ description: "User UUID" }),
    email: t.Optional(t.String()),
    created_at: t.String(),
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
          if (!authClient) {
            set.status = 503;
            return { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" };
          }
          const { data, error } = await authClient.auth.signUp({
            email: body.email,
            password: body.password,
            options: { emailRedirectTo: body.options?.redirect_to },
          });
          if (error) {
            set.status = error.status ?? 400;
            return { error: error.message, code: error.code ?? "AUTH_ERROR" };
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
            },
          };
        },
        {
          body: t.Object({
            email: t.String({ description: "User email address" }),
            password: t.String({ minLength: 8, description: "Password (min 8 characters)" }),
            options: t.Optional(t.Object({
              redirect_to: t.Optional(t.String({ description: "URL to redirect to after email confirmation. Pass window.location.origin + '/auth/callback'." })),
            })),
          }),
          response: {
            200: SessionSchema,
            202: ConfirmationSchema,
            400: ErrorSchema,
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
            set.status = error.status ?? 400;
            return { error: error.message, code: error.code ?? "AUTH_ERROR" };
          }
          return {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in,
            token_type: data.session.token_type,
            user: {
              id: data.user.id,
              email: data.user.email,
              created_at: data.user.created_at,
            },
          };
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
            set.status = error.status ?? 401;
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
          const res = await fetch(`${supabaseUrl}/auth/v1/logout`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              apikey: supabaseAnonKey,
              "Content-Type": "application/json",
            },
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            set.status = res.status;
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
            set.status = error.status ?? 400;
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

          // ── POST /auth/reset-password ────────────────────────────────────
          .post(
            "/auth/reset-password",
            async ({ body, headers, set }) => {
              if (!supabaseUrl || !supabaseAnonKey) {
                set.status = 503;
                return { error: "Auth service unavailable", code: "SERVICE_UNAVAILABLE" };
              }
              const accessToken = headers.authorization!.slice(7);
              const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  apikey: supabaseAnonKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ password: body.password }),
              });
              if (!res.ok) {
                const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
                set.status = res.status;
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
