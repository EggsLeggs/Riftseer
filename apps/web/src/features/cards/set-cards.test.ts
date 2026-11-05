import { afterEach, describe, expect, test } from "bun:test";

// `src/lib/env.ts` parses at module scope, and the root bunfig sets
// `env = false`, so these must exist before `./api` is pulled in.
// Next generates literal types for these, hence the widening cast.
const testEnv = process.env as unknown as Record<string, string>;
testEnv.NEXT_PUBLIC_API_URL ??= "https://api.test.invalid";
testEnv.NEXT_PUBLIC_APP_URL ??= "https://test.invalid";
const { cardsApi } = await import("./api");
type CardResult = Awaited<ReturnType<typeof cardsApi.getSetCards>>["cards"][number];
type SearchByNameOptions = Parameters<typeof cardsApi.searchByName>[1] & {};

/**
 * `getSetCards` has to page: the API clamps `limit` to 100 and says so, and a
 * single request quietly returned the first hundred of a 234-card set. These
 * drive it through `searchByName`, which is the only thing it calls.
 */
/** A card only needs an identifiable printing id for these assertions. */
function cardAt(index: number): CardResult {
  return { oracle: {}, printing: { id: `c${index}` } } as unknown as CardResult;
}

function stubSearch(total: number, pageSize = 100) {
  const calls: Array<{ offset: number; limit: number }> = [];
  const original = cardsApi.searchByName;
  cardsApi.searchByName = (async (_name: string, opts: SearchByNameOptions = {}) => {
    const offset = Math.floor(opts.offset ?? 0);
    const limit = Math.floor(opts.limit ?? 10);
    calls.push({ offset, limit });
    const count = Math.min(pageSize, Math.max(0, total - offset));
    return {
      count,
      total,
      offset,
      limit,
      cards: Array.from({ length: count }, (_, i) => cardAt(offset + i)),
    };
  }) as typeof cardsApi.searchByName;
  return { calls, restore: () => (cardsApi.searchByName = original) };
}

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

describe("getSetCards", () => {
  test("returns every card in a set larger than one page", async () => {
    const stub = stubSearch(234);
    restore = stub.restore;

    const result = await cardsApi.getSetCards("RAD");

    expect(result.cards).toHaveLength(234);
    expect(result.count).toBe(234);
    expect(result.total).toBe(234);
    expect(stub.calls.map((c) => c.offset)).toEqual([0, 100, 200]);
    // ids are unique, so no page was fetched twice or skipped
    expect(new Set(result.cards.map((c) => c.printing.id)).size).toBe(234);
  });

  test("makes a single request when the set fits on one page", async () => {
    const stub = stubSearch(24);
    restore = stub.restore;

    const result = await cardsApi.getSetCards("OGS");

    expect(result.cards).toHaveLength(24);
    expect(stub.calls).toHaveLength(1);
  });

  test("stops on an exact multiple of the page size rather than looping", async () => {
    const stub = stubSearch(200);
    restore = stub.restore;

    const result = await cardsApi.getSetCards("TST");

    expect(result.cards).toHaveLength(200);
    // 2 full pages satisfy `total`; a third request would be wasted
    expect(stub.calls).toHaveLength(2);
  });

  test("does not spin when the reported total never arrives", async () => {
    // A `total` that overstates what the API will return must still terminate.
    const stub = stubSearch(10_000);
    restore = stub.restore;

    const result = await cardsApi.getSetCards("BAD");

    expect(stub.calls.length).toBeLessThanOrEqual(12);
    expect(result.cards.length).toBe(stub.calls.length * 100);
  });

  test("passes the price flag through to every page", async () => {
    const stub = stubSearch(150);
    restore = stub.restore;

    await cardsApi.getSetCards("RAD", { includePrices: true });

    expect(stub.calls).toHaveLength(2);
  });
});
