/**
 * RiftSeer API — Elysia server
 *
 * Endpoints:
 *   GET  /health
 *   GET  /meta
 *   GET  /cards          ?name&set&collector&fuzzy&limit
 *   GET  /cards/:id
 *   POST /resolve        body: { requests: string[] }
 *   GET  /swagger        (auto-generated OpenAPI UI)
 *   GET  /swagger/json   (raw OpenAPI schema)
 *
 * Design note:
 *   The API depends only on the CardDataProvider interface from @riftseer/core.
 *   Swap the provider by changing CARD_PROVIDER env var — no API code changes needed.
 */

import { Elysia, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import {
  createProvider,
  parseCardRequests,
  logger,
  getCacheMeta,
  type CardDataProvider,
  type Card,
  type ResolvedCard,
  RiftCodexProvider,
} from "@riftseer/core";

// ─── Provider singleton ────────────────────────────────────────────────────────

const provider: CardDataProvider = createProvider();
await provider.warmup();

const startTime = Date.now();

// ─── Shared schemas (referenced in route detail for OpenAPI) ──────────────────

const CardSchema = t.Object({
  id: t.String({ description: "Stable unique identifier" }),
  name: t.String(),
  normalizedName: t.String(),
  setCode: t.Optional(t.String()),
  setName: t.Optional(t.String()),
  collectorNumber: t.Optional(t.String()),
  imageUrl: t.Optional(t.String()),
  text: t.Optional(t.String()),
  cost: t.Optional(t.Number()),
  typeLine: t.Optional(t.String()),
  supertype: t.Optional(t.Nullable(t.String())),
  rarity: t.Optional(t.String()),
  domains: t.Optional(t.Array(t.String())),
  might: t.Optional(t.Nullable(t.Number())),
  power: t.Optional(t.Nullable(t.Number())),
  tags: t.Optional(t.Array(t.String())),
});

const CardRequestSchema = t.Object({
  raw: t.String(),
  name: t.String(),
  set: t.Optional(t.String()),
  collector: t.Optional(t.String()),
});

const ResolvedCardSchema = t.Object({
  request: CardRequestSchema,
  card: t.Nullable(CardSchema),
  matchType: t.Union([
    t.Literal("exact"),
    t.Literal("fuzzy"),
    t.Literal("not-found"),
  ]),
  score: t.Optional(t.Number()),
});

const ErrorSchema = t.Object({
  error: t.String(),
  code: t.String(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strip the `raw` field before sending cards to clients. */
function sanitiseCard(card: Card): Omit<Card, "raw"> {
  const { raw: _raw, ...rest } = card;
  return rest;
}

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Elysia()
  // ── OpenAPI / Swagger ─────────────────────────────────────────────────────
  .use(
    swagger({
      path: "/swagger",
      documentation: {
        info: {
          title: "RiftSeer API",
          version: "0.1.0",
          description:
            "Riftbound card data API. Backed by RiftCodex (swappable via provider module). " +
            "Swap to Riot's official API by setting `CARD_PROVIDER=riot` once implemented.",
        },
        tags: [
          { name: "Meta", description: "Server health and metadata" },
          { name: "Cards", description: "Card lookup and search" },
        ],
      },
    })
  )

  // ── Health ────────────────────────────────────────────────────────────────
  .get(
    "/health",
    () => ({ status: "ok", uptimeMs: Date.now() - startTime }),
    {
      response: t.Object({ status: t.String(), uptimeMs: t.Number() }),
      detail: {
        tags: ["Meta"],
        summary: "Health check",
        description: "Returns 200 if the server is running.",
      },
    }
  )

  // ── Meta ──────────────────────────────────────────────────────────────────
  .get(
    "/meta",
    () => {
      const { lastRefresh, cardCount } = getCacheMeta(provider.sourceName);
      const cacheAgeSeconds = lastRefresh
        ? Math.floor((Date.now() / 1000) - lastRefresh)
        : null;

      return {
        provider: provider.sourceName,
        cardCount,
        lastRefresh: lastRefresh ? new Date(lastRefresh * 1000).toISOString() : null,
        cacheAgeSeconds,
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      };
    },
    {
      response: t.Object({
        provider: t.String(),
        cardCount: t.Number(),
        lastRefresh: t.Nullable(t.String()),
        cacheAgeSeconds: t.Nullable(t.Number()),
        uptimeSeconds: t.Number(),
      }),
      detail: {
        tags: ["Meta"],
        summary: "Provider metadata",
        description: "Returns provider name, cache age, last refresh time, and card count.",
      },
    }
  )

  // ── GET /cards/:id ────────────────────────────────────────────────────────
  .get(
    "/cards/:id",
    async ({ params, set }) => {
      const card = await provider.getCardById(params.id);
      if (!card) {
        set.status = 404;
        return { error: "Card not found", code: "NOT_FOUND" };
      }
      return sanitiseCard(card);
    },
    {
      params: t.Object({ id: t.String({ description: "Card UUID" }) }),
      detail: {
        tags: ["Cards"],
        summary: "Get card by ID",
        description: "Returns a single card by its stable UUID.",
        responses: {
          "200": { description: "Card found" },
          "404": { description: "Card not found" },
        },
      },
    }
  )

  // ── GET /cards ────────────────────────────────────────────────────────────
  .get(
    "/cards",
    async ({ query, set }) => {
      if (!query.name) {
        set.status = 400;
        return { error: "Query parameter `name` is required", code: "MISSING_PARAM" };
      }

      const cards = await provider.searchByName(query.name, {
        set: query.set,
        collector: query.collector,
        fuzzy: query.fuzzy === "1" || query.fuzzy === "true",
        limit: query.limit ? parseInt(query.limit, 10) : 10,
      });

      return {
        count: cards.length,
        cards: cards.map(sanitiseCard),
      };
    },
    {
      query: t.Object({
        name: t.Optional(t.String({ description: "Card name to search for" })),
        set: t.Optional(t.String({ description: "Set code filter, e.g. OGN" })),
        collector: t.Optional(t.String({ description: "Collector number filter" })),
        fuzzy: t.Optional(
          t.String({ description: "Set to '1' or 'true' to enable fuzzy matching" })
        ),
        limit: t.Optional(t.String({ description: "Max results (default 10)" })),
      }),
      detail: {
        tags: ["Cards"],
        summary: "Search cards by name",
        description:
          "Search for cards by name with optional set/collector filters. " +
          "Supports fuzzy matching for typo tolerance.",
      },
    }
  )

  // ── POST /resolve ─────────────────────────────────────────────────────────
  .post(
    "/resolve",
    async ({ body }) => {
      // Accept either raw strings "[[Sun Disc|OGN]]" or structured requests
      const requests = body.requests.slice(0, 20).map((r: string) => {
        const parsed = parseCardRequests(`[[${r}]]`);
        return parsed[0] ?? { raw: r, name: r };
      });

      const results = await Promise.all(
        requests.map((req) => provider.resolveRequest(req))
      );

      return {
        count: results.length,
        results: results.map((r) => ({
          ...r,
          card: r.card ? sanitiseCard(r.card) : null,
        })),
      };
    },
    {
      body: t.Object({
        requests: t.Array(t.String(), {
          description:
            "Array of card name strings (plain name OR [[Name|SET]] format, up to 20).",
          maxItems: 20,
        }),
      }),
      response: t.Object({
        count: t.Number(),
        results: t.Array(ResolvedCardSchema),
      }),
      detail: {
        tags: ["Cards"],
        summary: "Batch resolve card requests",
        description:
          "Resolve up to 20 card name strings to their best matching cards. " +
          "Accepts plain names or [[Name|SET-123]] format. " +
          "Used by the Reddit bot and can be used by the frontend for batch lookups.",
        requestBody: {
          content: {
            "application/json": {
              example: {
                requests: ["Sun Disc", "Stalwart Poro", "NonExistentCard"],
              },
            },
          },
        },
      },
    }
  )

  .listen(parseInt(process.env.API_PORT ?? "3000", 10));

logger.info("RiftSeer API started", {
  port: process.env.API_PORT ?? "3000",
  provider: provider.sourceName,
  swagger: `http://localhost:${process.env.API_PORT ?? "3000"}/swagger`,
});

export type App = typeof app;
