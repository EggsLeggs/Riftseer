/**
 * A counting stand-in for the Supabase client.
 *
 * Two things are hard to test any other way. How many round-trips a provider
 * method makes — each `from()` is one PostgREST request, which on Workers is
 * one subrequest — and how a raw row maps to a wire object, since the mappers
 * are module-private and only observable through a provider call.
 */
import { SupabaseCardProvider } from "../providers/supabase.ts";

export interface Recorded {
  table: string;
  column?: string;
  values?: string[];
}

export function fakeDb(rows: { oracles: unknown[]; printings: unknown[] }) {
  const calls: Recorded[] = [];

  function builder(table: string) {
    const record: Recorded = { table };
    calls.push(record);
    const data = table === "oracles" ? rows.oracles : rows.printings;
    const chain = {
      select: () => chain,
      is: () => chain,
      eq: () => chain,
      in: (column: string, values: string[]) => {
        record.column = column;
        record.values = values;
        return chain;
      },
      // The provider awaits the builder directly, so the fake has to be
      // thenable exactly as PostgREST's builder is. That is the behaviour
      // under test, not an accident.
      // oxlint-disable-next-line no-thenable
      then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
        resolve({ data, error: null }),
    };
    return chain;
  }

  return { db: { from: builder }, calls };
}

export function oracleRow(id: string, name: string, preferredPrintingId: string | null) {
  return {
    id,
    oracle_key: name.toLowerCase(),
    slug: name.toLowerCase(),
    name,
    name_normalized: name.toLowerCase(),
    card_type: "Unit",
    supertype: null,
    is_token: false,
    energy: null,
    might: null,
    power: null,
    might_bonus: null,
    equipment_text: null,
    text_rich: null,
    text_plain: null,
    keywords: null,
    tags: null,
    domains: null,
    meta_flags: null,
    preferred_printing_id: preferredPrintingId,
    source: "riftcodex" as const,
    updated_at: null,
  };
}

export function printingRow(
  id: string,
  oracleId: string,
  collector: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    oracle_id: oracleId,
    collector_number: collector,
    released_at: null,
    rarity: "Common",
    public_slug: `${oracleId}-${collector}`,
    flavour_text: null,
    finishes: null,
    is_signature: false,
    is_alternate_art: false,
    is_overnumbered: false,
    is_special_collection: false,
    riftcodex_id: null,
    riftbound_id: null,
    tcgplayer_id: null,
    cardmarket_id: null,
    image_source_url: null,
    image_source_hash: null,
    image_orientation: null,
    image_alt_text: null,
    image_hosted_at: null,
    price_normal: null,
    price_foil: null,
    price_low_normal: null,
    ...overrides,
  };
}

export function providerWith(db: unknown) {
  const provider = new SupabaseCardProvider();
  // `db` is a lazy private getter over getSupabaseClient(); this is the seam.
  (provider as unknown as { client: unknown }).client = db;
  return provider;
}
