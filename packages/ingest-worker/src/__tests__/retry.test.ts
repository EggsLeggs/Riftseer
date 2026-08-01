import { describe, expect, test } from "bun:test";
import { INGEST_RPC_MAX_ATTEMPTS, INGEST_RPC_RETRY_BASE_MS, callRpcWithRetry, isRetryableRpcError } from "../pipeline/retry.ts";

function client(responses: Array<{ data?: unknown; error?: { message: string } }>) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  return {
    calls,
    supabase: { rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return responses[calls.length - 1] ?? { error: null };
    } },
  };
}

describe("ingest RPC retry", () => {
  test("classifies transient transport/gateway failures without matching incidental numbers", () => {
    for (const message of ["internal error; reference = abc", "fetch failed", "statement timeout", "503 Service Unavailable"]) {
      expect(isRetryableRpcError(message)).toBe(true);
    }
    for (const message of ["invalid id 68e5039a5031b1b0f1502503", "unknown collector ogn-503a", "duplicate key", "function does not exist"]) {
      expect(isRetryableRpcError(message)).toBe(false);
    }
  });

  test("returns immediately on success or a deterministic error", async () => {
    const success = client([{ data: { upserted: 3 } }]);
    expect(await callRpcWithRetry<{ upserted: number }>(success.supabase as never, "ingest_catalogue", {}, "upsert", { baseDelayMs: 0 })).toEqual({ upserted: 3 });
    expect(success.calls).toHaveLength(1);
    const failure = client([{ error: { message: "patch must be a JSON object" } }]);
    await expect(callRpcWithRetry(failure.supabase as never, "ingest_catalogue", {}, "prune", { baseDelayMs: 0 })).rejects.toThrow("prune failed");
    expect(failure.calls).toHaveLength(1);
  });

  test("retries a transient failure until the eventual result", async () => {
    const scripted = client([{ error: { message: "fetch failed" } }, { error: { message: "503" } }, { data: { ok: true } }]);
    expect(await callRpcWithRetry<{ ok: boolean }>(scripted.supabase as never, "ingest_catalogue", { batch: 2 }, "batch", { baseDelayMs: 0 })).toEqual({ ok: true });
    expect(scripted.calls).toHaveLength(3);
  });

  test("uses bounded exponential backoff and names the exhausted operation", async () => {
    const scripted = client(Array.from({ length: INGEST_RPC_MAX_ATTEMPTS }, () => ({ error: { message: "internal error; reference = x" } })));
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void, ms?: number) => { delays.push(ms ?? 0); fn(); return 0 as never; }) as unknown as typeof setTimeout;
    try {
      await expect(callRpcWithRetry(scripted.supabase as never, "ingest_catalogue", {}, "final prune")).rejects.toThrow("final prune failed");
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
    expect(scripted.calls).toHaveLength(INGEST_RPC_MAX_ATTEMPTS);
    expect(delays).toEqual([INGEST_RPC_RETRY_BASE_MS, INGEST_RPC_RETRY_BASE_MS * 2, INGEST_RPC_RETRY_BASE_MS * 4]);
  });
});
