/**
 * RiftSeer API — Elysia server
 *
 * All API endpoints are under /api/v1:
 *   GET  /api/v1/health
 *   GET  /api/v1/meta
 *   GET  /api/v1/cards          ?name&set&collector&fuzzy&limit
 *   GET  /api/v1/cards/random
 *   GET  /api/v1/cards/:id
 *   GET  /api/v1/cards/:id/text
 *   POST /api/v1/resolve        body: { requests: string[] }
 *   GET  /api/v1/prices/tcgplayer
 *   GET  /api/v1/sets
 *   GET  /api/swagger           (OpenAPI UI for all versions)
 *   GET  /api/swagger/json      (raw OpenAPI schema)
 *
 * Design note:
 *   The API depends only on the CardDataProvider interface from @riftseer/core.
 *   Swap the provider by changing CARD_PROVIDER env var — no API code changes needed.
 */

import { Elysia, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import {
  createProvider,
  parseCardRequests,
  logger,
  normalizeCardName,
  type CardDataProvider,
  type Card,
} from "@riftseer/core";
// ─── TCGPlayer price cache (via tcgcsv.com) ────────────────────────────────────

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";
const TCGCSV_CATEGORY = 89; // Riftbound League of Legends Trading Card Game
const RIFTBOUND_GROUPS = [24344, 24439, 24502, 24519, 24528, 24552, 24560]; // all known groups
const TCG_PRICE_TTL_MS = 60 * 60 * 1000; // 1 hour

type TCGEntry = {
  productId: number;
  url: string;
  usdMarket: number | null;
  usdLow: number | null;
};

let tcgNameMap = new Map<string, TCGEntry>(); // key: normalizeCardName(cleanName)
let tcgDataLoadedAt = 0;
let tcgDataLoadPromise: Promise<void> | null = null;

async function loadTCGData(): Promise<void> {
  if (tcgDataLoadedAt && Date.now() - tcgDataLoadedAt < TCG_PRICE_TTL_MS) return;
  if (tcgDataLoadPromise) {
    await tcgDataLoadPromise;
    return;
  }
  tcgDataLoadPromise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const groupResults = await Promise.all(
        RIFTBOUND_GROUPS.map(async (groupId) => {
          const base = `${TCGCSV_BASE}/${TCGCSV_CATEGORY}/${groupId}`;
          const [productsRes, pricesRes] = await Promise.all([
            fetch(`${base}/products`, { signal: controller.signal }),
            fetch(`${base}/prices`, { signal: controller.signal }),
          ]);
          if (!productsRes.ok) {
            throw new Error(`TCG products ${productsRes.status} ${productsRes.statusText}`);
          }
          if (!pricesRes.ok) {
            throw new Error(`TCG prices ${pricesRes.status} ${pricesRes.statusText}`);
          }
          const products: Array<{ productId: number; cleanName: string; url: string }> =
            await productsRes.json();
          const prices: Array<{
            productId: number;
            lowPrice: number | null;
            marketPrice: number | null;
            subTypeName: string;
          }> = await pricesRes.json();
          return { products, prices };
        })
      );

      const map = new Map<string, TCGEntry>();
      for (const { products, prices } of groupResults) {
        const priceById = new Map(
          prices
            .filter((p) => p.subTypeName === "Normal")
            .map((p) => [p.productId, { usdMarket: p.marketPrice, usdLow: p.lowPrice }])
        );
        for (const product of products) {
          const price = priceById.get(product.productId);
          if (!price) continue; // sealed products won't have a Normal price entry
          map.set(normalizeCardName(product.cleanName), {
            productId: product.productId,
            url: product.url,
            ...price,
          });
        }
      }
      if (map.size > 0) {
        tcgNameMap = map;
        tcgDataLoadedAt = Date.now();
        logger.info("TCGPlayer data loaded", { count: map.size });
      }
    } catch (error) {
      logger.error("Failed to load TCG data", { error });
    } finally {
      clearTimeout(timeoutId);
      tcgDataLoadPromise = null;
    }
  })();
  await tcgDataLoadPromise;
}

// ─── Provider singleton ────────────────────────────────────────────────────────

const provider: CardDataProvider = createProvider();
await provider.warmup();
loadTCGData(); // fire-and-forget

const startTime = Date.now();

// ─── Shared schemas (referenced in route detail for OpenAPI) ──────────────────

