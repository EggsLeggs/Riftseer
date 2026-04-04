/**
 * API route tests — uses Elysia's .handle() to test routes without a live server.
 * The provider is replaced with an in-memory stub so no real DB or network
 * calls happen.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { Elysia, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import type { CardDataProvider } from "@riftseer/core";
import { StubProvider } from "../stub_card_provider";

// ─── Replicate the app inline with stub provider ──────────────────────────────
// We inline a minimal copy of the app wiring so the test doesn't need to
// import the real index.ts (which calls provider.warmup() at module level).

import { metaRoutes } from "../../routes/meta";

function buildTestApp(provider: CardDataProvider) {
  const startTime = Date.now();

  return new Elysia({prefix: "/api/v1"}).use(metaRoutes(provider, startTime)).use(swagger());
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("API routes", () => {
  let app: ReturnType<typeof buildTestApp>;

  beforeAll(() => {
    app = buildTestApp(new StubProvider());
  });

    // ── /health ────────────────────────────────────────────────────────────────

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const res = await app.handle(new Request("http://localhost/api/v1/health"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(typeof body.uptimeMs).toBe("number");
    });
  });

  // ── /meta ──────────────────────────────────────────────────────────────────

  describe("GET /meta", () => {
    it("returns provider name", async () => {
      const res = await app.handle(new Request("http://localhost/api/v1/meta"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.provider).toBe("stub");
    });
  });

});
