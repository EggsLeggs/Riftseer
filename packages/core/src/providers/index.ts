/**
 * Provider factory.
 *
 * To swap data sources:
 *   1. Add a new class implementing CardDataProvider.
 *   2. Add a case to createProvider() below.
 *   3. Set CARD_PROVIDER=<name> in your .env.
 *
 * Nothing else in the codebase needs to change.
 */

import { RiftCodexProvider } from "./riftcodex.ts";
import { RiotProvider } from "./riot.ts";
import { SupabaseCardProvider } from "./supabase.ts";
import type { CardDataProvider } from "../provider.ts";

export type ProviderName = "riftcodex" | "riot" | "supabase";

export function createProvider(name?: ProviderName): CardDataProvider {
  const p = (name ?? (process.env.CARD_PROVIDER as ProviderName | undefined) ?? "riftcodex");

  switch (p) {
    case "riftcodex":
      return new RiftCodexProvider();
    case "riot":
      return new RiotProvider();
    case "supabase":
      return new SupabaseCardProvider();
    default:
      throw new Error(
        `Unknown CARD_PROVIDER "${p}". Valid values: riftcodex, riot, supabase`
      );
  }
}

export { RiftCodexProvider } from "./riftcodex.ts";
export { RiotProvider } from "./riot.ts";
export { SupabaseCardProvider } from "./supabase.ts";
