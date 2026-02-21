/**
 * RiftSeer ingest cron worker — Cloudflare Worker.
 *
 * On schedule (cron), calls the API's POST /api/v1/admin/ingest to run the
 * ingestion pipeline and refresh the in-memory provider.
 *
 * Deploy: wrangler deploy
 * Secrets: wrangler secret put INGEST_CRON_SECRET
 */

export interface Env {
  /** Base URL of the RiftSeer API (no trailing slash) */
  INGEST_API_URL: string;
  /** Secret that must match the API's INGEST_CRON_SECRET */
  INGEST_CRON_SECRET: string;
}

async function triggerIngest(env: Env): Promise<{ ok: boolean; status: number; body: string }> {
  const url = `${env.INGEST_API_URL.replace(/\/$/, "")}/api/v1/admin/ingest`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.INGEST_CRON_SECRET}`,
    },
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      triggerIngest(env).then(({ ok, status, body }) => {
        if (!ok) {
          console.error("Ingest cron failed", { status, body });
        }
      }),
    );
  },

  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    // Optional: allow manual trigger via GET (e.g. for health or one-off run)
    // Still requires no auth for GET; for manual trigger with auth, use POST from elsewhere.
    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          worker: "riftseer-ingest-cron",
          cron: "0 */6 * * *",
          hint: "POST /api/v1/admin/ingest on the API with INGEST_CRON_SECRET to run ingest.",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    if (request.method === "POST") {
      const result = await triggerIngest(env);
      return new Response(result.body, {
        status: result.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("Method Not Allowed", { status: 405 });
  },
};
