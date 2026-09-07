/**
 * The CORS split: public reads answer `*`, everything else answers only the
 * site (and localhost), and admin routes never reflect a foreign origin.
 */

import { describe, expect, it } from "bun:test";
import { buildApp } from "../app";
import { StubProvider } from "./stub_card_provider";

const SITE = "https://riftseer.test";
const EVIL = "https://evil.example";

const app = buildApp(new StubProvider(), { corsOrigins: [SITE] });

function call(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<Response> {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

function preflight(path: string, method: string, origin: string): Promise<Response> {
  return call("OPTIONS", path, {
    origin,
    "access-control-request-method": method,
    "access-control-request-headers": "authorization, content-type",
  });
}

const allowOrigin = (res: Response) => res.headers.get("access-control-allow-origin");

describe("public routes", () => {
  it("answer * to any origin, and without one", async () => {
    for (const path of ["/api/v1/cards?q=x", "/api/v1/sets", "/api/v1/health", "/docs"]) {
      expect(allowOrigin(await call("GET", path, { origin: EVIL }))).toBe("*");
      expect(allowOrigin(await call("GET", path))).toBe("*");
    }
  });

  it("preflight a public read from a foreign origin", async () => {
    const res = await preflight("/api/v1/decks/abc", "GET", EVIL);
    expect(res.status).toBe(204);
    expect(allowOrigin(res)).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
    expect(res.headers.get("access-control-allow-headers")).toBe("authorization, content-type");
    expect(res.headers.get("access-control-max-age")).toBe("86400");
  });

  it("never ask for credentials with *", async () => {
    const res = await call("GET", "/api/v1/cards?q=x", { origin: EVIL });
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });
});

describe("account and mutation routes", () => {
  it("give a foreign origin no CORS answer at all", async () => {
    for (const [method, path] of [
      ["GET", "/api/v1/auth/me"],
      ["POST", "/api/v1/auth/login"],
      ["PATCH", "/api/v1/users/me"],
      ["DELETE", "/api/v1/decks/abc"],
      ["GET", "/api/v1/auth/metafy/status"],
    ]) {
      const res = await call(method, path, { origin: EVIL }, method === "GET" ? undefined : {});
      expect(`${method} ${path} ${allowOrigin(res)}`).toBe(`${method} ${path} null`);
      expect(res.headers.get("vary")).toBe("Origin");
    }
  });

  it("reflect the site origin, and localhost for development", async () => {
    for (const origin of [SITE, "http://localhost:3000", "http://127.0.0.1:8789"]) {
      const res = await call("GET", "/api/v1/auth/me", { origin });
      expect(allowOrigin(res)).toBe(origin);
    }
    expect(
      allowOrigin(await call("GET", "/api/v1/auth/me", { origin: "http://localhost.evil" })),
    ).toBeNull();
    expect(
      allowOrigin(await call("GET", "/api/v1/auth/me", { origin: "https://riftseer.test.evil" })),
    ).toBeNull();
  });

  it("preflight by the method the browser wants, not OPTIONS", async () => {
    const denied = await preflight("/api/v1/decks/abc", "DELETE", EVIL);
    expect(denied.status).toBe(204);
    expect(allowOrigin(denied)).toBeNull();
    expect(denied.headers.get("access-control-allow-methods")).toBeNull();

    const allowed = await preflight("/api/v1/decks/abc", "DELETE", SITE);
    expect(allowed.status).toBe(204);
    expect(allowOrigin(allowed)).toBe(SITE);
    expect(allowed.headers.get("access-control-allow-methods")).toContain("DELETE");
  });

  it("keep the CORS answer on an error response", async () => {
    const res = await call("GET", "/api/v1/auth/me", { origin: SITE });
    expect(res.status).toBe(401);
    expect(allowOrigin(res)).toBe(SITE);
  });
});

describe("admin routes", () => {
  it("never reflect a foreign origin, on the request or its preflight", async () => {
    const res = await call("GET", "/api/v1/admin/stats", { origin: EVIL });
    expect(res.status).toBe(401);
    expect(allowOrigin(res)).toBeNull();
    expect(allowOrigin(await preflight("/api/v1/admin/stats", "GET", EVIL))).toBeNull();
    expect(allowOrigin(await preflight("/api/v1/admin/oracles", "POST", EVIL))).toBeNull();
  });

  it("answer the site", async () => {
    expect(allowOrigin(await preflight("/api/v1/admin/stats", "GET", SITE))).toBe(SITE);
  });
});

describe("without a configured site origin", () => {
  it("still serves public reads and still refuses strangers", async () => {
    const bare = buildApp(new StubProvider(), { corsOrigins: [] });
    const pub = await bare.handle(
      new Request("http://localhost/api/v1/cards?q=x", { headers: { origin: EVIL } }),
    );
    expect(allowOrigin(pub)).toBe("*");
    const me = await bare.handle(
      new Request("http://localhost/api/v1/auth/me", { headers: { origin: SITE } }),
    );
    expect(allowOrigin(me)).toBeNull();
  });
});
