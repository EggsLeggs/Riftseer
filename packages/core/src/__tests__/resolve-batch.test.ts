import { expect, test } from "bun:test";
import type { CardRequest } from "@riftseer/types";
import { SupabaseCardProvider } from "../providers/supabase.ts";

// Each `from()` is one PostgREST request, which on Workers is one subrequest.
// Counting them is the whole point of these tests: the per-card path cost three
// per card and a full batch tripped the per-invocation limit (#181).
interface Recorded {
  table: string;
  column?: string;
  values?: string[];
}

function fakeDb(rows: { oracles: unknown[]; printings: unknown[] }) {
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

function oracleRow(id: string, name: string, preferredPrintingId: string | null) {
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

function printingRow(id: string, oracleId: string, collector: string) {
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
  };
}

function providerWith(db: unknown) {
  const provider = new SupabaseCardProvider();
  // `db` is a lazy private getter over getSupabaseClient(); this is the seam.
  (provider as unknown as { client: unknown }).client = db;
  return provider;
}

const req = (name: string): CardRequest => ({ raw: `[[${name}]]`, name });

test("a full batch of exact names costs two queries, not three per card", async () => {
  const names = Array.from({ length: 20 }, (_, i) => `Card ${i}`);
  const oracles = names.map((n, i) => oracleRow(`o${i}`, n, `p${i}`));
  const printings = names.map((_, i) => printingRow(`p${i}`, `o${i}`, "001"));

  const { db, calls } = fakeDb({ oracles, printings });
  const results = await providerWith(db).resolveRequests(names.map(req));

  expect(calls.length).toBe(2);
  expect(calls[0]!.table).toBe("oracles");
  expect(calls[0]!.column).toBe("name_normalized");
  expect(calls[1]!.table).toBe("printings");
  expect(calls[1]!.column).toBe("oracle_id");

  // Cheap is only useful if it is also correct.
  expect(results.length).toBe(20);
  expect(results.every((r) => r.matchType === "exact")).toBe(true);
  expect(results.map((r) => r.oracle?.name)).toEqual(names);
  expect(results.map((r) => r.printing?.id)).toEqual(names.map((_, i) => `p${i}`));
});

test("query count does not grow with batch size", async () => {
  const counts: number[] = [];
  for (const size of [1, 5, 20]) {
    const names = Array.from({ length: size }, (_, i) => `Card ${i}`);
    const { db, calls } = fakeDb({
      oracles: names.map((n, i) => oracleRow(`o${i}`, n, `p${i}`)),
      printings: names.map((_, i) => printingRow(`p${i}`, `o${i}`, "001")),
    });
    await providerWith(db).resolveRequests(names.map(req));
    counts.push(calls.length);
  }
  expect(counts).toEqual([2, 2, 2]);
});

test("results keep request order and every printing of the oracle", async () => {
  const oracles = [oracleRow("o1", "Gold", "p2")];
  const printings = [printingRow("p1", "o1", "001"), printingRow("p2", "o1", "002")];
  const { db } = fakeDb({ oracles, printings });

  const [result] = await providerWith(db).resolveRequests([req("Gold")]);

  // The preferred printing is picked out of the batch read, not fetched again.
  expect(result!.printing?.id).toBe("p2");
  expect(result!.oracle?.printings?.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
});

test("an unmatched name resolves to not-found without a printing", async () => {
  const { db } = fakeDb({ oracles: [], printings: [] });
  const [result] = await providerWith(db).resolveRequests([req("!!!")]);
  expect(result!.matchType).toBe("not-found");
  expect(result!.oracle).toBeNull();
  expect(result!.printing).toBeNull();
});

test("an empty batch asks the database nothing", async () => {
  const { db, calls } = fakeDb({ oracles: [], printings: [] });
  expect(await providerWith(db).resolveRequests([])).toEqual([]);
  expect(calls.length).toBe(0);
});
