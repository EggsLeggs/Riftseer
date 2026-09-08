import { expect, test } from "bun:test";
import type { CardRequest } from "@riftseer/types";
// Each `from()` the fake records is one PostgREST request, which on Workers
// is one subrequest. Counting them is the point: the per-card path cost three
// per card and a full batch tripped the per-invocation limit (#181).
import { fakeDb, oracleRow, printingRow, providerWith } from "./fake-supabase.ts";

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
