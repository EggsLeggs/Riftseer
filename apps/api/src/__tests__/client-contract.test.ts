/**
 * The typed client's contract with the route table.
 *
 * `@riftseer/types/client` declares what each public endpoint answers. Nothing
 * else ties those declarations to the routes, so this test does, twice over:
 * at compile time each client response type mirrors the route's 200 schema
 * as Elysia infers it (both directions, the way `schemas.ts` guards the card
 * model), and at run time the client calls `buildApp` in memory through its
 * `fetch` seam and the bodies that come back carry the fields it promises.
 * Drift in either direction fails here before a satellite ships against it.
 */

import { describe, expect, it } from "bun:test";
import {
  createRiftseerClient,
  type CardResolveResponse,
  type CardSearchResponse,
  type ClientResult,
  type FormatListResponse,
  type SetListResponse,
} from "@riftseer/types/client";
import type { Oracle, OracleDetail } from "@riftseer/types";
import { buildApp, type App } from "../app";
import {
  STUB_ALT_PRINTING_ID,
  STUB_FORMAT,
  STUB_ORACLE_ID,
  STUB_PRINTING_ID,
  StubProvider,
} from "./stub_card_provider";

// ─── Compile-time drift guard ─────────────────────────────────────────────────

type Mirrors<Server, Client> = [Server] extends [Client]
  ? [Client] extends [Server]
    ? true
    : { route_sends_a_field_the_client_does_not_declare: Exclude<keyof Server, keyof Client> }
  : { client_expects_a_field_the_route_does_not_send: Exclude<keyof Client, keyof Server> };

type Assert<T extends true> = T;

type V1 = App["~Routes"]["api"]["v1"];

type _Search = Assert<Mirrors<V1["cards"]["get"]["response"][200], CardSearchResponse>>;
type _Card = Assert<Mirrors<V1["cards"][":id"]["get"]["response"][200], Oracle>>;
type _BySlug = Assert<Mirrors<V1["cards"]["by-slug"]["*"]["get"]["response"][200], Oracle>>;
type _Detail = Assert<Mirrors<V1["cards"]["detail"]["get"]["response"][200], OracleDetail>>;
type _Random = Assert<Mirrors<V1["cards"]["random"]["get"]["response"][200], Oracle>>;
type _Resolve = Assert<
  Mirrors<V1["cards"]["resolve"]["post"]["response"][200], CardResolveResponse>
>;
type _Sets = Assert<Mirrors<V1["sets"]["get"]["response"][200], SetListResponse>>;
type _Formats = Assert<Mirrors<V1["formats"]["get"]["response"][200], FormatListResponse>>;

// ─── Run-time contract ────────────────────────────────────────────────────────

// No Redis here: a null store switches the limiter off rather than failing open
// with a warning per request.
const app = buildApp(new StubProvider(), { rateLimit: { store: () => null } });

const client = createRiftseerClient({
  baseUrl: "http://riftseer.test",
  fetch: (url, init) => app.handle(new Request(url, init)),
});

/** Unwraps an `ok` result; a failure is the finding, so it fails loudly. */
function dataOf<T>(result: ClientResult<T>): T {
  if (!result.ok) throw new Error(`${result.status}: ${JSON.stringify(result.error)}`);
  return result.data;
}

describe("the typed client against buildApp", () => {
  it("searches cards and reads the oracle-shaped page", async () => {
    const page = dataOf(await client.cards.search({ q: "sun disc", limit: 2 }));
    expect(page.unique).toBe("oracle");
    expect(page.printings).toEqual([]);
    expect(page.count).toBe(page.cards.length);
    expect(page).toMatchObject({ limit: 2, offset: 0, total: expect.any(Number) });
    expect(page.cards[0]).toMatchObject({ object: "oracle", id: STUB_ORACLE_ID });
  });

  it("searches printings when asked for unique=prints", async () => {
    const page = dataOf(await client.cards.search({ q: "sun disc", unique: "prints" }));
    expect(page.unique).toBe("prints");
    expect(page.printings.map((printing) => printing.id)).toContain(STUB_ALT_PRINTING_ID);
    expect(page.cards.map((oracle) => oracle.id)).toContain(STUB_ORACLE_ID);
  });

  it("surfaces a bad query as the API's own error, not a throw", async () => {
    const result = await client.cards.search({ q: '"unterminated' });
    expect(result).toMatchObject({ ok: false, status: 400, error: { code: "BAD_QUERY" } });
  });

  it("reads a card by id and by slug", async () => {
    const byId = dataOf(await client.cards.get(STUB_ORACLE_ID));
    const bySlug = dataOf(await client.cards.bySlug("ogn/22a/sun-disc"));
    expect(byId).toMatchObject({ object: "oracle", id: STUB_ORACLE_ID });
    expect(byId.preferred_printing?.id).toBe(STUB_PRINTING_ID);
    expect(bySlug.preferred_printing?.id).toBe(STUB_ALT_PRINTING_ID);
  });

  it("answers 404 as a result for an unknown card", async () => {
    expect(await client.cards.get("missing")).toEqual({
      ok: false,
      status: 404,
      error: { error: "Card not found", code: "NOT_FOUND" },
    });
  });

  it("reads the card page payload", async () => {
    const detail = dataOf(await client.cards.detail({ printing: STUB_PRINTING_ID }));
    expect(detail).toMatchObject({
      object: "oracle_detail",
      oracle: { id: STUB_ORACLE_ID },
      printing: { id: STUB_PRINTING_ID },
    });
    expect(detail.printings.length).toBeGreaterThan(1);
    expect(detail.legalities[0]).toMatchObject({ object: "card_legality" });
    expect(detail.rulings[0]).toMatchObject({ object: "card_ruling" });
  });

  it("strips prices unless asked to include them", async () => {
    const plain = dataOf(await client.cards.random());
    const priced = dataOf(await client.cards.random({ include: "prices" }));
    expect(plain.preferred_printing?.prices).toBeUndefined();
    expect(priced.preferred_printing?.prices).toBeDefined();
  });

  it("resolves a batch, one result per request in order", async () => {
    const batch = dataOf(
      await client.cards.resolve({ requests: ["Sun Disc", "[[Sun Disc|OGN-22]]", "Nothing Here"] }),
    );
    expect(batch.count).toBe(3);
    expect(batch.results.map((entry) => entry.matchType)).toEqual(["exact", "exact", "not-found"]);
    expect(batch.results[1]?.printing?.id).toBe(STUB_ALT_PRINTING_ID);
    expect(batch.results[2]).toMatchObject({ oracle: null, printing: null });
  });

  it("lists sets in their camel-cased shape", async () => {
    const sets = dataOf(await client.sets.list());
    expect(sets.count).toBe(sets.sets.length);
    expect(sets.sets[0]).toEqual({
      setCode: "OGN",
      setName: "Origins",
      cardCount: expect.any(Number),
      isPromo: false,
      publishedOn: "2025-01-01",
    });
  });

  it("lists formats with their zone rules", async () => {
    expect(dataOf(await client.formats.list())).toEqual({ count: 1, formats: [STUB_FORMAT] });
  });
});
