/**
 * RiftSeer API client for the Discord bot.
 * Uses Eden Treaty for type-safe access to the Elysia API (same pattern as the frontend).
 */
import { treaty } from "@elysiajs/eden";
import type { App } from "@riftseer/api";

export function createClient(baseUrl: string) {
  return treaty<App>(baseUrl);
}

export type ApiClient = ReturnType<typeof createClient>;

// Derive types from the Eden client's return types (mirrors packages/frontend/src/api.ts)
type RandomCardData = Awaited<ReturnType<ApiClient["api"]["cards"]["random"]["get"]>>["data"];
type ResolveData = Awaited<ReturnType<ApiClient["api"]["resolve"]["post"]>>["data"];
type SetsData = Awaited<ReturnType<ApiClient["api"]["sets"]["get"]>>["data"];

export type Card = NonNullable<RandomCardData>;
export type ResolvedCard = NonNullable<ResolveData>["results"][number];
export type CardSet = NonNullable<SetsData>["sets"][number];
