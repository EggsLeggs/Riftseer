/**
 * Riftseer ingest worker — Cloudflare Worker.
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

import type { Env } from "./env.ts";
import type { CardImageQueueJob } from "./images/types.ts";
import { processCardImageQueue } from "./images/processor.ts";
import { runIngest } from "./ingest.ts";

export type { Env };

async function secretsMatch(
  provided: string,
  expected: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}

export default {
  async scheduled(
    _event: ScheduledController,
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

  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    if (request.method === "GET" && new URL(request.url).pathname === "/") {
      // `target` is the host this worker would write to, reported before
      // anyone can trigger a run. An ingest prunes and rewrites the whole
      // catalogue, so "am I pointed at production or at my local stack?" needs
      // an answer that does not involve reading a gitignored file or trusting
      // wrangler's variable precedence. Host only — never the service key.
      let target = "unset";
      try {
        target = new URL(env.SUPABASE_URL).host;
      } catch {
        /* leave "unset": a malformed URL is as good as none for this purpose */
      }

      return new Response(
        JSON.stringify({
          worker: "riftseer-ingest",
          cron: "0 */6 * * *",
          target,
          local: target.startsWith("localhost") || target.startsWith("127.0.0.1"),
          hint: "Trigger scheduled run locally: GET /cdn-cgi/mf/scheduled",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (
      request.method === "POST" &&
      new URL(request.url).pathname === "/ingest"
    ) {
      if (env.INGEST_SECRET) {
        const auth = request.headers.get("Authorization");
        if (
          !auth ||
          !(await secretsMatch(auth, `Bearer ${env.INGEST_SECRET}`))
        ) {
          return new Response("Unauthorized", { status: 401 });
        }
      }
      const result = await runIngest(env);
      return new Response(
        JSON.stringify({
          ok: result.ok,
          oraclesCount: result.oraclesCount,
          printingsCount: result.printingsCount,
          setsCount: result.setsCount,
          imageJobsCount: result.imageJobsCount,
          divergenceCount: result.divergenceCount,
          reviewEntriesCount: result.reviewEntriesCount,
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

  async queue(
    batch: MessageBatch<CardImageQueueJob>,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await processCardImageQueue(batch, env);
  },
} satisfies ExportedHandler<Env, CardImageQueueJob>;
