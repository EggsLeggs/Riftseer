/**
 * Riftseer API — Elysia Cloudflare Worker
 *
 * All API endpoints are under /api/v1:
 *   GET  /api/v1/health
 *   GET  /api/v1/meta
 *   GET  /api/v1/cards          ?name&set&collector&fuzzy&limit
 *   GET  /api/v1/cards/random
 *   GET  /api/v1/cards/:id
 *   GET  /api/v1/cards/:id/text
 *   POST /api/v1/cards/resolve  body: { requests: string[] }
 *   GET  /api/v1/sets
 *   GET  /api/v1/decks/u/:shortForm
 *   POST /api/v1/decks/u/:shortForm
 *   POST /api/v1/decks/u
 *
 * Deploy: wrangler deploy
 * Dev:    wrangler dev
 * Secrets (wrangler secret put): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

import { Elysia } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { cors } from "@elysiajs/cors";
import {
  createProvider,
  DeckSerializerV1,
  NotFoundError,
  SimplifiedDeckProviderImpl,
} from "@riftseer/core";
import { metaRoutes } from "./routes/meta";
import { cardsRoutes } from "./routes/cards";
import { setsRoutes } from "./routes/sets";
import { decksRoutes } from "./routes/decks";

// ─── Singletons ───────────────────────────────────────────────────────────────
// CF Workers forbid async I/O (fetch) in global scope — only inside handlers.
// Warmup is deferred to the first request via onBeforeHandle.

const cardProvider = createProvider();
const startTime = Date.now();

const deckProvider = new SimplifiedDeckProviderImpl(
  new DeckSerializerV1(),
  async (id: string) => {
    const card = await cardProvider.getCardById(id);
    if (!card) throw new NotFoundError(`Card not found: ${id}`);
    return card;
  },
);

// Lazy warmup — runs once per isolate on the first request. Retries on failure.
let warmupPromise: Promise<void> | null = null;
function ensureWarmedUp(): Promise<void> {
  if (!warmupPromise) {
    warmupPromise = cardProvider.warmup().catch((err) => {
      console.error("[riftseer-api] Provider warmup failed:", err);
      warmupPromise = null; // allow retry on next request
    });
  }
  return warmupPromise;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export const app = new Elysia({ adapter: CloudflareAdapter })
  .onBeforeHandle(async () => {
    await ensureWarmedUp();
  })
  .use(
    cors({
      origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter((o) => o.length > 0)
        : ["https://riftseer.pages.dev", "https://riftseer.com"],
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
  .compile();

export type App = typeof app;
export default app;
