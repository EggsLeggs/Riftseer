/**
 * CORS, split by what a route is for.
 *
 * Riftseer is a public API: third parties build browser clients on the card
 * data, so every route in `PUBLIC_ROUTES` answers `Access-Control-Allow-Origin: *`.
 * The account, deck-writing, Metafy and admin routes are the site's own. A
 * browser on any other origin gets no CORS answer for them at all — not a
 * refusal it can read, just silence — and admin routes never reflect a
 * foreign origin. Bearer tokens are never ambient, so this is defence in
 * depth rather than the boundary; the auth guards are.
 */

import { Elysia } from "elysia";
import { isPublicRoute } from "../public-routes";

export interface CorsOptions {
  /**
   * Origins that may call the non-public routes from a browser, normally just
   * `SITE_ORIGIN`. Localhost is always allowed: the Worker cannot tell
   * `wrangler dev` from production, and a page on the user's own machine holds
   * nothing a bearer-token API would otherwise keep from it.
   */
  allowedOrigins?: readonly string[];
}

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const ALLOWED_METHODS = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";
const DEFAULT_REQUEST_HEADERS = "Authorization, Content-Type";

/**
 * The `Access-Control-Allow-Origin` value for a request, or null for none:
 * `*` on a public route, the caller's own origin when it is allowed on a
 * restricted one.
 */
export function corsAllowOrigin(
  method: string,
  pathname: string,
  origin: string | null,
  allowedOrigins: readonly string[],
): string | null {
  if (isPublicRoute(method, pathname)) return "*";
  if (origin && (allowedOrigins.includes(origin) || LOCALHOST_ORIGIN.test(origin))) return origin;
  return null;
}

export function cors(options: CorsOptions = {}) {
  const allowedOrigins = options.allowedOrigins ?? [];

  return new Elysia({ name: "riftseer-cors" }).onRequest(({ request, set }) => {
    const preflight = request.method === "OPTIONS";
    // A preflight asks about the method it wants to send, not the one it is.
    const method = preflight
      ? (request.headers.get("access-control-request-method") ?? "GET")
      : request.method;
    const allow = corsAllowOrigin(
      method,
      new URL(request.url).pathname,
      request.headers.get("origin"),
      allowedOrigins,
    );

    if (allow) {
      set.headers["access-control-allow-origin"] = allow;
      set.headers["access-control-expose-headers"] = "Retry-After";
    }
    // `*` is the same answer for everyone; a reflected or withheld origin is not.
    if (allow !== "*") set.headers.vary = "Origin";

    if (!preflight) return;
    if (allow) {
      set.headers["access-control-allow-methods"] = ALLOWED_METHODS;
      set.headers["access-control-allow-headers"] =
        request.headers.get("access-control-request-headers") ?? DEFAULT_REQUEST_HEADERS;
      set.headers["access-control-max-age"] = "86400";
    }
    return new Response(null, { status: 204 });
  });
}
