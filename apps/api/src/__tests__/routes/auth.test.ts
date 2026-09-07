import { beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { createAuthPlugin } from "../../plugins/auth.ts";
import { authRoutes } from "../../routes/auth.ts";
import { createFakeSupabase, type FakeSupabase } from "../fake_supabase.ts";

const ALICE_ID = "11111111-1111-4111-8111-111111111111";

let fake: FakeSupabase;
let app: ReturnType<typeof buildApp>;
let aliceToken: string;
let adminIds = "";

function buildApp(db: FakeSupabase) {
  return new Elysia({ prefix: "/api/v1" }).use(
    authRoutes({
      protectedAuthPlugin: createAuthPlugin(async (token) => db.auth.tokens.get(token) ?? null),
      getAdminUserIds: () => adminIds,
      clients: db.clients,
    }),
  );
}

function request(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  return app.handle(
    new Request(`http://localhost/api/v1${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
}

const registration = {
  email: "new@example.com",
  password: "long-enough",
  accepted_terms: true,
  username: "Newcomer",
  handle: "Newcomer_1",
};

beforeEach(() => {
  fake = createFakeSupabase();
  adminIds = "";
  aliceToken = fake.auth.createUser("alice@example.com", "password-1", ALICE_ID).token;
  fake
    .rows("profiles")
    .push(fake.withDefaults("profiles", { id: ALICE_ID, handle: "alice", username: "Alice" }));
  app = buildApp(fake);
});

describe("POST /auth/register", () => {
  test("creates the auth user, records consent and inserts the profile", async () => {
    const res = await request("POST", "/auth/register", { body: registration });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown> & { user: Record<string, unknown> };
    // Read before matching: Bun's toMatchObject writes its asymmetric matchers into the received object.
    const userId = body.user.id as string;
    expect(body).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      expires_in: 3600,
      token_type: "bearer",
      user: {
        id: expect.any(String),
        email: "new@example.com",
        created_at: expect.any(String),
        handle: "newcomer_1",
        username: "Newcomer",
      },
    });

    expect(fake.rows("profiles")).toContainEqual(
      expect.objectContaining({ id: userId, handle: "newcomer_1", username: "Newcomer" }),
    );
    expect(fake.auth.appMetadata.get(userId)).toMatchObject({
      terms_accepted_at: expect.any(String),
      terms_version: expect.any(String),
      privacy_accepted_at: expect.any(String),
      privacy_version: expect.any(String),
      registration_consent_recorded_at: expect.any(String),
    });
  });

  test("answers 202 when email confirmation is pending", async () => {
    fake.auth.requireEmailConfirmation = true;
    const res = await request("POST", "/auth/register", { body: registration });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({
      message: "Check your email to confirm your account before signing in.",
      code: "EMAIL_CONFIRMATION_REQUIRED",
    });
    // The profile still exists, waiting for the confirmed sign-in.
    expect(fake.rows("profiles").some((row) => row.handle === "newcomer_1")).toBe(true);
  });

  test("refuses registration without accepting the terms", async () => {
    const res = await request("POST", "/auth/register", {
      body: { ...registration, accepted_terms: false },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "TERMS_REQUIRED" });
    expect(fake.auth.users.size).toBe(1);
  });

  test("rejects a handle that fails the pattern before creating anything", async () => {
    const res = await request("POST", "/auth/register", {
      body: { ...registration, handle: "not ok!" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_HANDLE" });
    expect(fake.auth.users.size).toBe(1);
  });

  test("rolls the auth user back when the handle is taken", async () => {
    const res = await request("POST", "/auth/register", {
      body: { ...registration, handle: "ALICE" },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "That handle is already taken.",
      code: "HANDLE_TAKEN",
    });
    expect(fake.auth.users.size).toBe(1);
    expect(fake.rows("profiles")).toHaveLength(1);
  });

  test("passes a sign-up refusal through as 400", async () => {
    const res = await request("POST", "/auth/register", {
      body: { ...registration, email: "alice@example.com" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "User already registered",
      code: "user_already_exists",
    });
  });

  test("validates the body: a short password is a 422", async () => {
    const res = await request("POST", "/auth/register", {
      body: { ...registration, password: "short" },
    });
    expect(res.status).toBe(422);
  });
});

describe("POST /auth/login", () => {
  test("returns a session with the profile's handle and username", async () => {
    const res = await request("POST", "/auth/login", {
      body: { email: "alice@example.com", password: "password-1" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { access_token: string; user: Record<string, unknown> };
    const accessToken = body.access_token;
    expect(body).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      expires_in: 3600,
      token_type: "bearer",
      user: { id: ALICE_ID, email: "alice@example.com", handle: "alice", username: "Alice" },
    });
    // The access token it handed out is one the guard accepts.
    expect((await request("GET", "/auth/me", { token: accessToken })).status).toBe(200);
  });

  test("passes Supabase's credential refusal through with its status", async () => {
    const res = await request("POST", "/auth/login", {
      body: { email: "alice@example.com", password: "wrong" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid login credentials",
      code: "invalid_credentials",
    });
  });

  test("requires email and password", async () => {
    expect((await request("POST", "/auth/login", { body: {} })).status).toBe(422);
  });
});

describe("POST /auth/refresh", () => {
  test("rotates the pair", async () => {
    const login = (await (
      await request("POST", "/auth/login", {
        body: { email: "alice@example.com", password: "password-1" },
      })
    ).json()) as { refresh_token: string };

    const res = await request("POST", "/auth/refresh", {
      body: { refresh_token: login.refresh_token },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { refresh_token: string; user: { id: string } };
    expect(body.user.id).toBe(ALICE_ID);
    expect(body.refresh_token).not.toBe(login.refresh_token);

    // The old refresh token is spent.
    const replay = await request("POST", "/auth/refresh", {
      body: { refresh_token: login.refresh_token },
    });
    expect(replay.status).toBe(401);
  });

  test("401s an unknown refresh token", async () => {
    const res = await request("POST", "/auth/refresh", { body: { refresh_token: "nope" } });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "refresh_token_not_found" });
  });
});

describe("POST /auth/logout", () => {
  test("requires a bearer token before anything else", async () => {
    const res = await request("POST", "/auth/logout");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "MISSING_TOKEN" });
  });
});

describe("POST /auth/forgot-password", () => {
  test("always answers 200, whether or not the address exists", async () => {
    for (const email of ["alice@example.com", "stranger@example.com"]) {
      const res = await request("POST", "/auth/forgot-password", { body: { email } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        message: "If that email is registered, a password reset link has been sent.",
      });
    }
    expect(fake.auth.resetRequests).toEqual(["alice@example.com", "stranger@example.com"]);
  });
});

describe("GET /auth/me", () => {
  test("requires a bearer token", async () => {
    expect((await request("GET", "/auth/me")).status).toBe(401);
    expect((await request("GET", "/auth/me", { token: "nope" })).status).toBe(401);
  });

  test("returns the user and the admin flag from the allowlist", async () => {
    let res = await request("GET", "/auth/me", { token: aliceToken });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: ALICE_ID,
      email: "alice@example.com",
      created_at: expect.any(String),
      is_admin: false,
    });

    adminIds = ` ${ALICE_ID.toUpperCase()} `;
    res = await request("GET", "/auth/me", { token: aliceToken });
    expect(((await res.json()) as { is_admin: boolean }).is_admin).toBe(true);
  });
});

describe("PATCH /auth/change-password", () => {
  test("requires a bearer token", async () => {
    const res = await request("PATCH", "/auth/change-password", {
      body: { current_password: "password-1", new_password: "password-2" },
    });
    expect(res.status).toBe(401);
  });

  test("rejects a wrong current password without changing anything", async () => {
    const res = await request("PATCH", "/auth/change-password", {
      token: aliceToken,
      body: { current_password: "wrong", new_password: "password-2" },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Current password is incorrect.",
      code: "INVALID_CREDENTIALS",
    });
    expect(fake.auth.passwordFor("alice@example.com")).toBe("password-1");
  });

  test("changes the password after verifying the current one", async () => {
    const res = await request("PATCH", "/auth/change-password", {
      token: aliceToken,
      body: { current_password: "password-1", new_password: "password-2" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Password updated successfully." });
    expect(fake.auth.passwordFor("alice@example.com")).toBe("password-2");
  });

  test("validates the new password length", async () => {
    const res = await request("PATCH", "/auth/change-password", {
      token: aliceToken,
      body: { current_password: "password-1", new_password: "short" },
    });
    expect(res.status).toBe(422);
  });
});

describe("without an auth service", () => {
  test("session routes answer 503 rather than pretending", async () => {
    app = new Elysia({ prefix: "/api/v1" }).use(
      authRoutes({
        protectedAuthPlugin: createAuthPlugin(async (token) => fake.auth.tokens.get(token) ?? null),
        clients: { authClient: null, authAdminClient: null },
      }),
    );
    const attempts: Array<[string, string, unknown]> = [
      ["POST", "/auth/register", registration],
      ["POST", "/auth/login", { email: "alice@example.com", password: "password-1" }],
      ["POST", "/auth/refresh", { refresh_token: "x" }],
      ["POST", "/auth/forgot-password", { email: "alice@example.com" }],
    ];
    for (const [method, path, body] of attempts) {
      const res = await request(method, path, { body });
      expect(`${method} ${path} ${res.status}`).toBe(`${method} ${path} 503`);
      expect(await res.json()).toEqual({
        error: "Auth service unavailable",
        code: "SERVICE_UNAVAILABLE",
      });
    }
  });
});
