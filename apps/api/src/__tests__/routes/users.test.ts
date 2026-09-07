import { beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { createAuthPlugin } from "../../plugins/auth.ts";
import { usersRoutes } from "../../routes/users.ts";
import { createFakeSupabase, type FakeSupabase } from "../fake_supabase.ts";

const ALICE_ID = "11111111-1111-4111-8111-111111111111";
const BOB_ID = "22222222-2222-4222-8222-222222222222";

let fake: FakeSupabase;
let app: ReturnType<typeof buildApp>;
let aliceToken: string;
let bobToken: string;

function buildApp(db: FakeSupabase) {
  const authPlugin = createAuthPlugin(async (token) => db.auth.tokens.get(token) ?? null);
  return new Elysia({ prefix: "/api/v1" }).use(usersRoutes({ authPlugin, clients: db.clients }));
}

function seedProfile(db: FakeSupabase, id: string, handle: string, username: string) {
  db.rows("profiles").push(db.withDefaults("profiles", { id, handle, username }));
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

beforeEach(() => {
  fake = createFakeSupabase();
  aliceToken = fake.auth.createUser("alice@example.com", "password-1", ALICE_ID).token;
  bobToken = fake.auth.createUser("bob@example.com", "password-2", BOB_ID).token;
  seedProfile(fake, ALICE_ID, "alice", "Alice");
  seedProfile(fake, BOB_ID, "bob", "Bob");
  app = buildApp(fake);
});

describe("GET /users/:handle", () => {
  test("returns the public profile with counts and no follow flag when anonymous", async () => {
    const res = await request("GET", "/users/alice");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: ALICE_ID,
      handle: "alice",
      username: "Alice",
      bio: null,
      pronouns: [],
      social_links: {},
      follower_count: 0,
      following_count: 0,
      created_at: expect.any(String),
      is_supporter: false,
      is_member: false,
    });
  });

  test("handles are case-insensitive", async () => {
    expect((await request("GET", "/users/ALICE")).status).toBe(200);
  });

  test("404s an unknown handle", async () => {
    const res = await request("GET", "/users/nobody");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Profile not found", code: "NOT_FOUND" });
  });

  test("reports is_following for a signed-in viewer of someone else", async () => {
    type Viewed = { is_following?: boolean; follower_count: number };
    let body = (await (await request("GET", "/users/alice", { token: bobToken })).json()) as Viewed;
    expect(body.is_following).toBe(false);

    await request("POST", "/users/alice/follow", { token: bobToken });
    body = (await (await request("GET", "/users/alice", { token: bobToken })).json()) as Viewed;
    expect(body.is_following).toBe(true);
    expect(body.follower_count).toBe(1);
  });

  test("omits is_following when viewing your own profile", async () => {
    const body = (await (await request("GET", "/users/alice", { token: aliceToken })).json()) as {
      is_following?: boolean;
    };
    expect("is_following" in body).toBe(false);
  });

  test("a bad token is treated as anonymous, never a 401", async () => {
    const res = await request("GET", "/users/alice", { token: "nope" });
    expect(res.status).toBe(200);
    expect("is_following" in ((await res.json()) as object)).toBe(false);
  });

  test("reflects Metafy supporter status from linked_accounts", async () => {
    fake.rows("linked_accounts").push({
      user_id: ALICE_ID,
      provider: "metafy",
      is_supporter: true,
      is_member: true,
    });
    const body = (await (await request("GET", "/users/alice")).json()) as Record<string, unknown>;
    expect(body.is_supporter).toBe(true);
    expect(body.is_member).toBe(true);
  });
});

describe("GET /users/:handle/followers and /following", () => {
  beforeEach(async () => {
    await request("POST", "/users/alice/follow", { token: bobToken });
  });

  test("lists profile stubs with a total", async () => {
    const followers = await request("GET", "/users/alice/followers");
    expect(followers.status).toBe(200);
    expect(await followers.json()).toEqual({
      items: [{ id: BOB_ID, handle: "bob", username: "Bob", created_at: expect.any(String) }],
      total: 1,
    });

    const following = await request("GET", "/users/bob/following");
    expect(await following.json()).toEqual({
      items: [{ id: ALICE_ID, handle: "alice", username: "Alice", created_at: expect.any(String) }],
      total: 1,
    });
  });

  test("pages with limit and offset while keeping the total", async () => {
    const res = await request("GET", "/users/alice/followers?limit=1&offset=1");
    expect(await res.json()).toEqual({ items: [], total: 1 });
  });

  test("rejects a limit outside 1–100", async () => {
    expect((await request("GET", "/users/alice/followers?limit=0")).status).toBe(422);
    expect((await request("GET", "/users/alice/followers?limit=101")).status).toBe(422);
  });

  test("404s an unknown handle", async () => {
    expect((await request("GET", "/users/nobody/followers")).status).toBe(404);
    expect((await request("GET", "/users/nobody/following")).status).toBe(404);
  });
});

