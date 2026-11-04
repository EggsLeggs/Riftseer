/**
 * The admin image upload is a queue producer whose consumer lives in another
 * Worker, so nothing typechecks the pair. `AdminImageJob` declared `version: 1`
 * while `isCardImageJob` in `apps/ingest-worker` required 2, and the mismatch
 * is silent by design: an invalid message is logged and acked, so every admin
 * upload's transcode was discarded and the upload simply never got variants.
 *
 * The contract now lives in `@riftseer/types`, so both Workers import one
 * definition. These tests assert the message this app sends still satisfies the
 * validator the other one runs — the half a shared type cannot prove, since the
 * producer builds the object by hand.
 */
import { describe, expect, it } from "bun:test";
import { CARD_IMAGE_JOB_VERSION, isCardImageJob } from "@riftseer/types/card-image";
import type { AdminImageJob } from "../routes/admin/shared.ts";

// The exact shape `apps/api/src/routes/admin/images.ts` sends to the queue.
const job: AdminImageJob = {
  version: CARD_IMAGE_JOB_VERSION,
  printingId: "69bc5bd0d308c64675ca877b",
  sourceUrl: "https://img.riftseer.com/cards/69bc5bd0d308c64675ca877b/uploads/abc",
  sourceHash: "a".repeat(64),
  sourceProvider: "admin",
};

describe("the admin upload's queue message", () => {
  it("is accepted by the consumer that has to read it", () => {
    expect(isCardImageJob(job)).toBe(true);
  });

  it("carries the version the consumer requires", () => {
    expect(job.version).toBe(CARD_IMAGE_JOB_VERSION);
  });

  it("is rejected on the version the API used to send", () => {
    // Proof the validator is what discarded these, not something incidental.
    expect(isCardImageJob({ ...job, version: 1 })).toBe(false);
  });

  it("still rejects a message the API could not produce", () => {
    expect(isCardImageJob({ ...job, sourceHash: "not-a-hash" })).toBe(false);
    expect(isCardImageJob({ ...job, printingId: "" })).toBe(false);
  });
});
