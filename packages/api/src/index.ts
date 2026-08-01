/**
 * Riftseer API — Elysia Cloudflare Worker
 *
 * All API endpoints are under /api/v1:
 *   GET  /api/v1/health
 *   GET  /api/v1/meta
 *   GET  /api/v1/cards          ?q&set&collector&fuzzy&unique&limit&offset
 *   GET  /api/v1/cards/random
 *   GET  /api/v1/cards/detail   ?oracle | ?printing | ?slug
 *   GET  /api/v1/cards/:id      — one oracle
 *   GET  /api/v1/cards/:id/text
 *   GET  /api/v1/cards/by-slug/* — oracle or printing slug
 *   GET  /api/v1/printings/:id  — one printing
 *   POST /api/v1/cards/resolve  body: { requests: string[] }
 *   GET  /api/v1/sets
 *   GET  /api/v1/formats
 *   GET  /api/v1/decks/u/:shortForm
 *   POST /api/v1/decks/u/:shortForm
 *   POST /api/v1/decks/u
 *   POST /api/v1/auth/register  body: { email, password }
 *   POST /api/v1/auth/login     body: { email, password }
 *   POST /api/v1/auth/refresh   body: { refresh_token }
 *   POST /api/v1/auth/logout    Authorization: Bearer <access_token>
 *   GET  /api/v1/auth/me        Authorization: Bearer <access_token>  (protected)
 *   *    /api/v1/admin/*        Authorization: Bearer <admin access_token>
 *   GET  /api/v1/auth/metafy/status        (protected)
 *   GET  /api/v1/auth/metafy/connect       (protected)
 *   POST /api/v1/auth/metafy/callback      (protected)
 *   DELETE /api/v1/auth/metafy/disconnect  (protected)
 *   POST /api/v1/auth/metafy/refresh-status (protected)
 *   POST /api/v1/webhooks/metafy           (public — HMAC signature verified)
 *
 * Deploy: wrangler deploy
 * Dev:    wrangler dev
 * Secrets (wrangler secret put): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   SUPABASE_ANON_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 * Vars (wrangler.jsonc → vars): SITE_ORIGIN — public site origin used to build
 *   absolute riftseer_uri values on card responses.
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
import { formatsRoutes } from "./routes/formats";
import { decksRoutes } from "./routes/decks";
import { authRoutes } from "./routes/auth";
import { usersRoutes } from "./routes/users";
import { metafyRoutes } from "./routes/metafy";
import {
  adminRoutes,
  type AdminImageBindings,
} from "./routes/admin";
import { handleMetafyWebhook } from "./lib/metafy";
import { withExecutionContext, type WaitUntilContext } from "./lib/background";

// ─── Singletons ───────────────────────────────────────────────────────────────
// CF Workers forbid async I/O (fetch) in global scope — only inside handlers.
// Warmup is deferred to the first request via onBeforeHandle.

const cardProvider = createProvider();
const startTime = Date.now();

/**
 * The slice of the Worker env this module touches, declared structurally.
 *
 * Every workspace package that imports the `App` type (web, frontend) also
 * type-checks this file, and those programs have neither
 * `@cloudflare/workers-types` nor the generated `GeneratedEnv`. Importing
 * `cloudflare:workers` or naming `GeneratedEnv` here breaks their builds, so
 * the bindings are captured from the fetch handler instead.
 */
interface CardImageEnv {
  CARD_IMAGES: AdminImageBindings["bucket"];
  CARD_IMAGE_QUEUE: AdminImageBindings["queue"];
  CARD_IMAGE_BASE_URL?: string;
}

let workerEnv: CardImageEnv | undefined;

function requireWorkerEnv(): CardImageEnv {
  if (!workerEnv) {
    throw new Error("Worker bindings are unavailable outside a request");
  }
  return workerEnv;
}

