/**
 * Which mounted routes carry an auth guard, decided by hook identity.
 *
 * `authPlugin` and `adminPlugin` each register one `beforeHandle` function.
 * A route that used the plugin has that exact function on its own hooks, so
 * asking the plugin what it registered and looking for it on the route needs
 * no naming convention and cannot be satisfied by a lookalike.
 *
 * Two callers read this, and that is the point: `__tests__/route-security.test.ts`
 * fails the build when a non-public route has no guard, and `scripts/generate-spec.ts`
 * stamps `security` on the same set, so the published spec cannot claim a
 * guarded route is anonymous.
 */

import { adminPlugin } from "./plugins/admin-auth";
import { authPlugin } from "./plugins/auth";
import { OPTIONAL_AUTH_ROUTES } from "./public-routes";

/** The part of a mounted Elysia route this module reads. */
export interface RouteWithHooks {
  hooks: { beforeHandle?: unknown };
}

interface PluginWithHooks {
  event: { beforeHandle?: unknown };
}

/** Elysia stores a hook as `{ fn }`; a bare function is still accepted. */
function hookFunctions(hooks: unknown): unknown[] {
  if (!Array.isArray(hooks)) return [];
  return hooks.map((hook) => (hook && typeof hook === "object" && "fn" in hook ? hook.fn : hook));
}

function registeredGuards(plugin: PluginWithHooks): Set<unknown> {
  return new Set(hookFunctions(plugin.event.beforeHandle));
}

/** The functions `authPlugin` registers. A route carrying one is authenticated. */
export const USER_GUARDS: ReadonlySet<unknown> = registeredGuards(authPlugin);

/** The functions `adminPlugin` registers. Authentication plus the `ADMIN_USER_IDS` check. */
export const ADMIN_GUARDS: ReadonlySet<unknown> = registeredGuards(adminPlugin);

function carriesAny(route: RouteWithHooks, guards: ReadonlySet<unknown>): boolean {
  return hookFunctions(route.hooks.beforeHandle).some((fn) => guards.has(fn));
}

/** True when the route rejects an anonymous caller with 401. */
export function isGuarded(route: RouteWithHooks): boolean {
  return carriesAny(route, USER_GUARDS) || carriesAny(route, ADMIN_GUARDS);
}

/** True when the route carries the admin guard specifically, not merely an authenticated one. */
export function isAdminGuarded(route: RouteWithHooks): boolean {
  return carriesAny(route, ADMIN_GUARDS);
}

/** One entry of an OpenAPI `security` list: scheme name to scopes, `{}` for anonymous. */
export type SecurityRequirement = Record<string, readonly string[]>;

const BEARER: readonly SecurityRequirement[] = [{ bearerAuth: [] }];
const OPTIONAL_BEARER: readonly SecurityRequirement[] = [{}, { bearerAuth: [] }];

export interface MountedRoute extends RouteWithHooks {
  method: string;
  path: string;
}

/** Elysia writes a parameter `:handle`; OpenAPI writes it `{handle}`. */
export function toSpecPath(elysiaPath: string): string {
  return elysiaPath.replace(/:(\w+)/g, "{$1}");
}

/**
 * The `security` every mounted route needs, keyed `"GET /api/v1/users/{handle}"`
 * so a caller can look an OpenAPI operation up directly. A route needing none
 * is absent rather than mapped to an empty list.
 */
export function securityByOperation(
  routes: readonly MountedRoute[],
): Map<string, readonly SecurityRequirement[]> {
  const optional = new Set<string>(OPTIONAL_AUTH_ROUTES);
  const byOperation = new Map<string, readonly SecurityRequirement[]>();
  for (const route of routes) {
    if (route.method === "OPTIONS") continue;
    let security: readonly SecurityRequirement[] | null = null;
    if (isGuarded(route)) security = BEARER;
    else if (optional.has(`${route.method} ${route.path}`)) security = OPTIONAL_BEARER;
    if (security) byOperation.set(`${route.method} ${toSpecPath(route.path)}`, security);
  }
  return byOperation;
}
