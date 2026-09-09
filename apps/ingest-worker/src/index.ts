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
import { enqueueCardImageCatalogJob } from "./images/catalog.ts";
import { processCardImageQueue } from "./images/processor.ts";
import { runIngest, type IngestMode } from "./ingest.ts";

/**
 * Which half of the pipeline each schedule runs.
 *
 * Every expression in `triggers.crons` must appear here, or the run silently
 * does catalogue work on the prices schedule and prices stop being refreshed;
 * `bun run check:wrangler` fails on an expression this map does not name.
 */
const CRON_MODES: Record<string, IngestMode> = {
  "0 */6 * * *": "catalogue",
  "40 3 * * *": "prices",
};

export type { Env };

async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Unset means the route is open — see wrangler.jsonc on optional secrets. */
async function authorized(request: Request, env: Env): Promise<boolean> {
  if (!env.INGEST_SECRET) return true;
  const auth = request.headers.get("Authorization");
  if (!auth) return false;
  return secretsMatch(auth, `Bearer ${env.INGEST_SECRET}`);
}

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // The cron expression selects the half to run. An unrecognised one falls
    // back to the catalogue, the half whose staleness is visible to a reader.
    const mode: IngestMode = CRON_MODES[event.cron] ?? "catalogue";

    ctx.waitUntil(
      runIngest(env, { mode }).then((result) => {
        if (!result.ok) {
          console.error("Ingest worker failed", { mode, error: result.error });
          // Rethrow so the invocation is recorded as an exception rather than
          // `outcome: "ok"`. `runIngest` catches everything and returns a
          // result, which is right for the HTTP route but made a failing cron
          // indistinguishable from a healthy one: the dashboard showed five
          // weeks of green while every run died at batch 7 of 9. Cron triggers
          // are not retried, so this changes what is reported, not what runs.
          throw new Error(`ingest ${mode} failed: ${result.error ?? "unknown"}`);
        }
      }),
    );
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "GET" && pathname === "/") {
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

      return json({
        worker: "riftseer-ingest",
        cron: "0 */6 * * *",
        target,
        local: target.startsWith("localhost") || target.startsWith("127.0.0.1"),
        hint: "Trigger scheduled run locally: GET /cdn-cgi/mf/scheduled",
      });
    }

    // Re-send the catalogue scan on its own. The scan is otherwise reachable
    // only as the last step of a full ingest, so a run that dies earlier takes
    // image hosting down with it and nothing short of a green ingest revives it.
    if (request.method === "POST" && pathname === "/images/reconcile") {
      if (!(await authorized(request, env))) {
        return new Response("Unauthorized", { status: 401 });
      }
      try {
        await enqueueCardImageCatalogJob(env.CARD_IMAGE_QUEUE);
        return json({ queued: true });
      } catch (err) {
        return json(
          { queued: false, error: err instanceof Error ? err.message : String(err) },
          500,
        );
      }
    }

    if (request.method === "POST" && pathname === "/ingest") {
      if (!(await authorized(request, env))) {
        return new Response("Unauthorized", { status: 401 });
      }
      const result = await runIngest(env);
      return json(
        {
          ok: result.ok,
          oraclesCount: result.oraclesCount,
          printingsCount: result.printingsCount,
          setsCount: result.setsCount,
          imageJobsCount: result.imageJobsCount,
          divergenceCount: result.divergenceCount,
          reviewEntriesCount: result.reviewEntriesCount,
          imageCatalogEnqueued: result.imageCatalogEnqueued,
          elapsedMs: result.elapsedMs,
          ...(result.error && { error: result.error }),
        },
        result.ok ? 200 : 500,
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
