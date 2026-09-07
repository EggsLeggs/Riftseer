import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { setsRoutes } from "../../routes/sets";
import { StubProvider } from "../stub_card_provider";

const provider = new StubProvider();
const app = new Elysia({ prefix: "/api/v1" }).use(setsRoutes(provider));

describe("GET /sets", () => {
  it("lists every set the provider knows with a count", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/sets"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      count: 1,
      sets: [
        {
          setCode: "OGN",
          setName: "Origins",
          cardCount: expect.any(Number),
          isPromo: false,
          publishedOn: "2025-01-01",
        },
      ],
    });
  });

  it("carries exactly the documented fields", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/sets"));
    const body = (await res.json()) as { sets: Array<Record<string, unknown>> };
    expect(Object.keys(body.sets[0]).sort()).toEqual(
      ["cardCount", "isPromo", "publishedOn", "setCode", "setName"].sort(),
    );
  });

  it("needs no account and no query", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/sets?anything=ignored", { method: "GET" }),
    );
    expect(res.status).toBe(200);
  });
});