const RelatedCardSchema = t.Object({
  object: t.Literal("related_card"),
  id: t.String({ description: "UUID of the referenced card" }),
  name: t.String(),
  component: t.String({ description: "Relationship role, e.g. 'token', 'meld_part'" }),
  uri: t.Optional(t.String({ description: "API URI for the referenced card" })),
});

const CardSchema = t.Object({
  object: t.Literal("card"),
  id: t.String({ description: "Stable UUID" }),
  name: t.String(),
  name_normalized: t.String({ description: "Lowercased, punctuation-stripped name used for search" }),
  released_at: t.Optional(t.String({ description: "ISO date string, e.g. 2024-01-15" })),
  collector_number: t.Optional(t.String()),
  external_ids: t.Optional(t.Object({
    riftcodex_id: t.Optional(t.String()),
    riftbound_id: t.Optional(t.String()),
    tcgplayer_id: t.Optional(t.String()),
  })),
  set: t.Optional(t.Object({
    set_code: t.String({ description: "Short set code, e.g. 'OGN'" }),
    set_id: t.Optional(t.String()),
    set_name: t.String({ description: "Human-readable set name, e.g. 'Origins'" }),
    set_uri: t.Optional(t.String()),
    set_search_uri: t.Optional(t.String()),
  })),
  rulings: t.Optional(t.Object({
    rulings_id: t.Optional(t.String()),
    rulings_uri: t.Optional(t.String()),
  })),
  attributes: t.Optional(t.Object({
    energy: t.Optional(t.Nullable(t.Number({ description: "Energy cost to play" }))),
    might: t.Optional(t.Nullable(t.Number({ description: "Defense-side stat" }))),
    power: t.Optional(t.Nullable(t.Number({ description: "Attack-side stat" }))),
  })),
  classification: t.Optional(t.Object({
    type: t.Optional(t.String({ description: "Card type, e.g. 'Unit', 'Gear', 'Spell'" })),
    supertype: t.Optional(t.Nullable(t.String({ description: "e.g. 'Champion'" }))),
    rarity: t.Optional(t.String({ description: "e.g. 'Common', 'Rare', 'Legendary'" })),
    tags: t.Optional(t.Array(t.String())),
    domains: t.Optional(t.Array(t.String({ description: "Domains/regions, e.g. ['Fury']" }))),
  })),
  text: t.Optional(t.Object({
    rich: t.Optional(t.String({ description: "Rules text with inline symbol tokens" })),
    plain: t.Optional(t.String({ description: "Plain-text rules text" })),
    flavour: t.Optional(t.String({ description: "Flavour/lore text" })),
  })),
  artist: t.Optional(t.String()),
  artist_id: t.Optional(t.String({ description: "UUID of the artist row" })),
  metadata: t.Optional(t.Object({
    finishes: t.Optional(t.Array(t.String({ description: "e.g. ['Normal', 'Foil']" }))),
    signature: t.Optional(t.Boolean()),
    overnumbered: t.Optional(t.Boolean()),
    alternate_art: t.Optional(t.Boolean()),
  })),
  media: t.Optional(t.Object({
    orientation: t.Optional(t.String({ description: "'portrait' or 'landscape'" })),
    accessibility_text: t.Optional(t.String()),
    media_urls: t.Optional(t.Object({
      small: t.Optional(t.String()),
      normal: t.Optional(t.String()),
      large: t.Optional(t.String()),
      png: t.Optional(t.String()),
    })),
  })),
  purchase_uris: t.Optional(t.Object({
    cardmarket: t.Optional(t.String()),
    tcgplayer: t.Optional(t.String()),
  })),
  prices: t.Optional(t.Object({
    usd: t.Optional(t.Nullable(t.Number())),
    usd_foil: t.Optional(t.Nullable(t.Number())),
    eur: t.Optional(t.Nullable(t.Number())),
    eur_foil: t.Optional(t.Nullable(t.Number())),
  })),
  is_token: t.Boolean(),
  all_parts: t.Array(RelatedCardSchema, { description: "Related token/part cards" }),
  used_by: t.Array(RelatedCardSchema, { description: "Cards that create or reference this card (tokens only)" }),
  related_champions: t.Array(RelatedCardSchema, { description: "Champion cards linked to this legend by a shared tag" }),
  related_legends: t.Array(RelatedCardSchema, { description: "Legend cards linked to this champion by a shared tag" }),
  updated_at: t.Optional(t.String({ description: "ISO datetime of last update" })),
  ingested_at: t.Optional(t.String({ description: "ISO datetime of last ingest" })),
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

/** Scryfall-style copyable text: name, type line, then rules text. */
function cardCopyableText(card: Card): string {
  const lines: string[] = [card.name];
  const typePart = [card.classification?.type, card.classification?.supertype]
    .filter(Boolean)
    .join(" — ");
  if (typePart) lines.push(typePart);
  if (card.text?.plain?.trim()) {
    if (lines.length > 1) lines.push("");
    lines.push(card.text.plain.trim());
  }
  return lines.join("\n");
}

// ─── V1 routes ────────────────────────────────────────────────────────────────

const v1 = new Elysia({ prefix: "/api/v1" })
  // ── Health ─────────────────────────────────────────────────────────────────
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
    },
  )

  // ── Meta ───────────────────────────────────────────────────────────────────
  .get(
    "/meta",
    () => {
      const { lastRefresh, cardCount } = provider.getStats();
      const cacheAgeSeconds = lastRefresh
        ? Math.floor(Date.now() / 1000 - lastRefresh)
        : null;

      return {
        provider: provider.sourceName,
        cardCount,
        lastRefresh: lastRefresh
          ? new Date(lastRefresh * 1000).toISOString()
          : null,
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
        description:
          "Returns provider name, cache age, last refresh time, and card count.",
      },
    },
  )

  // ── GET /cards/random ───────────────────────────────────────────────────────
  .get(
    "/cards/random",
    async ({ set }) => {
      const card = await provider.getRandomCard();
      if (!card) {
        set.status = 404;
        return { error: "No cards available", code: "NOT_FOUND" };
      }
      return card;
    },
    {
      response: {
        200: CardSchema,
        404: ErrorSchema,
      },
      detail: {
        tags: ["Cards"],
        summary: "Get a random card",
        description: "Returns a single random card from the index.",
      },
    },
  )

  // ── GET /cards/:id ──────────────────────────────────────────────────────────
  .get(
    "/cards/:id",
    async ({ params, set }) => {
      const card = await provider.getCardById(params.id);
      if (!card) {
        set.status = 404;
        return { error: "Card not found", code: "NOT_FOUND" };
      }
      return card;
    },
    {
      params: t.Object({ id: t.String({ description: "Card UUID" }) }),
      response: {
        200: CardSchema,
        404: ErrorSchema,
      },
      detail: {
        tags: ["Cards"],
        summary: "Get card by ID",
        description: "Returns a single card by its stable UUID.",
      },
    },
  )

  // ── GET /cards/:id/text ─────────────────────────────────────────────────────
  .get(
    "/cards/:id/text",
    async ({ params }) => {
      const card = await provider.getCardById(params.id);
      if (!card) {
        return new Response(
          JSON.stringify({ error: "Card not found", code: "NOT_FOUND" }),
          { status: 404, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(cardCopyableText(card), {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    },
    {
      params: t.Object({ id: t.String({ description: "Card UUID" }) }),
      response: {
        200: t.String({ description: "Copy-pasteable plain-text card summary (text/plain; charset=utf-8)" }),
        404: ErrorSchema,
      },
      detail: {
        tags: ["Cards"],
        summary: "Get card as plain text",
        description: "Returns copy-pasteable text (name, type line, rules).",
      },
    },
  )

  // ── GET /cards ──────────────────────────────────────────────────────────────
  .get(
    "/cards",
    async ({ query, set }) => {
      const parsedLimit = parseInt(query.limit ?? "", 10);
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;

      // Browse set: GET /cards?set=OGN — return all cards in set, ordered by collector number
      if (query.set && !query.name?.trim()) {
        const cards = await provider.getCardsBySet(query.set, {
          limit: limit ?? 2000,
        });
        return {
          count: cards.length,
          cards,
        };
      }

      if (!query.name?.trim()) {
        set.status = 400;
        return {
          error:
            "Query parameter `name` is required (or use `set` alone to list cards in a set)",
          code: "MISSING_PARAM",
        };
      }

      const cards = await provider.searchByName(query.name, {
        set: query.set,
        collector: query.collector,
        fuzzy: query.fuzzy === "1" || query.fuzzy === "true",
        limit: limit ?? 10,
      });

      return {
        count: cards.length,
        cards,
      };
    },
    {
      query: t.Object({
        name: t.Optional(
          t.String({ description: "Card name to search for" }),
        ),
        set: t.Optional(
          t.String({ description: "Set code filter, e.g. OGN" }),
        ),
        collector: t.Optional(
          t.String({ description: "Collector number filter" }),
        ),
        fuzzy: t.Optional(
          t.String({
            description: "Set to '1' or 'true' to enable fuzzy matching",
          }),
        ),
        limit: t.Optional(
          t.String({ description: "Max results (default 10)" }),
        ),
      }),
      response: {
        200: t.Object({
          count: t.Number(),
          cards: t.Array(CardSchema),
        }),
        400: ErrorSchema,
      },
      detail: {
        tags: ["Cards"],
        summary: "Search cards by name",
        description:
          "Search for cards by name with optional set/collector filters. " +
          "Supports fuzzy matching for typo tolerance.",
      },
    },
  )

  // ── POST /resolve ───────────────────────────────────────────────────────────
  .post(
    "/resolve",
    async ({ body, set }) => {
      if (body.requests.length > 20) {
        set.status = 400;
        return { error: "Too many requests: maximum is 20", code: "TOO_MANY_REQUESTS" };
      }
      const requests = body.requests.map((r: string) => {
        const parsed = parseCardRequests(`[[${r}]]`);
        return parsed[0] ?? { raw: r, name: r };
      });

      const results = await Promise.all(
        requests.map((req) => provider.resolveRequest(req)),
      );

      return {
        count: results.length,
        results,
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
      response: {
        200: t.Object({
          count: t.Number(),
          results: t.Array(ResolvedCardSchema),
        }),
        400: ErrorSchema,
      },
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
    },
  )

  // ── GET /prices/tcgplayer ───────────────────────────────────────────────────
  .get(
    "/prices/tcgplayer",
    async ({ query, set }) => {
      if (!query.name?.trim()) {
        set.status = 400;
        return { error: "Query parameter `name` is required", code: "MISSING_PARAM" };
      }
      await loadTCGData();
      const entry = tcgNameMap.get(normalizeCardName(query.name.trim()));
      return {
        usdMarket: entry?.usdMarket ?? null,
        usdLow: entry?.usdLow ?? null,
        url: entry?.url ?? null,
      };
    },
    {
      query: t.Object({
        name: t.String({ description: "Card name to look up on TCGPlayer" }),
      }),
      response: {
        200: t.Object({
          usdMarket: t.Nullable(t.Number()),
          usdLow: t.Nullable(t.Number()),
          url: t.Nullable(t.String()),
        }),
        400: ErrorSchema,
      },
      detail: {
        tags: ["Cards"],
        summary: "TCGPlayer USD price",
        description:
          "Returns market/low USD prices and direct product URL for a card by name. Data from tcgcsv.com, cached for 1 hour.",
      },
    },
  )

  // ── GET /sets ───────────────────────────────────────────────────────────────
  .get(
    "/sets",
    async () => {
      const sets = await provider.getSets();
      return { count: sets.length, sets };
    },
    {
      response: t.Object({
        count: t.Number(),
        sets: t.Array(
          t.Object({
            setCode: t.String(),
            setName: t.String(),
            cardCount: t.Number(),
          }),
        ),
      }),
      detail: {
        tags: ["Cards"],
        summary: "List all sets",
        description: "Returns all known card sets with card counts.",
      },
    },
  )

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Elysia()
  .use(
    cors({
      origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(",")
        : true,
      methods: ["GET", "POST", "OPTIONS"],
    }),
  )
  .use(v1)
  .use(
    swagger({
      path: "/api/swagger",
      specPath: "/api/swagger/json",
      scalarConfig: {
        spec: {
          url: "/api/swagger/json",
        },
      },
      documentation: {
        info: {
          title: "RiftSeer API",
          version: "0.1.0",
          description:
            "Riftbound card data API. Data from Supabase (populated by the ingest pipeline). " +
            "All versioned routes (e.g. /api/v1/*) are documented here.",
        },
        servers: [
          {
            url: process.env.BASE_URL ?? process.env.SWAGGER_BASE_URL ?? "/",
          },
        ],
        tags: [
          { name: "Meta", description: "Server health and metadata" },
          { name: "Cards", description: "Card lookup and search" },
        ],
      },
    }),
  )
  .listen(parseInt(process.env.PORT ?? process.env.API_PORT ?? "3000", 10));

const port = process.env.PORT ?? process.env.API_PORT ?? "3000";
logger.info("RiftSeer API started", {
  port,
  provider: provider.sourceName,
  swagger: `http://localhost:${port}/api/swagger`,
});

export type App = typeof app;
