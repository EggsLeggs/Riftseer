/**
 * Sliding-window rate limits on the endpoints worth abusing.
 *
 * Counters live in Upstash Redis through `getRedisClient()`: one per client,
 * rule and window, with the previous window weighted by how much of it still
 * overlaps. Redis unconfigured or erroring fails OPEN — a limiter outage must
 * not take the API down — and logs once when it is unconfigured. The client
 * key is `CF-Connecting-IP`; a request without one (tests, direct
 * `app.handle` calls) cannot be attributed and is not limited.
 *
 * Keyed on the request path before routing, so a 429 costs no parsing or
 * validation. Every rejected request still counts.
 */

import { Elysia } from "elysia";
import { getRedisClient } from "@riftseer/core/server";
import { compileRouteMatcher, isPublicRoute } from "../public-routes";

/** The three Redis commands the window needs; Upstash's client satisfies it as is. */
export interface RateLimitStore {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  get(key: string): Promise<string | number | null>;
}

export interface RateLimitRule {
  name: string;
  /** Requests allowed per client per window. */
  limit: number;
  windowSeconds: number;
  matches(method: string, pathname: string): boolean;
}

const isAuthRoute = compileRouteMatcher([
  "POST /api/v1/auth/register",
  "POST /api/v1/auth/login",
  "POST /api/v1/auth/refresh",
  "POST /api/v1/auth/forgot-password",
  "POST /api/v1/auth/reset-password",
  "PATCH /api/v1/auth/change-password",
  "PATCH /api/v1/auth/email",
]);

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** First match wins; a login attempt is counted once, under `auth`. */
export const RATE_LIMIT_RULES: readonly RateLimitRule[] = [
  { name: "auth", limit: 10, windowSeconds: 60, matches: isAuthRoute },
  {
    // Every other write a signed-in user can make. Public POSTs (batch
    // resolve, view counts) are reads in all but verb, and admin is behind
    // ADMIN_USER_IDS with a handful of people bulk-editing by hand.
    name: "mutation",
    limit: 120,
    windowSeconds: 60,
    matches: (method, pathname) =>
      !READ_METHODS.has(method) &&
      pathname.startsWith("/api/v1/") &&
      !pathname.startsWith("/api/v1/admin") &&
      !isPublicRoute(method, pathname),
  },
];

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the current window ends; 0 when allowed. */
  retryAfterSeconds: number;
}

/**
 * Counts this request and decides. The estimate is the current window's count
 * plus the previous window's, scaled by how much of the previous window is
 * still inside the sliding one.
 */
export async function checkRateLimit(
  store: RateLimitStore,
  rule: RateLimitRule,
  client: string,
  now = Date.now(),
): Promise<RateLimitDecision> {
  const windowMs = rule.windowSeconds * 1000;
  const index = Math.floor(now / windowMs);
  const prefix = `ratelimit:${rule.name}:${client}`;
  const current = `${prefix}:${index}`;

  const [count, previous] = await Promise.all([
    store.incr(current),
    store.get(`${prefix}:${index - 1}`),
  ]);
  // A fresh counter lives for two windows so the next window can still read it.
  if (count === 1) await store.expire(current, rule.windowSeconds * 2);

  const elapsed = (now - index * windowMs) / windowMs;
  const estimate = Number(previous ?? 0) * (1 - elapsed) + count;
  if (estimate <= rule.limit) return { allowed: true, retryAfterSeconds: 0 };
  const remainingMs = (index + 1) * windowMs - now;
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
}

export interface RateLimitOptions {
  /** Where counters live; null disables limiting. Defaults to Upstash via `getRedisClient()`. */
  store?: () => RateLimitStore | null;
  rules?: readonly RateLimitRule[];
  /** How a request is attributed; null means it cannot be, and is not limited. */
  clientKey?: (request: Request) => string | null;
  now?: () => number;
}

let warnedUnconfigured = false;

export function rateLimit(options: RateLimitOptions = {}) {
  const store = options.store ?? (() => getRedisClient());
  const rules = options.rules ?? RATE_LIMIT_RULES;
  const clientKey = options.clientKey ?? ((request) => request.headers.get("cf-connecting-ip"));
  const now = options.now ?? Date.now;

  return new Elysia({ name: "riftseer-rate-limit" }).onRequest(async ({ request, set }) => {
    const pathname = new URL(request.url).pathname;
    const rule = rules.find((candidate) => candidate.matches(request.method, pathname));
    if (!rule) return;
    const client = clientKey(request);
    if (!client) return;

    const counters = store();
    if (!counters) {
      if (!warnedUnconfigured) {
        warnedUnconfigured = true;
        console.warn(
          "[riftseer-api] rate limiting disabled: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not set",
        );
      }
      return;
    }

    let decision: RateLimitDecision;
    try {
      decision = await checkRateLimit(counters, rule, client, now());
    } catch (error) {
      // Fail open: the limiter is protection, not the service.
      console.error(
        JSON.stringify({
          message: "rate limit check failed; request allowed",
          rule: rule.name,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return;
    }
    if (decision.allowed) return;

    set.status = 429;
    set.headers["retry-after"] = String(decision.retryAfterSeconds);
    return { error: "Too many requests", code: "RATE_LIMITED" };
  });
}
