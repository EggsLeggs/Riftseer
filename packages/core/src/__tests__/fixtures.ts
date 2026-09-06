import type { Oracle, Printing } from "../index.ts";

export function makePrinting(
  id = "aaaaaaaaaaaaaaaaaaaaaaaa",
  oracleId = "11111111-1111-1111-1111-111111111111",
  overrides: Partial<Printing> = {},
): Printing {
  return {
    object: "printing",
    id,
    oracle_id: oracleId,
    finishes: ["Normal"],
    signature: false,
    alternate_art: false,
    overnumbered: false,
    special_collection: false,
    public_slug: `ogn/1/${id}`,
    ...overrides,
  };
}

export function makeOracle(
  id = "11111111-1111-1111-1111-111111111111",
  overrides: Partial<Oracle> = {},
): Oracle {
  const name = overrides.name ?? "Test Card";
  return {
    object: "oracle",
    id,
    oracle_key: name.toLowerCase(),
    slug: name.toLowerCase().replaceAll(" ", "-"),
    name,
    name_normalized: name.toLowerCase(),
    is_token: false,
    keywords: [],
    tags: [],
    domains: [],
    meta_flags: [],
    ...overrides,
  };
}
