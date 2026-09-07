import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { verifyOAuthState } from "../../lib/oauth-state.ts";
import { METAFY_AUTHORIZE_URL } from "../../lib/metafy.ts";
import { createAuthPlugin } from "../../plugins/auth.ts";
import { metafyRoutes } from "../../routes/metafy.ts";
import { createFakeSupabase, type FakeSupabase } from "../fake_supabase.ts";

const ALICE_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_SECRET = "test-client-secret";

const ENV_KEYS = [
  "METAFY_CLIENT_ID",
  "METAFY_CLIENT_SECRET",
  "METAFY_REDIRECT_URI",
  "METAFY_COMMUNITY_ID",
] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

let fake: FakeSupabase;
let app: ReturnType<typeof buildApp>;
let aliceToken: string;

function buildApp(db: FakeSupabase) {
  const authPlugin = createAuthPlugin(async (token) => db.auth.tokens.get(token) ?? null);
  return new Elysia({ prefix: "/api/v1" }).use(metafyRoutes({ authPlugin, clients: db.clients }));
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

function linkAlice(overrides: Record<string, unknown> = {}) {
  fake.rows("linked_accounts").push({
    user_id: ALICE_ID,
    provider: "metafy",
    provider_user_id: "metafy-1",
    provider_username: "alice",
    access_token: "metafy-access",
    refresh_token: null,
    is_supporter: true,
    is_member: true,
    linked_at: "2026-08-01T00:00:00.000Z",
    status_checked_at: "2026-08-02T00:00:00.000Z",
    ...overrides,
  });
}

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.METAFY_CLIENT_ID = "client-id";
  process.env.METAFY_CLIENT_SECRET = CLIENT_SECRET;
  process.env.METAFY_REDIRECT_URI = "https://riftseer.test/auth/metafy/callback";
  process.env.METAFY_COMMUNITY_ID = "riftseer";

  fake = createFakeSupabase();
  aliceToken = fake.auth.createUser("alice@example.com", "password-1", ALICE_ID).token;
  app = buildApp(fake);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("every Metafy route", () => {
  test("requires a bearer token", async () => {
    for (const [method, path] of [
      ["GET", "/auth/metafy/status"],
      ["GET", "/auth/metafy/connect"],
      ["POST", "/auth/metafy/callback"],
      ["DELETE", "/auth/metafy/disconnect"],
      ["POST", "/auth/metafy/refresh-status"],
    ]) {
      const res = await request(method, path, {
        body: method === "POST" ? { code: "c", state: "s" } : undefined,
      });
      expect(`${method} ${path} ${res.status}`).toBe(`${method} ${path} 401`);
    }
  });
});

describe("GET /auth/metafy/status", () => {
  test("reports an unlinked account", async () => {
    const res = await request("GET", "/auth/metafy/status", { token: aliceToken });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ linked: false });
  });

  test("reports the linked account without its tokens", async () => {
    linkAlice();
    const res = await request("GET", "/auth/metafy/status", { token: aliceToken });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      linked: true,
      provider: "metafy",
      provider_username: "alice",
      is_supporter: true,
      is_member: true,
      linked_at: "2026-08-01T00:00:00.000Z",
      status_checked_at: "2026-08-02T00:00:00.000Z",
    });
  });
});

describe("GET /auth/metafy/connect", () => {
  test("builds the authorize URL with a state signed for this user", async () => {
    const res = await request("GET", "/auth/metafy/connect", { token: aliceToken });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; state: string };

    const url = new URL(body.url);
    expect(`${url.origin}${url.pathname}`).toBe(METAFY_AUTHORIZE_URL);
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://riftseer.test/auth/metafy/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe(body.state);
    expect(await verifyOAuthState(body.state, ALICE_ID, CLIENT_SECRET)).toBe(true);
    expect(await verifyOAuthState(body.state, "someone-else", CLIENT_SECRET)).toBe(false);
  });

  test("503s when OAuth is not configured", async () => {
    delete process.env.METAFY_CLIENT_SECRET;
    const res = await request("GET", "/auth/metafy/connect", { token: aliceToken });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Metafy OAuth not configured",
      code: "NOT_CONFIGURED",
    });
  });
});

describe("POST /auth/metafy/callback", () => {
  test("rejects a state it did not issue before contacting Metafy", async () => {
    const res = await request("POST", "/auth/metafy/callback", {
      token: aliceToken,
      body: { code: "auth-code", state: "forged.state" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid or expired OAuth state",
      code: "INVALID_STATE",
    });
    expect(fake.rows("linked_accounts")).toHaveLength(0);
  });

  test("rejects a state issued to a different user", async () => {
    const other = fake.auth.createUser("bob@example.com", "password-2");
    const issued = (await (
      await request("GET", "/auth/metafy/connect", { token: other.token })
    ).json()) as { state: string };

    const res = await request("POST", "/auth/metafy/callback", {
      token: aliceToken,
      body: { code: "auth-code", state: issued.state },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_STATE" });
  });

  test("requires code and state", async () => {
    const res = await request("POST", "/auth/metafy/callback", { token: aliceToken, body: {} });
    expect(res.status).toBe(422);
  });

  test("503s when OAuth is not configured", async () => {
    delete process.env.METAFY_COMMUNITY_ID;
    const res = await request("POST", "/auth/metafy/callback", {
      token: aliceToken,
      body: { code: "auth-code", state: "any" },
    });
    expect(res.status).toBe(503);
  });
});

describe("DELETE /auth/metafy/disconnect", () => {
  test("404s when nothing is linked", async () => {
    const res = await request("DELETE", "/auth/metafy/disconnect", { token: aliceToken });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No linked Metafy account", code: "NOT_LINKED" });
  });

  test("removes the link and only this user's link", async () => {
    linkAlice();
    fake.rows("linked_accounts").push({ user_id: "someone-else", provider: "metafy" });

    const res = await request("DELETE", "/auth/metafy/disconnect", { token: aliceToken });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Metafy account disconnected" });
    expect(fake.rows("linked_accounts")).toEqual([{ user_id: "someone-else", provider: "metafy" }]);
    expect(
      await (await request("GET", "/auth/metafy/status", { token: aliceToken })).json(),
    ).toEqual({ linked: false });
  });
});

describe("POST /auth/metafy/refresh-status", () => {
  test("404s when nothing is linked", async () => {
    const res = await request("POST", "/auth/metafy/refresh-status", { token: aliceToken });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_LINKED" });
  });

  test("400s a link with no stored token", async () => {
    linkAlice({ access_token: null });
    const res = await request("POST", "/auth/metafy/refresh-status", { token: aliceToken });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "NO_TOKEN" });
  });

  test("503s without a community to check against", async () => {
    linkAlice();
    delete process.env.METAFY_COMMUNITY_ID;
    const res = await request("POST", "/auth/metafy/refresh-status", { token: aliceToken });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "NOT_CONFIGURED" });
  });
});

describe("without a database", () => {
  test("data routes answer 503 rather than pretending", async () => {
    app = new Elysia({ prefix: "/api/v1" }).use(
      metafyRoutes({
        authPlugin: createAuthPlugin(async (token) => fake.auth.tokens.get(token) ?? null),
        clients: { authClient: null, authAdminClient: null },
      }),
    );
    for (const [method, path] of [
      ["GET", "/auth/metafy/status"],
      ["DELETE", "/auth/metafy/disconnect"],
      ["POST", "/auth/metafy/refresh-status"],
    ]) {
      const res = await request(method, path, { token: aliceToken });
      expect(`${method} ${path} ${res.status}`).toBe(`${method} ${path} 503`);
    }
  });
});
