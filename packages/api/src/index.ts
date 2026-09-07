/**
 * Riftseer API — Cloudflare Worker entry.
 *
 * The route composition lives in `app.ts`; this file only binds it to the
 * Workers runtime: the Cloudflare adapter, the R2/queue bindings captured from
 * each request, and the Metafy webhook intercept.
 *
 * Deploy: wrangler deploy
 * Dev:    wrangler dev
 * Secrets (wrangler secret put): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   SUPABASE_ANON_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 * Vars (wrangler.jsonc → vars): SITE_ORIGIN — public site origin used to build
 *   absolute riftseer_uri values on card responses.
 */

import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { createProvider } from "@riftseer/core";
import { buildApp } from "./app";
import type { AdminImageBindings } from "./routes/admin";
import { handleMetafyWebhook } from "./lib/metafy";
import { withExecutionContext, type WaitUntilContext } from "./lib/background";

export type { App } from "./app";

/**
 * The slice of the Worker env this module touches, declared structurally.
 *
 * Every workspace package that imports the `App` type (web, discord-bot) also
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

// Every access is lazy, so the app can be built at module scope while the
// bindings themselves only arrive with the first request.
const adminImageBindings: AdminImageBindings = {
  bucket: {
    put: (key, value, options) => requireWorkerEnv().CARD_IMAGES.put(key, value, options),
    delete: (key) => requireWorkerEnv().CARD_IMAGES.delete(key),
  },
  queue: {
    send: (job) => requireWorkerEnv().CARD_IMAGE_QUEUE.send(job),
  },
  get baseUrl() {
    return requireWorkerEnv().CARD_IMAGE_BASE_URL ?? "https://img.riftseer.com";
  },
};

export const app = buildApp(createProvider(), {
  adapter: CloudflareAdapter,
  imageBindings: adminImageBindings,
});

// The webhook handler needs the raw request body for HMAC signature verification.
// Elysia's body parser consumes the body stream before our route handler runs,
// so we intercept the webhook path here, before handing the request to Elysia.
export default {
  async fetch(request: Request, bindings: CardImageEnv, ctx: WaitUntilContext): Promise<Response> {
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
