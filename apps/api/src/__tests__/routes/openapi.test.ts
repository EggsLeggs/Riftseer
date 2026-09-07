/**
 * The docs page, the served spec, and the one property the single-source
 * composition exists to guarantee: a mounted route is in the spec.
 */

import { describe, expect, it } from "bun:test";
import { buildApp } from "../../app";
import { StubProvider } from "../stub_card_provider";
import spec from "../../../openapi.json";

const app = buildApp(new StubProvider());
const paths = spec.paths as Record<string, Record<string, unknown>>;

describe("GET /docs", () => {
  it("serves the reference page pointed at the served spec", async () => {
    const res = await app.handle(new Request("http://localhost/docs"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain('data-url="/api/v1/openapi.json"');
  });
});

describe("GET /api/v1/openapi.json", () => {
  it("serves the committed spec as JSON", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/openapi.json"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { openapi: string; paths: object };
    expect(body.openapi).toBe("3.0.3");
    expect(Object.keys(body.paths)).toEqual(Object.keys(paths));
  });
});

describe("the committed spec", () => {
  it("lists every mounted route", () => {
    const missing = app.routes
      .filter(
        (route) =>
          route.method !== "OPTIONS" &&
          !route.path.includes("*") &&
          route.hooks?.detail?.hide !== true,
      )
      .map((route) => `${route.method} ${route.path.replace(/:(\w+)/g, "{$1}")}`)
      .filter((key) => {
        const [method, path] = key.split(" ");
        return !paths[path]?.[method.toLowerCase()];
      });
    expect(missing).toEqual([]);
  });

  it("documents the users and metafy routes", () => {
    for (const path of [
      "/api/v1/users/{handle}",
      "/api/v1/users/{handle}/followers",
      "/api/v1/users/{handle}/following",
      "/api/v1/users/{handle}/follow",
      "/api/v1/users/me",
      "/api/v1/auth/metafy/status",
      "/api/v1/auth/metafy/connect",
      "/api/v1/auth/metafy/callback",
      "/api/v1/auth/metafy/disconnect",
      "/api/v1/auth/metafy/refresh-status",
    ]) {
      expect(paths[path]).toBeDefined();
    }
  });

  it("hides the docs routes from itself", () => {
    expect(paths["/docs"]).toBeUndefined();
    expect(paths["/api/v1/openapi.json"]).toBeUndefined();
  });
});