// Every access is lazy, so the singleton can be built at module scope while the
// bindings themselves only arrive with the first request.
const adminImageBindings: AdminImageBindings = {
  bucket: {
    put: (key, value, options) =>
      requireWorkerEnv().CARD_IMAGES.put(key, value, options),
    delete: (key) => requireWorkerEnv().CARD_IMAGES.delete(key),
  },
  queue: {
    send: (job) => requireWorkerEnv().CARD_IMAGE_QUEUE.send(job),
  },
  get baseUrl() {
    return requireWorkerEnv().CARD_IMAGE_BASE_URL ?? "https://img.riftseer.com";
  },
};

// A deck list stores *printing* ids, but every construction rule reads oracle
// fields — so a deck entry is one of each, flattened.
const deckProvider = new SimplifiedDeckProviderImpl(
  new DeckSerializerV1(),
  async (id: string) => {
    const printing = await cardProvider.getPrintingById(id);
    if (!printing) throw new NotFoundError(`Printing not found: ${id}`);
    const oracle = await cardProvider.getOracleById(printing.oracle_id);
    if (!oracle) throw new NotFoundError(`Card not found for printing: ${id}`);
    return {
      id: printing.id,
      name: oracle.name,
      card_type: oracle.card_type,
      supertype: oracle.supertype,
      domains: oracle.domains,
    };
  },
);

// Lazy warmup — runs once per isolate on the first request. Retries on failure.
let warmupPromise: Promise<void> | null = null;
function ensureWarmedUp(): Promise<void> {
  if (!warmupPromise) {
    warmupPromise = cardProvider.warmup().catch((err) => {
      console.error("[riftseer-api] Provider warmup failed:", err);
      warmupPromise = null; // allow retry on next request
      throw err;
    });
  }
  return warmupPromise;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export const app = new Elysia({
  adapter: CloudflareAdapter,
  // Elysia's response/param normalizer (exact-mirror) can't codegen a
  // mirror function for the literal `"*"` wildcard param key used by
  // GET /cards/by-slug/* — it throws a SyntaxError building the mirror's
  // property access. `"typebox"` normalizes dynamically via Value.Clean
  // instead, which handles non-identifier keys fine.
  normalize: "typebox",
})
  .onBeforeHandle(async ({ path, set }) => {
    if (
      path === "/api/v1/health" ||
      path === "/api/v1/users" ||
      path === "/api/v1/webhooks" ||
      path.startsWith("/api/v1/auth/") ||
      path === "/api/v1/admin" ||
      path.startsWith("/api/v1/admin/") ||
      path.startsWith("/api/v1/users/") ||
      path.startsWith("/api/v1/webhooks/")
    ) return;
    try {
      await ensureWarmedUp();
    } catch {
      set.status = 503;
      return { error: "Service temporarily unavailable" };
    }
  })
  .use(
    cors({
      origin: true, // Reflect any Origin — public API, browser requests from any site are allowed
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  )
  .use(
    new Elysia({ prefix: "/api/v1" })
      .use(metaRoutes(cardProvider, startTime))
      .use(cardsRoutes(cardProvider))
      .use(setsRoutes(cardProvider))
      .use(formatsRoutes(cardProvider))
      .use(decksRoutes(deckProvider))
      .use(authRoutes())
      .use(usersRoutes())
      .use(metafyRoutes())
      .use(
        adminRoutes({
          imageBindings: adminImageBindings,
        }),
      ),
  )
  .compile();

export type App = typeof app;

// The webhook handler needs the raw request body for HMAC signature verification.
// Elysia's body parser consumes the body stream before our route handler runs,
// so we intercept the webhook path here, before mounting Elysia.
export default {
  async fetch(
    request: Request,
    bindings: CardImageEnv,
    ctx: WaitUntilContext,
  ): Promise<Response> {
    workerEnv = bindings;
    const url = new URL(request.url);
    return withExecutionContext(ctx, () => {
      if (url.pathname === "/api/v1/webhooks/metafy" && request.method === "POST") {
        return handleMetafyWebhook(request);
      }
      return Promise.resolve(app.fetch(request));
    });
  },
};
