import { beforeEach, describe, expect, it } from "bun:test";
import { buildApp } from "../app";
import {
  checkRateLimit,
  RATE_LIMIT_RULES,
  type RateLimitRule,
  type RateLimitStore,
} from "../plugins/rate-limit";
import { StubProvider } from "./stub_card_provider";

/** The three commands the window uses, over a Map. Expiry is recorded, not enforced. */
class FakeStore implements RateLimitStore {
  counters = new Map<string, number>();
  ttls = new Map<string, number>();
  failing = false;

  async incr(key: string) {
    if (this.failing) throw new Error("redis down");
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async expire(key: string, seconds: number) {
    this.ttls.set(key, seconds);
    return 1;
  }

  async get(key: string) {
    if (this.failing) throw new Error("redis down");
    return this.counters.get(key) ?? null;
  }
}

const RULE: RateLimitRule = { name: "test", limit: 3, windowSeconds: 60, matches: () => true };
const WINDOW_MS = RULE.windowSeconds * 1000;
// Some window boundary; the tests move relative to it.
const T0 = 1_000 * WINDOW_MS;

describe("checkRateLimit", () => {
  let store: FakeStore;
  beforeEach(() => {
    store = new FakeStore();
  });

  it("allows up to the limit in a window and refuses the next", async () => {
    for (let hit = 1; hit <= RULE.limit; hit++) {
      expect((await checkRateLimit(store, RULE, "ip", T0 + hit)).allowed).toBe(true);
    }
    const refused = await checkRateLimit(store, RULE, "ip", T0 + 15_000);
    expect(refused.allowed).toBe(false);
    // Fifteen seconds into a sixty-second window.
    expect(refused.retryAfterSeconds).toBe(45);
  });

  it("keys counters by client and by rule", async () => {
    for (let hit = 0; hit < RULE.limit; hit++) await checkRateLimit(store, RULE, "a", T0);
    expect((await checkRateLimit(store, RULE, "a", T0)).allowed).toBe(false);
    expect((await checkRateLimit(store, RULE, "b", T0)).allowed).toBe(true);
    expect((await checkRateLimit(store, { ...RULE, name: "other" }, "a", T0)).allowed).toBe(true);
  });

  it("slides: the previous window still weighs at the start of the next, and fades", async () => {
    for (let hit = 0; hit < RULE.limit; hit++) await checkRateLimit(store, RULE, "ip", T0);
    // First millisecond of the next window: the old three count fully, and this refusal counts as one.
    expect((await checkRateLimit(store, RULE, "ip", T0 + WINDOW_MS)).allowed).toBe(false);
    // Three quarters through it they weigh a quarter: 0.75 + 2 <= 3.
    expect((await checkRateLimit(store, RULE, "ip", T0 + WINDOW_MS * 1.75)).allowed).toBe(true);
    // Two windows on only the middle window's two remain: 2 + 1 <= 3.
    expect((await checkRateLimit(store, RULE, "ip", T0 + WINDOW_MS * 2)).allowed).toBe(true);
  });

  it("expires a fresh counter after two windows, once", async () => {
    await checkRateLimit(store, RULE, "ip", T0);
    await checkRateLimit(store, RULE, "ip", T0);
    expect([...store.ttls.entries()]).toEqual([[`ratelimit:test:ip:1000`, 120]]);
  });

  it("counts refused requests too", async () => {
    for (let hit = 0; hit < RULE.limit + 5; hit++) await checkRateLimit(store, RULE, "ip", T0);
    expect(store.counters.get("ratelimit:test:ip:1000")).toBe(RULE.limit + 5);
  });
});

describe("the rules", () => {
  const [auth, mutation] = RATE_LIMIT_RULES;
  const first = (method: string, path: string) =>
    RATE_LIMIT_RULES.find((rule) => rule.matches(method, path))?.name ?? null;

  it("put login and its siblings under the tight auth rule", () => {
    expect(auth.limit).toBe(10);
    expect(auth.windowSeconds).toBe(60);
    expect(first("POST", "/api/v1/auth/login")).toBe("auth");
    expect(first("POST", "/api/v1/auth/register")).toBe("auth");
    expect(first("POST", "/api/v1/auth/forgot-password")).toBe("auth");
    expect(first("PATCH", "/api/v1/auth/change-password")).toBe("auth");
  });

  it("put other writes under the looser mutation rule", () => {
    expect(mutation.limit).toBeGreaterThan(auth.limit);
    expect(first("POST", "/api/v1/decks")).toBe("mutation");
    expect(first("PUT", "/api/v1/decks/abc/cards")).toBe("mutation");
    expect(first("DELETE", "/api/v1/users/bob/follow")).toBe("mutation");
    expect(first("POST", "/api/v1/auth/metafy/callback")).toBe("mutation");
    expect(first("POST", "/api/v1/auth/logout")).toBe("mutation");
  });

  it("leave reads, public POSTs, admin and preflights alone", () => {
    expect(first("GET", "/api/v1/cards")).toBeNull();
    expect(first("GET", "/api/v1/auth/me")).toBeNull();
    expect(first("POST", "/api/v1/cards/resolve")).toBeNull();
    expect(first("POST", "/api/v1/decks/abc/views")).toBeNull();
    expect(first("POST", "/api/v1/admin/oracles")).toBeNull();
    expect(first("OPTIONS", "/api/v1/decks")).toBeNull();
    expect(first("POST", "/docs")).toBeNull();
  });
});

describe("the plugin", () => {
  let store: FakeStore;
  let clock: number;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    store = new FakeStore();
    clock = T0;
    app = buildApp(new StubProvider(), {
      corsOrigins: [],
      rateLimit: { store: () => store, now: () => clock },
    });
  });

