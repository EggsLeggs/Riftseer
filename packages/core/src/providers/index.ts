/**
 * Provider factory.
 *
 * Set CARD_PROVIDER=supabase in your .env. The Supabase provider reads from
 * Postgres (populated by the ingest pipeline) and builds an in-memory index.
 */

import { SupabaseCardProvider } from "./supabase.ts";
import type { CardDataProvider } from "../provider.ts";

export type ProviderName = "supabase";

export function createProvider(name?: ProviderName): CardDataProvider {
  const p = name ?? (process.env.CARD_PROVIDER as ProviderName | undefined) ?? "supabase";
  if (p !== "supabase") {
    throw new Error(`Unknown CARD_PROVIDER "${p}". Valid value: supabase`);
  }
  return new SupabaseCardProvider();
}

export { SupabaseCardProvider } from "./supabase.ts";
