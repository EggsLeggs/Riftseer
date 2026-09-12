import { describe, expect, mock, test } from "bun:test";
import type { IngestResult } from "../ingest.ts";

// The pipeline is the handler's whole dependency, so it is mocked at the module
// boundary. What these tests pin is how the handler reports a result.
let result: IngestResult;

mock.module("../ingest.ts", () => ({
  runIngest: async () => result,
}));

const { default: worker } = await import("../index.ts");

function ingestResult(overrides: Partial<IngestResult>): IngestResult {
  return {
    oraclesCount: 0,
    printingsCount: 0,
    setsCount: 0,
    imageJobsCount: 0,
    divergenceCount: 0,
    reviewEntriesCount: 0,
    imageCatalogEnqueued: false,
    elapsedMs: 0,
    ok: true,
    ...overrides,
  };
}

/**
 * Runs the scheduled handler and settles everything it handed to `waitUntil`.
 * A handler that parks the run in `waitUntil` resolves on its own, which is how
 * a failing cron was recorded as a success (#124).
 */
async function runScheduled(): Promise<void> {
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (promise: Promise<unknown>) => void pending.push(promise) };
  const args = [{ cron: "0 */6 * * *" }, {}, ctx] as unknown as Parameters<typeof worker.scheduled>;
  await worker.scheduled(...args);
  await Promise.allSettled(pending);
}

describe("scheduled ingest", () => {
  test("a failed run rejects, so Cloudflare records the cron as failed", async () => {
    result = ingestResult({ ok: false, error: "ingest_catalogue batch 7/9 failed" });

    await expect(runScheduled()).rejects.toThrow("ingest_catalogue batch 7/9 failed");
  });

  test("a successful run resolves", async () => {
    result = ingestResult({ ok: true, printingsCount: 1304 });

    await expect(runScheduled()).resolves.toBeUndefined();
  });
});