  function login(ip: string | null) {
    return app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(ip ? { "cf-connecting-ip": ip } : {}),
        },
        body: JSON.stringify({ email: "a@example.com", password: "password-1" }),
      }),
    );
  }

  it("answers 429 with Retry-After once an IP exceeds the auth limit", async () => {
    for (let hit = 0; hit < 10; hit++) expect((await login("1.1.1.1")).status).not.toBe(429);
    clock = T0 + 20_000;
    const refused = await login("1.1.1.1");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("40");
    expect(await refused.json()).toEqual({ error: "Too many requests", code: "RATE_LIMITED" });
    // Another client is unaffected.
    expect((await login("2.2.2.2")).status).not.toBe(429);
  });

  it("rejects before parsing the body", async () => {
    for (let hit = 0; hit < 11; hit++) await login("1.1.1.1");
    const res = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { "cf-connecting-ip": "1.1.1.1", "content-type": "application/json" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(429);
  });

  it("does not limit a request it cannot attribute", async () => {
    for (let hit = 0; hit < 20; hit++) expect((await login(null)).status).not.toBe(429);
    expect(store.counters.size).toBe(0);
  });

  it("never touches the store for public reads", async () => {
    for (let hit = 0; hit < 20; hit++) {
      const res = await app.handle(
        new Request("http://localhost/api/v1/cards?q=x", {
          headers: { "cf-connecting-ip": "1.1.1.1" },
        }),
      );
      expect(res.status).toBe(200);
    }
    expect(store.counters.size).toBe(0);
  });

  it("fails open when the store errors", async () => {
    store.failing = true;
    for (let hit = 0; hit < 15; hit++) expect((await login("1.1.1.1")).status).not.toBe(429);
  });

  it("fails open when no store is configured", async () => {
    app = buildApp(new StubProvider(), { corsOrigins: [], rateLimit: { store: () => null } });
    for (let hit = 0; hit < 15; hit++) expect((await login("1.1.1.1")).status).not.toBe(429);
  });
});
