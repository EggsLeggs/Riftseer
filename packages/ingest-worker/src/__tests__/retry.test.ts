import { describe, expect, test } from "bun:test";
import {
  INGEST_RPC_MAX_ATTEMPTS,
  INGEST_RPC_RETRY_BASE_MS,
  callRpcWithRetry,
  isRetryableRpcError,
} from "../pipeline/retry.ts";

/** Minimal Supabase stand-in: answers each call from a scripted list. */
function client(responses: Array<{ data?: unknown; error?: { message: string } }>) {
  const calls: Array<{ fn: string; args: unknown }> = [];
  return {
    calls,
    supabase: {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return responses[calls.length - 1] ?? { error: null };
      },
    },
  };
}

const NO_DELAY = { baseDelayMs: 0 };

describe("isRetryableRpcError", () => {
  test("retries the opaque failures Supabase returns for a dropped call", () => {
    expect(
      isRetryableRpcError("internal error; reference = fl1bus2d95vlkreu26jgrjdn"),
    ).toBe(true);
    expect(isRetryableRpcError("fetch failed")).toBe(true);
    expect(isRetryableRpcError("canceling statement due to statement timeout")).toBe(
      true,
    );
    expect(isRetryableRpcError("503 Service Unavailable")).toBe(true);
  });

  test("does not retry a deterministic error", () => {
    // The gateway statuses are matched as delimited tokens, so the same digits
    // inside a card id or a collector number are not mistaken for one.
    expect(
      isRetryableRpcError('invalid card id "68e5039a5031b1b0f1502503"'),
    ).toBe(false);
    expect(isRetryableRpcError("unknown set code ogn-503a-298")).toBe(false);
    expect(
      isRetryableRpcError(
        'duplicate key value violates unique constraint "cards_public_slug_uidx"',
      ),
    ).toBe(false);
    expect(isRetryableRpcError("function does not exist")).toBe(false);
    expect(isRetryableRpcError("patch must be a JSON object")).toBe(false);
  });
});

describe("callRpcWithRetry", () => {
  test("returns the data from a call that succeeds first time", async () => {
    const { supabase, calls } = client([{ data: { upserted: 3 } }]);
    const data = await callRpcWithRetry<{ upserted: number }>(
      supabase as never,
      "ingest_reconciliation_queue",
      { p_entries: [] },
      "queue upsert",
      NO_DELAY,
    );
    expect(data).toEqual({ upserted: 3 });
    expect(calls).toHaveLength(1);
  });

  test("retries an opaque failure and returns the eventual success", async () => {
    const { supabase, calls } = client([
      { error: { message: "internal error; reference = abc123" } },
      { error: { message: "internal error; reference = def456" } },
      { data: { ok: true } },
    ]);
    const data = await callRpcWithRetry(
      supabase as never,
      "ingest_card_data_v2",
      { p_cards: [] },
      "upsert batch 3/5",
      NO_DELAY,
    );
    expect(data).toEqual({ ok: true });
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.fn === "ingest_card_data_v2")).toBe(true);
  });

  test("gives up after the attempt limit, naming the call", async () => {
    const { supabase, calls } = client(
      Array.from({ length: INGEST_RPC_MAX_ATTEMPTS }, () => ({
        error: { message: "internal error; reference = xyz" },
      })),
    );
    await expect(
      callRpcWithRetry(
        supabase as never,
        "ingest_card_data_v2",
        {},
        "upsert batch 3/5",
        NO_DELAY,
      ),
    ).rejects.toThrow("upsert batch 3/5 failed: internal error");
    expect(calls).toHaveLength(INGEST_RPC_MAX_ATTEMPTS);
  });

  test("backs off 750ms, 1.5s then 3s across the four attempts", async () => {
    const { supabase, calls } = client(
      Array.from({ length: INGEST_RPC_MAX_ATTEMPTS }, () => ({
        error: { message: "internal error; reference = xyz" },
      })),
    );

    // Run the real schedule without waiting for it: record each delay and fire
    // the callback immediately.
    const delays: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void, ms?: number) => {
      delays.push(ms ?? 0);
      fn();
      return 0 as unknown as ReturnType<typeof realSetTimeout>;
    }) as typeof globalThis.setTimeout;

    try {
      await expect(
        callRpcWithRetry(supabase as never, "ingest_card_data_v2", {}, "upsert"),
      ).rejects.toThrow("upsert failed: internal error");
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }

    expect(calls).toHaveLength(INGEST_RPC_MAX_ATTEMPTS);
    expect(delays).toEqual([
      INGEST_RPC_RETRY_BASE_MS,
      INGEST_RPC_RETRY_BASE_MS * 2,
      INGEST_RPC_RETRY_BASE_MS * 4,
    ]);
    expect(delays).toEqual([750, 1500, 3000]);
  });

  test("surfaces a deterministic error without retrying", async () => {
    const { supabase, calls } = client([
      { error: { message: "patch must be a JSON object" } },
    ]);
    await expect(
      callRpcWithRetry(supabase as never, "ingest_card_data_v2", {}, "prune", NO_DELAY),
    ).rejects.toThrow("prune failed: patch must be a JSON object");
    expect(calls).toHaveLength(1);
  });
});
