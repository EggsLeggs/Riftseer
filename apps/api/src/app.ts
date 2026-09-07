/**
 * The complete route composition of the Riftseer API.
 *
 * Everything that mounts a route lives here, once. The Worker (`index.ts`)
 * calls `buildApp` with the Cloudflare adapter and real bindings; the spec
 * generator (`scripts/generate-spec.ts`) and the tests call it under plain
 * Bun with a stub provider. Because both go through the same function, a
 * route that is mounted is definitionally in the OpenAPI spec.
 */

import { Elysia, type ElysiaConfig } from "elysia";
import { cors } from "./plugins/cors";
import { rateLimit, type RateLimitOptions } from "./plugins/rate-limit";
import type { CardDataProvider } from "@riftseer/core";
import { metaRoutes } from "./routes/meta";
import { cardsRoutes } from "./routes/cards";
import { setsRoutes } from "./routes/sets";
import { formatsRoutes } from "./routes/formats";
import { decksRoutes } from "./routes/decks";
import { authRoutes } from "./routes/auth";
import { usersRoutes } from "./routes/users";
import { metafyRoutes } from "./routes/metafy";
import { adminRoutes, type AdminImageBindings } from "./routes/admin";
import openapiSpec from "../openapi.json";

export interface BuildAppOptions {
  /** Runtime adapter. Omit for Bun (tests, spec generation). */
  adapter?: ElysiaConfig<undefined>["adapter"];
  /** R2 + queue bindings for admin image uploads. Absent outside the Worker. */
  imageBindings?: AdminImageBindings;
  /**
   * Origins that may call account, deck-writing and admin routes from a
   * browser. Defaults to `SITE_ORIGIN`; public reads answer `*` regardless.
   */
  corsOrigins?: readonly string[];
  /** Limiter wiring; tests supply an in-memory store and clock. Defaults to Upstash. */
  rateLimit?: RateLimitOptions;
}

/** `SITE_ORIGIN` from the Worker vars, as the CORS allowlist it implies. */
function configuredOrigins(): string[] {
  const origin = process.env.SITE_ORIGIN;
  return origin ? [origin] : [];
}

// The committed spec is served verbatim. Widening it here keeps the literal
// type of a large JSON file out of `App`, which every Eden consumer type-checks.
const spec: Record<string, unknown> = openapiSpec;

// One static page; Scalar reads the spec from the same origin, so the
// "try it" requests go wherever this page was served from.
const DOCS_HTML = `<!doctype html>
<html>
  <head>
    <title>Riftseer API Reference</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="/api/v1/openapi.json"></script>
    <script
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.51.0"
      integrity="sha384-NMXUONwp2BXDpg9WZPFiCRAyu0xvHNbpLFT+x+5+sjMaJgNl8dxzEqlCWWwUJnRt"
      crossorigin="anonymous"
    ></script>
  </body>
</html>
`;

export function buildApp(cardProvider: CardDataProvider, options: BuildAppOptions = {}) {
  const startTime = Date.now();
  const imageBindings = options.imageBindings;

  // Warmup runs once per isolate on the first request and retries on failure.
  // Cloudflare Workers forbid request I/O at module scope, so it cannot happen
  // any earlier than this.
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

  return (
    new Elysia({
      adapter: options.adapter,
      // Elysia's response/param normalizer (exact-mirror) can't codegen a
      // mirror function for the literal `"*"` wildcard param key used by
      // GET /cards/by-slug/* — it throws a SyntaxError building the mirror's
      // property access. `"typebox"` normalizes dynamically via Value.Clean
      // instead, which handles non-identifier keys fine.
      normalize: "typebox",
    })
      .onBeforeHandle(async ({ path, set }) => {
        // These routes do not read the card provider, so a catalogue warmup failure
        // must not take down health, docs, account, webhook, or admin traffic with them.
        if (
          path === "/docs" ||
          path === "/api/v1/openapi.json" ||
          path === "/api/v1/health" ||
          path === "/api/v1/users" ||
          path === "/api/v1/webhooks" ||
          path.startsWith("/api/v1/auth/") ||
          path === "/api/v1/admin" ||
          path.startsWith("/api/v1/admin/") ||
          path.startsWith("/api/v1/users/") ||
          path.startsWith("/api/v1/webhooks/") ||
          // Decks resolve cards through the deck repository, not the card provider.
          path === "/api/v1/decks" ||
          path.startsWith("/api/v1/decks/")
        )
          return;
        try {
          await ensureWarmedUp();
        } catch {
          set.status = 503;
          return { error: "Service temporarily unavailable" };
        }
      })
      .use(cors({ allowedOrigins: options.corsOrigins ?? configuredOrigins() }))
      .use(rateLimit(options.rateLimit))
      // The reference page and the spec it reads. Both are hidden from the spec
      // itself: they describe the API rather than belonging to it.
      .get(
        "/docs",
        () =>
          new Response(DOCS_HTML, {
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
        { detail: { hide: true } },
      )
      .get("/api/v1/openapi.json", () => spec, { detail: { hide: true } })
      .use(
        new Elysia({ prefix: "/api/v1" })
          .use(metaRoutes(cardProvider, startTime))
          .use(cardsRoutes(cardProvider))
          .use(setsRoutes(cardProvider))
          .use(formatsRoutes(cardProvider))
          .use(
            decksRoutes({
              imageBaseUrl: imageBindings && (() => imageBindings.baseUrl),
            }),
          )
          .use(authRoutes())
          .use(usersRoutes())
          .use(metafyRoutes())
          .use(adminRoutes({ imageBindings })),
      )
      .compile()
  );
}

export type App = ReturnType<typeof buildApp>;