describe("PATCH /users/me", () => {
  test("requires a bearer token", async () => {
    const res = await request("PATCH", "/users/me", { body: { username: "New" } });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "MISSING_TOKEN" });
  });

  test("updates the profile and echoes the changed identity fields", async () => {
    const res = await request("PATCH", "/users/me", {
      token: aliceToken,
      body: {
        username: "  Alice Prime  ",
        handle: "Alice_2",
        bio: "  hello  ",
        pronouns: [" she ", "her", ""],
        social_links: { myspace: "https://myspace.example/alice" },
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      message: "Profile updated.",
      handle: "alice_2",
      username: "Alice Prime",
    });

    const profile = (await (await request("GET", "/users/alice_2")).json()) as Record<
      string,
      unknown
    >;
    expect(profile.username).toBe("Alice Prime");
    expect(profile.bio).toBe("hello");
    expect(profile.pronouns).toEqual(["she", "her"]);
    // Unknown platforms are dropped rather than stored.
    expect(profile.social_links).toEqual({});
  });

  test("leaves fields that were not sent alone", async () => {
    await request("PATCH", "/users/me", { token: aliceToken, body: { bio: "kept" } });
    const res = await request("PATCH", "/users/me", {
      token: aliceToken,
      body: { username: "Renamed" },
    });
    expect(await res.json()).toEqual({ message: "Profile updated.", username: "Renamed" });
    const profile = (await (await request("GET", "/users/alice")).json()) as { bio: string };
    expect(profile.bio).toBe("kept");
  });

  test("rejects a handle that fails the pattern", async () => {
    const res = await request("PATCH", "/users/me", {
      token: aliceToken,
      body: { handle: "not ok!" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_HANDLE" });
  });

  test("409s a handle someone else holds, case-insensitively", async () => {
    const res = await request("PATCH", "/users/me", { token: aliceToken, body: { handle: "BOB" } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "That handle is already taken.",
      code: "HANDLE_TAKEN",
    });
  });

  test("keeping your own handle is not a conflict", async () => {
    const res = await request("PATCH", "/users/me", {
      token: aliceToken,
      body: { handle: "alice" },
    });
    expect(res.status).toBe(200);
  });

  test("an empty bio clears it", async () => {
    await request("PATCH", "/users/me", { token: aliceToken, body: { bio: "temp" } });
    await request("PATCH", "/users/me", { token: aliceToken, body: { bio: "   " } });
    const profile = (await (await request("GET", "/users/alice")).json()) as { bio: unknown };
    expect(profile.bio).toBeNull();
  });

  test("validates the body shape before touching the profile", async () => {
    const res = await request("PATCH", "/users/me", {
      token: aliceToken,
      body: { pronouns: ["a", "b", "c", "d"] },
    });
    expect(res.status).toBe(422);
  });
});

describe("DELETE /users/me", () => {
  test("requires a bearer token", async () => {
    expect((await request("DELETE", "/users/me")).status).toBe(401);
  });

  test("deletes the auth user and the profile with it", async () => {
    const res = await request("DELETE", "/users/me", { token: aliceToken });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Account deleted." });
    expect(fake.auth.users.has(ALICE_ID)).toBe(false);
    expect((await request("GET", "/users/alice")).status).toBe(404);
  });
});

describe("POST and DELETE /users/:handle/follow", () => {
  test("requires a bearer token", async () => {
    expect((await request("POST", "/users/bob/follow")).status).toBe(401);
    expect((await request("DELETE", "/users/bob/follow")).status).toBe(401);
  });

  test("follows once and reports repeats without failing", async () => {
    const first = await request("POST", "/users/bob/follow", { token: aliceToken });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ message: "Followed successfully" });

    const again = await request("POST", "/users/bob/follow", { token: aliceToken });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ message: "Already following" });

    expect(fake.rows("follows")).toHaveLength(1);
    const bob = (await (await request("GET", "/users/bob")).json()) as { follower_count: number };
    expect(bob.follower_count).toBe(1);
  });

  test("refuses to follow yourself", async () => {
    const res = await request("POST", "/users/alice/follow", { token: aliceToken });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Cannot follow yourself", code: "SELF_FOLLOW" });
  });

  test("404s an unknown target on both verbs", async () => {
    expect((await request("POST", "/users/nobody/follow", { token: aliceToken })).status).toBe(404);
    expect((await request("DELETE", "/users/nobody/follow", { token: aliceToken })).status).toBe(
      404,
    );
  });

  test("unfollows, and unfollowing a stranger is a no-op success", async () => {
    await request("POST", "/users/bob/follow", { token: aliceToken });
    const res = await request("DELETE", "/users/bob/follow", { token: aliceToken });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Unfollowed successfully" });
    expect(fake.rows("follows")).toHaveLength(0);

    expect((await request("DELETE", "/users/bob/follow", { token: aliceToken })).status).toBe(200);
  });
});

describe("without a database", () => {
  test("every route answers 503 rather than pretending", async () => {
    app = new Elysia({ prefix: "/api/v1" }).use(
      usersRoutes({
        authPlugin: createAuthPlugin(async (token) => fake.auth.tokens.get(token) ?? null),
        clients: { authClient: null, authAdminClient: null },
      }),
    );
    for (const [method, path] of [
      ["GET", "/users/alice"],
      ["GET", "/users/alice/followers"],
      ["GET", "/users/alice/following"],
      ["POST", "/users/bob/follow"],
      ["DELETE", "/users/bob/follow"],
      ["DELETE", "/users/me"],
    ]) {
      const res = await request(method, path, { token: aliceToken });
      expect(`${method} ${path} ${res.status}`).toBe(`${method} ${path} 503`);
    }
  });
});
