import type { IngestOracle, IngestPrinting } from "../pipeline/types.ts";

export function printing(
  id: string,
  overrides: Partial<IngestPrinting> = {},
): IngestPrinting {
  return {
    id,
    name: overrides.name ?? `Card ${id}`,
    name_normalized: overrides.name_normalized ?? (overrides.name ?? `Card ${id}`).toLowerCase(),
    card_type: "Unit",
    is_token: false,
    energy: null,
    might: null,
    power: null,
    tags: [],
    domains: [],
    set_code: "TST",
    collector_number: "1",
    finishes: [],
    is_signature: false,
    is_alternate_art: false,
    is_overnumbered: false,
    is_special_collection: false,
    riftcodex_id: id,
    ...overrides,
  };
}

export function oracle(
  key: string,
  overrides: Partial<IngestOracle> = {},
): IngestOracle {
  const name = overrides.name ?? key;
  return {
    oracle_key: key,
    name,
    name_normalized: name.toLowerCase(),
    card_type: "Unit",
    is_token: false,
    energy: null,
    might: null,
    power: null,
    tags: [],
    domains: [],
    printings: overrides.printings ?? [printing(`${key}-printing`, { name })],
    ...overrides,
  };
}
