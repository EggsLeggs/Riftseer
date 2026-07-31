/**
 * Retry for the ingest Postgres RPCs.
 *
 * Supabase answers an otherwise valid call with an opaque
 * `internal error; reference = …` from time to time — a dropped connection
 * rather than anything wrong with the payload. Two consecutive ingests failed
 * that way on *different* batches of identical data, which is what rules the
 * data out: the same 700 KiB that failed as batch 4 succeeded as batch 3 on the
 * next run.
 *
 * Every ingest RPC is a bounded, individually atomic batch, so re-sending one is
 * idempotent and a retry is always safe. Without it a single blip throws away a
 * whole run — including the batches that already committed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../utils.ts";

/** Attempts per RPC call, including the first. */
export const INGEST_RPC_MAX_ATTEMPTS = 4;
/** Doubles per attempt: 750ms, 1.5s, 3s. */
export const INGEST_RPC_RETRY_BASE_MS = 750;

/**
 * Only opaque server-side failures are retried. A constraint violation or a bad
 * argument is deterministic — it would fail identically four times over and the
 * delay would just postpone the report — so it is surfaced immediately.
 */
export function isRetryableRpcError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("internal error") ||
    text.includes("fetch failed") ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("connection") ||
    text.includes("502") ||
    text.includes("503") ||
    text.includes("504")
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Call `fn` on Supabase, retrying opaque failures with exponential backoff.
 * `label` names the call in the thrown error and the retry warning.
 */
export async function callRpcWithRetry<T>(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
  label: string,
  { baseDelayMs = INGEST_RPC_RETRY_BASE_MS } = {},
): Promise<T | null> {
  for (let attempt = 1; ; attempt++) {
    const { data, error } = await supabase.rpc(fn, args);
    if (!error) return (data ?? null) as T | null;

    if (attempt >= INGEST_RPC_MAX_ATTEMPTS || !isRetryableRpcError(error.message)) {
      throw new Error(`${label} failed: ${error.message}`);
    }

    const delay = baseDelayMs * 2 ** (attempt - 1);
    logger.warn("Ingest RPC failed — retrying", {
      label,
      attempt,
      maxAttempts: INGEST_RPC_MAX_ATTEMPTS,
      delayMs: delay,
      error: error.message,
    });
    await sleep(delay);
  }
}
