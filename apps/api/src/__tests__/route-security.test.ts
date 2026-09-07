/**
 * The route-auth invariant.
 *
 * The Worker holds the service-role key, so a route that forgot
 * `.use(authPlugin)` is a full-database read for anyone. This test walks every
 * mounted route: it is either named in `PUBLIC_ROUTES` (or is a session
 * endpoint listed below) or it carries the auth or admin guard. Guarded is
 * decided by hook identity — the very function the plugins register — and,
 * for routes without an input schema, confirmed by an anonymous request
 * answering 401. Body validation runs before `resolve` in Elysia, so a
 * bodied route cannot be probed the same way without knowing its shape.
 */

import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { buildApp } from "../app";
import { adminPlugin } from "../plugins/admin-auth";
import { authPlugin } from "../plugins/auth";
import { isPublicRoute, PUBLIC_ROUTES } from "../public-routes";
import { StubProvider } from "./stub_card_provider";

/**
 * Anonymous by design: there is no account yet, or the token is the thing
 * being handed over. Not public — CORS restricts them to the site.
 */
const SESSION_ROUTES = [
  "POST /api/v1/auth/register",
  "POST /api/v1/auth/login",
  "POST /api/v1/auth/refresh",
  "POST /api/v1/auth/forgot-password",
];

const app = buildApp(new StubProvider());

type Route = (typeof app.routes)[number];
type HookContainer = { fn?: unknown };

function registeredGuards(plugin: { event: { beforeHandle?: HookContainer[] } }): unknown[] {
  return (plugin.event.beforeHandle ?? []).map((hook) => hook.fn);
}

const USER_GUARDS = new Set(registeredGuards(authPlugin));
const ADMIN_GUARDS = new Set(registeredGuards(adminPlugin));

function guardsOn(route: Route): Set<unknown> {
  const hooks = (route.hooks.beforeHandle ?? []) as HookContainer[];
  return new Set(hooks.map((hook) => hook.fn));
}

function hasAny(found: Set<unknown>, wanted: Set<unknown>): boolean {
  for (const fn of wanted) if (found.has(fn)) return true;
  return false;
}

function isGuarded(route: Route): boolean {
  const found = guardsOn(route);
  return hasAny(found, USER_GUARDS) || hasAny(found, ADMIN_GUARDS);
}

const routes = app.routes.filter((route) => route.method !== "OPTIONS");
const routeKey = (route: Route) => `${route.method} ${route.path}`;
const mounted = new Set(routes.map(routeKey));
const anonymousByDesign = new Set<string>([...PUBLIC_ROUTES, ...SESSION_ROUTES]);

/** A concrete URL for a route pattern; param values only need to pass validation. */
function sampleUrl(path: string): string {
  const filled = path
    .replace(/:handle/g, "someone")
    .replace(/:code|:setCode/g, "standard")
    .replace(/:zone/g, "main")
    .replace(/:legality_status/g, "banned")
    .replace(/:\w+/g, "11111111-1111-4111-8111-111111111111")
    .replace(/\*/g, "ogn/sample");
  return `http://localhost${filled}`;
}

describe("route-auth invariant", () => {
  it("names only routes that are actually mounted", () => {
    const stale = [...anonymousByDesign].filter((key) => !mounted.has(key));
    expect(stale).toEqual([]);
  });

  it("guards every route that is not public by allowlist", () => {
    const unguarded = routes
      .filter((route) => !anonymousByDesign.has(routeKey(route)) && !isGuarded(route))
      .map(routeKey);
    expect(unguarded).toEqual([]);
  });

  it("does not list a guarded route as public", () => {
    const contradictions = routes
      .filter((route) => anonymousByDesign.has(routeKey(route)) && isGuarded(route))
      .map(routeKey);
    expect(contradictions).toEqual([]);
  });

  it("puts every admin route behind the admin guard specifically", () => {
    const weak = routes
      .filter((route) => route.path.startsWith("/api/v1/admin"))
      .filter((route) => !hasAny(guardsOn(route), ADMIN_GUARDS))
      .map(routeKey);
    expect(weak).toEqual([]);
  });

  it("answers 401 to an anonymous request on every guarded route without an input schema", async () => {
    const probed = routes.filter(
      (route) =>
        isGuarded(route) && route.hooks.body === undefined && route.hooks.query === undefined,
    );
    expect(probed.length).toBeGreaterThan(20);
    const leaks: string[] = [];
    for (const route of probed) {
      const res = await app.handle(new Request(sampleUrl(route.path), { method: route.method }));
      if (res.status !== 401) leaks.push(`${routeKey(route)} -> ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it("serves the public GET routes anonymously", async () => {
    const refused: string[] = [];
    for (const route of routes) {
      if (route.method !== "GET" || !anonymousByDesign.has(routeKey(route))) continue;
      const res = await app.handle(new Request(sampleUrl(route.path)));
      if (res.status === 401 || res.status === 403)
        refused.push(`${routeKey(route)} -> ${res.status}`);
    }
    expect(refused).toEqual([]);
  });
});

describe("the guards themselves", () => {
  const anonymous = new Request("http://localhost/x");
  const bearer = new Request("http://localhost/x", { headers: { authorization: "Bearer nope" } });

  it("auth guard rejects an anonymous request, and never resolves a token without a service", async () => {
    const scratch = new Elysia().use(authPlugin).get("/x", () => ({ ok: true }));
    expect((await scratch.handle(anonymous)).status).toBe(401);
    // No Supabase in tests: the token cannot be verified, so the answer is 503, never 200.
    expect((await scratch.handle(bearer)).status).toBe(503);
  });

  it("admin guard rejects an anonymous request the same way", async () => {
    const scratch = new Elysia().use(adminPlugin).get("/x", () => ({ ok: true }));
    expect((await scratch.handle(anonymous)).status).toBe(401);
    expect((await scratch.handle(bearer)).status).toBe(503);
  });
});

describe("isPublicRoute", () => {
  it("matches by method and path pattern", () => {
    expect(isPublicRoute("GET", "/api/v1/cards")).toBe(true);
    expect(isPublicRoute("HEAD", "/api/v1/cards")).toBe(true);
    expect(isPublicRoute("GET", "/api/v1/cards/by-slug/ogn/some-card")).toBe(true);
    expect(isPublicRoute("GET", "/api/v1/decks/abc")).toBe(true);
    expect(isPublicRoute("POST", "/api/v1/decks/abc/views")).toBe(true);
    expect(isPublicRoute("DELETE", "/api/v1/decks/abc")).toBe(false);
    expect(isPublicRoute("GET", "/api/v1/decks/abc/nested/deeper")).toBe(false);
    expect(isPublicRoute("PATCH", "/api/v1/users/me")).toBe(false);
    expect(isPublicRoute("GET", "/api/v1/auth/me")).toBe(false);
    expect(isPublicRoute("POST", "/api/v1/auth/login")).toBe(false);
    expect(isPublicRoute("GET", "/api/v1/admin/stats")).toBe(false);
  });
});
