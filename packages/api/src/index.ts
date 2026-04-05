/**
 * Riftseer API — Elysia server
 *
 * All API endpoints are under /api/v1:
 *   GET  /api/v1/health
 *   GET  /api/v1/meta
 *   GET  /api/v1/cards          ?name&set&collector&fuzzy&limit
 *   GET  /api/v1/cards/random
 *   GET  /api/v1/cards/:id
 *   GET  /api/v1/cards/:id/text
 *   POST /api/v1/cards/resolve  body: { requests: string[] }
 *   GET  /api/v1/prices/tcgplayer
 *   GET  /api/v1/sets
 *   GET  /api/v1/decks/u/:shortForm
 *   POST /api/v1/decks/u/:shortForm
 *   POST /api/v1/decks/u
 *   GET  /api/swagger           (OpenAPI UI for all versions)
 *   GET  /api/swagger/json      (raw OpenAPI schema)
 *
 * Design note:
 *   The API depends only on the CardDataProvider interface from @riftseer/core.
 *   Swap the provider by changing CARD_PROVIDER env var — no API code changes needed.
 */

import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { cors } from "@elysiajs/cors";
import {
  createProvider,
  logger,
  DeckSerializerV1,
  NotFoundError,
  SimplifiedDeckProviderImpl,
} from "@riftseer/core";
import { loadTCGData } from "./services/tcgplayer";
import { metaRoutes } from "./routes/meta";
import { cardsRoutes } from "./routes/cards";
import { setsRoutes } from "./routes/sets";
import { decksRoutes } from "./routes/decks";

// ─── Singletons ───────────────────────────────────────────────────────────────

const cardProvider = createProvider();
await cardProvider.warmup();
void loadTCGData().catch(() => {}); // fire-and-forget; errors logged in loadTCGData

const startTime = Date.now();

const deckProvider = new SimplifiedDeckProviderImpl(
  new DeckSerializerV1(),
  async (id: string) => {
    const card = await cardProvider.getCardById(id);
    if (!card) throw new NotFoundError(`Card not found: ${id}`);
    return card;
  },
);

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
  .use(
    new Elysia({ prefix: "/api/v1" })
      .use(metaRoutes(cardProvider, startTime))
      .use(cardsRoutes(cardProvider))
      .use(setsRoutes(cardProvider))
      .use(decksRoutes(deckProvider)),
  )
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
          title: "Riftseer API",
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
          { name: "Sets", description: "Card set listing" },
          { name: "Decks", description: "Deck building and sharing" },
        ],
      },
    }),
  )
  .listen(parseInt(process.env.PORT ?? process.env.API_PORT ?? "3000", 10));

const port = process.env.PORT ?? process.env.API_PORT ?? "3000";
logger.info("Riftseer API started", {
  port,
  provider: cardProvider.sourceName,
  swagger: `http://localhost:${port}/api/swagger`,
});

export type App = typeof app;
