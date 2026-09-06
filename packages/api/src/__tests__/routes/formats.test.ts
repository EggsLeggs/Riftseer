import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { formatsRoutes } from "../../routes/formats";
import { STUB_FORMAT, StubProvider } from "../stub_card_provider";

const app = new Elysia({ prefix: "/api/v1" }).use(
  formatsRoutes(new StubProvider()),
);

describe("GET /formats", () => {
  it("returns the active formats in display order", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/formats"),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      count: 1,
      formats: [STUB_FORMAT],
    });
  });

  it("omits retired formats — those are admin-only", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/formats"),
    );
    const body = (await res.json()) as { formats: Array<{ active: boolean }> };

    expect(body.formats.every((format) => format.active)).toBe(true);
  });
});
