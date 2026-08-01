import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { CardDataProvider } from "@riftseer/core";
import { Elysia } from "elysia";
import { cardsRoutes } from "../../routes/cards.ts";
import {
  STUB_ALT_PRINTING_ID,
  STUB_ORACLE_ID,
  STUB_PRINTING_ID,
  STUB_TOKEN_ID,
  StubProvider,
} from "../stub_card_provider.ts";

const previousOrigin = process.env.SITE_ORIGIN;
function buildApp(provider: CardDataProvider = new StubProvider()) {
  return new Elysia({ prefix: "/api/v1" }).use(cardsRoutes(provider));
}

let app: ReturnType<typeof buildApp>;
beforeAll(() => {
  process.env.SITE_ORIGIN = "https://riftseer.com";
  app = buildApp();
});
afterAll(() => {
  if (previousOrigin === undefined) delete process.env.SITE_ORIGIN;
  else process.env.SITE_ORIGIN = previousOrigin;
});

async function get(path: string) {
  const response = await app.handle(new Request(`http://localhost${path}`));
  const text = await response.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch {}
  return { response, body: body as any };
}

async function post(path: string, body: unknown) {
  const response = await app.handle(new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { response, body: await response.json() as any };
}

describe("card routes", () => {
  it("returns an oracle by UUID and preserves might_bonus: 0", async () => {
    const { response, body } = await get(`/api/v1/cards/${STUB_ORACLE_ID}`);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ object: "oracle", id: STUB_ORACLE_ID, name: "Sun Disc" });
    const zeroProvider = new StubProvider();
    zeroProvider.getOracleById = async () => ({
      ...(await new StubProvider().getOracleById(STUB_ORACLE_ID))!,
      might_bonus: 0,
    });
    const zero = await buildApp(zeroProvider).handle(new Request(`http://localhost/api/v1/cards/${STUB_ORACLE_ID}`));
    expect((await zero.json() as any).might_bonus).toBe(0);
  });

  it("accepts an oracle key as the card handle", async () => {
    const { response, body } = await get("/api/v1/cards/sun%20disc");
    expect(response.status).toBe(200);
    expect(body.id).toBe(STUB_ORACLE_ID);
  });

  it("returns a structured 404 for an unknown oracle", async () => {
    const { response, body } = await get("/api/v1/cards/missing");
    expect(response.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("resolves an oracle slug", async () => {
    const { response, body } = await get("/api/v1/cards/by-slug/sun-disc");
    expect(response.status).toBe(200);
    expect(body.preferred_printing.id).toBe(STUB_PRINTING_ID);
  });

  it("resolves a printing slug and views the oracle through that printing", async () => {
    const { response, body } = await get("/api/v1/cards/by-slug/ogn/22a/sun-disc");
    expect(response.status).toBe(200);
    expect(body.preferred_printing.id).toBe(STUB_ALT_PRINTING_ID);
  });

  it("rejects malformed or unknown slug paths", async () => {
    expect((await get("/api/v1/cards/by-slug/%E0%A4%A")).response.status).toBe(400);
    expect((await get("/api/v1/cards/by-slug/no/such/card")).response.status).toBe(404);
  });

  it("returns one physical printing by id", async () => {
    const { response, body } = await get(`/api/v1/printings/${STUB_ALT_PRINTING_ID}`);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ object: "printing", oracle_id: STUB_ORACLE_ID, rarity: "Uncommon" });
    expect(body.riftseer_uri).toBe("https://riftseer.com/card/ogn/22a/sun-disc");
  });

  it("404s an unknown printing", async () => {
    expect((await get("/api/v1/printings/ffffffffffffffffffffffff")).response.status).toBe(404);
  });

  it("builds detail from an oracle id and its preferred printing", async () => {
    const { response, body } = await get(`/api/v1/cards/detail?oracle=${STUB_ORACLE_ID}`);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ object: "oracle_detail", printing: { id: STUB_PRINTING_ID } });
    expect(body.printings.map((printing: any) => printing.id)).toEqual([
      STUB_PRINTING_ID,
      STUB_ALT_PRINTING_ID,
    ]);
    expect(body.tokens[0].id).toBe(STUB_TOKEN_ID);
  });

  it("builds detail from a printing id and marks that printing current", async () => {
    const { response, body } = await get(`/api/v1/cards/detail?printing=${STUB_ALT_PRINTING_ID}`);
    expect(response.status).toBe(200);
    expect(body.oracle.id).toBe(STUB_ORACLE_ID);
    expect(body.printing.id).toBe(STUB_ALT_PRINTING_ID);
  });

  it("accepts either oracle or printing slugs in detail", async () => {
    expect((await get("/api/v1/cards/detail?slug=sun-disc")).body.printing.id).toBe(STUB_PRINTING_ID);
    expect((await get("/api/v1/cards/detail?slug=ogn/22a/sun-disc")).body.printing.id).toBe(STUB_ALT_PRINTING_ID);
  });

  it("requires exactly one detail selector", async () => {
    expect((await get("/api/v1/cards/detail")).response.status).toBe(400);
    expect((await get(`/api/v1/cards/detail?oracle=${STUB_ORACLE_ID}&printing=${STUB_PRINTING_ID}`)).response.status).toBe(400);
  });

  it("strips prices by default and includes them only on request", async () => {
    const plain = (await get(`/api/v1/cards/detail?oracle=${STUB_ORACLE_ID}`)).body;
    const priced = (await get(`/api/v1/cards/detail?oracle=${STUB_ORACLE_ID}&include=prices`)).body;
    expect(plain.printing.prices).toBeUndefined();
    expect(priced.printing.prices.tcgplayer.normal).toBe(1.25);
  });

  it("returns oracle-shaped search results by default", async () => {
    const { response, body } = await get("/api/v1/cards?q=sun%20disc");
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ unique: "oracle", count: 3, total: 3, printings: [] });
    expect(body.cards.every((card: any) => card.object === "oracle")).toBe(true);
  });

  it("returns printing-shaped results plus distinct owners on request", async () => {
    const { body } = await get("/api/v1/cards?unique=prints&q=!%22Sun%20Disc%22");
    expect(body.unique).toBe("prints");
    expect(body.printings.map((printing: any) => printing.id)).toEqual([
      STUB_PRINTING_ID,
      STUB_ALT_PRINTING_ID,
    ]);
    expect(body.cards.map((card: any) => card.id)).toEqual([STUB_ORACLE_ID]);
  });

  it("merges URL filters with q/name grammar", async () => {
    const byAlias = (await get("/api/v1/cards?q=sun&type=Gear")).body;
    const excluded = (await get("/api/v1/cards?name=sun&type=Legend")).body;
    expect(byAlias.cards.map((card: any) => card.id)).toContain(STUB_ORACLE_ID);
    expect(excluded.cards).toEqual([]);
  });

  it("supports all-card browsing with pagination", async () => {
    const { body } = await get("/api/v1/cards?browse=all&limit=2&offset=1");
    expect(body).toMatchObject({ unique: "oracle", count: 2, total: 4, limit: 2, offset: 1 });
  });

  it("makes a set browse printing-shaped", async () => {
    const { body } = await get("/api/v1/cards?set=OGN&limit=2");
    expect(body).toMatchObject({ unique: "prints", count: 2, cards: [] });
  });

  it("rejects missing, malformed, and excessively deep searches", async () => {
    expect((await get("/api/v1/cards")).response.status).toBe(400);
    expect((await get("/api/v1/cards?q=t%3A(")).response.status).toBe(400);
    expect((await get("/api/v1/cards?q=sun&offset=10001")).body.code).toBe("OFFSET_TOO_LARGE");
  });

  it("returns a random oracle and copyable plain text", async () => {
    expect((await get("/api/v1/cards/random")).body.id).toBe(STUB_ORACLE_ID);
    const text = await get(`/api/v1/cards/${STUB_ORACLE_ID}/text`);
    expect(text.response.headers.get("content-type")).toContain("text/plain");
    expect(text.body).toContain("Sun Disc\nGear");
  });

  it("resolves exact, scoped-printing, and missing requests in one batch", async () => {
    const { response, body } = await post("/api/v1/cards/resolve", {
      requests: ["Sun Disc", "Sun Disc|OGN-22", "Missing"],
    });
    expect(response.status).toBe(200);
    expect(body.results[0]).toMatchObject({ matchType: "exact", oracle: { id: STUB_ORACLE_ID }, printing: { id: STUB_PRINTING_ID } });
    expect(body.results[1].printing.id).toBe(STUB_ALT_PRINTING_ID);
    expect(body.results[2]).toMatchObject({ matchType: "not-found", oracle: null, printing: null });
  });

  it("caps resolve batches at twenty", async () => {
    const { response, body } = await post("/api/v1/cards/resolve", { requests: Array(21).fill("Sun Disc") });
    expect(response.status).toBe(400);
    expect(body.code).toBe("TOO_MANY_REQUESTS");
  });
});
