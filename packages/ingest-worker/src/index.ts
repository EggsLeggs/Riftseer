/**
 * RiftSeer ingest worker — Cloudflare Worker.
 *
 * Runs the full ingestion pipeline on a schedule (scheduled events / cron).
 * Not linked to the Elysia API; fetches RiftCodex, enriches with TCGPlayer,
 * links tokens, and upserts directly to Supabase.
 *
 * Local testing: trigger scheduled handler via
 *   curl "http://localhost:8787/cdn-cgi/mf/scheduled"
 * (Miniflare HTTP trigger for scheduled events)
 *
 * Deploy: wrangler deploy
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (required)
 * Optional: RIFTCODEX_API_KEY, RIFTCODEX_BASE_URL, UPSTREAM_TIMEOUT_MS
 */

import type { Env } from "./ingest.ts";
import { runIngest } from "./ingest.ts";

export type { Env };

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      runIngest(env).then((result) => {
        if (!result.ok) {
          console.error("Ingest worker failed", { error: result.error });
        }
      }),
    );
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    if (request.method === "GET" && new URL(request.url).pathname === "/") {
      return new Response(
        JSON.stringify({
          worker: "riftseer-ingest-worker",
          cron: "0 */6 * * *",
          hint: "Trigger scheduled run locally: GET /cdn-cgi/mf/scheduled",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (request.method === "POST" && new URL(request.url).pathname === "/ingest") {
      if (env.INGEST_SECRET) {
        const auth = request.headers.get("Authorization");
        if (!auth || auth !== `Bearer ${env.INGEST_SECRET}`) {
          return new Response("Unauthorized", { status: 401 });
        }
      }
      const result = await runIngest(env);
      return new Response(
        JSON.stringify({
          ok: result.ok,
          cardsCount: result.cardsCount,
          elapsedMs: result.elapsedMs,
          ...(result.error && { error: result.error }),
        }),
        {
          status: result.ok ? 200 : 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response("Not Found", { status: 404 });
  },
};
