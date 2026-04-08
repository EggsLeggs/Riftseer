/**
 * Riftseer API client — Eden Treaty typed against @riftseer/api, with a custom fetcher
 * that uses the RIFTSEER_API service binding when present (avoids Worker→Worker 1042 on *.workers.dev).
 */
import { treaty } from "@elysiajs/eden";
import type { App } from "@riftseer/api";
import type { Env } from "./env.ts";

/** Eden joins base (trailing /) + path (/api/...) → `//api`; normalize before fetch. */
function normalizeRequestUrl(url: string): string {
  try {
    const u = new URL(url);
    u.pathname = u.pathname.replace(/\/{2,}/g, "/");
    return u.toString();
  } catch {
    return url;
  }
}

function bindingAwareFetch(env: Env) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const normalized = normalizeRequestUrl(url);
    const req =
      input instanceof Request
        ? new Request(new Request(normalized, input), init)
        : new Request(normalized, init);
    if (env.RIFTSEER_API) {
      return env.RIFTSEER_API.fetch(req);
    }
    return fetch(req);
  };
}

/** Origin only; optional trailing /api or /api/v1. */
export function normalizeApiOrigin(input: string): string {
  let s = input.trim().replace(/\/+$/, "");
  if (s.endsWith("/api/v1")) s = s.slice(0, -"/api/v1".length);
  else if (s.endsWith("/api")) s = s.slice(0, -"/api".length);
  return s.replace(/\/+$/, "");
}

export function createClient(env: Env) {
  return treaty<App>(normalizeApiOrigin(env.API_BASE_URL), {
    fetcher: bindingAwareFetch(env) as typeof fetch,
  });
}

export type ApiClient = ReturnType<typeof createClient>;

type RandomCardData = Awaited<
  ReturnType<ApiClient["api"]["v1"]["cards"]["random"]["get"]>
>["data"];
type ResolveData = Awaited<
  ReturnType<ApiClient["api"]["v1"]["cards"]["resolve"]["post"]>
>["data"];
type SetsData = Awaited<ReturnType<ApiClient["api"]["v1"]["sets"]["get"]>>["data"];

export type Card = NonNullable<RandomCardData>;
export type ResolvedCard = NonNullable<ResolveData>["results"][number];
export type CardSet = NonNullable<SetsData>["sets"][number];
