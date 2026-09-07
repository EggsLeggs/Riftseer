import { describe, expect, it } from "bun:test";
import { CLIENT_ERROR_CODES, createRiftseerClient, type FetchLike } from "../client/index.ts";

/** A fetch that records what it was asked and answers a canned response. */
function fakeFetch(respond: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const send: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { calls, send };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("createRiftseerClient", () => {
  it("builds the /api/v1 URL from the origin and drops trailing slashes", async () => {
    const { calls, send } = fakeFetch(() => json({ count: 0, sets: [] }));
    await createRiftseerClient({ baseUrl: "https://api.example.com///", fetch: send }).sets.list();
    expect(calls[0]?.url).toBe("https://api.example.com/api/v1/sets");
    expect(calls[0]?.init.method).toBe("GET");
  });

  it("encodes search parameters and omits the unset ones", async () => {
    const { calls, send } = fakeFetch(() =>
      json({ unique: "oracle", count: 0, cards: [], printings: [] }),
    );
    await createRiftseerClient({ baseUrl: "http://api", fetch: send }).cards.search({
      q: "sun disc t:gear",
      fuzzy: false,
      limit: 20,
      include: "prices",
    });
    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/api/v1/cards");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "sun disc t:gear",
      fuzzy: "false",
      limit: "20",
      include: "prices",
    });
  });

  it("escapes a card handle but keeps a printing slug's segments", async () => {
    const { calls, send } = fakeFetch(() => json({ object: "oracle" }));
    const client = createRiftseerClient({ baseUrl: "http://api", fetch: send });
    await client.cards.get("sun disc");
    await client.cards.bySlug("ogn/12a/signature/sun-disc");
    await client.cards.detail({ printing: "abc" });
    expect(calls.map((call) => call.url)).toEqual([
      "http://api/api/v1/cards/sun%20disc",
      "http://api/api/v1/cards/by-slug/ogn/12a/signature/sun-disc",
      "http://api/api/v1/cards/detail?printing=abc",
    ]);
  });

  it("posts resolve requests as JSON", async () => {
    const { calls, send } = fakeFetch(() => json({ count: 0, results: [] }));
    await createRiftseerClient({ baseUrl: "http://api", fetch: send }).cards.resolve({
      requests: ["Sun Disc", "Vayne|VEN-SP3"],
    });
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      requests: ["Sun Disc", "Vayne|VEN-SP3"],
    });
  });

  it("returns the API's own error body on a non-2xx status", async () => {
    const { send } = fakeFetch(() => json({ error: "Card not found", code: "NOT_FOUND" }, 404));
    const result = await createRiftseerClient({ baseUrl: "http://api", fetch: send }).cards.get(
      "missing",
    );
    expect(result).toEqual({
      ok: false,
      status: 404,
      error: { error: "Card not found", code: "NOT_FOUND" },
    });
  });

  it("wraps a non-JSON failure body rather than throwing", async () => {
    const { send } = fakeFetch(() => new Response("upstream down", { status: 502 }));
    const result = await createRiftseerClient({
      baseUrl: "http://api",
      fetch: send,
    }).cards.random();
    expect(result).toEqual({
      ok: false,
      status: 502,
      error: { error: "upstream down", code: CLIENT_ERROR_CODES.unexpectedResponse },
    });
  });

  it("reports a transport failure as status 0", async () => {
    const send: FetchLike = async () => {
      throw new Error("getaddrinfo ENOTFOUND api");
    };
    const result = await createRiftseerClient({ baseUrl: "http://api", fetch: send }).sets.list();
    expect(result).toEqual({
      ok: false,
      status: 0,
      error: { error: "getaddrinfo ENOTFOUND api", code: CLIENT_ERROR_CODES.network },
    });
  });

  it("rejects a 2xx body that is not a JSON object", async () => {
    const { send } = fakeFetch(() => new Response("plain text", { status: 200 }));
    const result = await createRiftseerClient({ baseUrl: "http://api", fetch: send }).sets.list();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(CLIENT_ERROR_CODES.unexpectedResponse);
  });
});
