import { describe, expect, test } from "bun:test";
import {
  enqueueCardImageCatalogJob,
  enqueueCardImageJobs,
  preparePrintingImageJobs,
} from "../images/catalog.ts";
import { hashImageSourceUrl, selectBestImageSource } from "../images/model.ts";
import { hasCompleteCurrentVariantSet } from "../images/processor.ts";
import {
  CARD_IMAGE_JOB_VERSION,
  isCardImageJob,
  isCardImageVariantJob,
  type CardImageJob,
} from "../images/types.ts";
import type { DurablePrinting } from "../pipeline/durable.ts";
import { printing } from "./fixtures.ts";

const BASE = "https://img.riftseer.com";
const HASH = "a".repeat(64);
function durable(overrides: Partial<DurablePrinting> = {}): DurablePrinting {
  return {
    id: "p",
    tcgplayer_id: null,
    image_source_url: "https://upstream.example/card.png",
    image_source_hash: HASH,
    image_source_provider: "riftcodex",
    image_hosted_at: "2026-08-01T00:00:00Z",
    locked_fields: [],
    ...overrides,
  };
}

describe("image pipeline contracts", () => {
  test("selects an upstream source but never re-hosts our own CDN", () => {
    expect(selectBestImageSource(printing("p", { image_source_url: "https://tcgplayer.example/card.png" }), BASE)).toEqual({ url: "https://tcgplayer.example/card.png", provider: "tcgplayer" });
    expect(selectBestImageSource(printing("p", { image_source_url: `${BASE}/cards/p/normal.webp` }), BASE)).toBeNull();
  });

  test("hashes the source URL deterministically", async () => {
    const first = await hashImageSourceUrl("https://upstream.example/card.png");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashImageSourceUrl("https://upstream.example/card.png")).toBe(first);
    expect(await hashImageSourceUrl("https://upstream.example/other.png")).not.toBe(first);
  });

  test("source_hash guard makes an already-hosted source idempotent", async () => {
    const incoming = printing("p", {
      image_source_url: "https://upstream.example/card.png",
      image_source_provider: "riftcodex",
    });
    const sourceHash = await hashImageSourceUrl(incoming.image_source_url!);
    const result = await preparePrintingImageJobs(
      [incoming],
      new Map([["p", durable({ image_source_hash: sourceHash })]]),
      BASE,
    );
    expect(result).toMatchObject({ jobs: [], reused: 1, adminPreserved: 0 });
    expect(incoming.image_source_hash).toBe(sourceHash);
  });

  test("a changed source hash queues a new printing job", async () => {
    const incoming = printing("p", {
      image_source_url: "https://upstream.example/new.png",
      image_source_provider: "riftcodex",
    });
    const result = await preparePrintingImageJobs([incoming], new Map([["p", durable()]]), BASE);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({ version: 2, printingId: "p", sourceUrl: "https://upstream.example/new.png" });
    expect(result.jobs[0]?.sourceHash).not.toBe(HASH);
  });

  test("an image lock preserves the admin source and requeues it only while unhosted", async () => {
    const incoming = printing("p", { image_source_url: "https://upstream.example/new.png" });
    const previous = durable({
      image_source_url: `${BASE}/cards/p/uploads/${HASH}`,
      image_source_provider: "admin",
      image_hosted_at: null,
      locked_fields: ["image"],
    });
    const result = await preparePrintingImageJobs([incoming], new Map([["p", previous]]), BASE);
    expect(result).toMatchObject({ adminPreserved: 1 });
    expect(incoming.image_source_provider).toBe("admin");
    expect(result.jobs[0]).toMatchObject({ printingId: "p", sourceProvider: "admin", sourceHash: HASH });
  });

  test("publishes only when every variant object carries the current source hash", () => {
    const current = { customMetadata: { sourceHash: HASH } };
    expect(hasCompleteCurrentVariantSet([current, current, current], HASH)).toBe(true);
    expect(hasCompleteCurrentVariantSet([current, { customMetadata: { sourceHash: "b".repeat(64) } }, current], HASH)).toBe(false);
    expect(hasCompleteCurrentVariantSet([current, current, null], HASH)).toBe(false);
  });

  test("batches queue writes at Cloudflare's 100-message limit and starts discovery once", async () => {
    const batches: unknown[][] = [];
    const sent: unknown[] = [];
    const queue = {
      sendBatch: async (batch: unknown[]) => { batches.push(batch); },
      send: async (job: unknown) => { sent.push(job); },
    } as unknown as Queue;
    const jobs: CardImageJob[] = Array.from({ length: 201 }, (_, index) => ({
      version: CARD_IMAGE_JOB_VERSION,
      printingId: `p${index}`,
      sourceUrl: `https://example.com/${index}.png`,
      sourceHash: HASH,
      sourceProvider: "riftcodex",
    }));
    await enqueueCardImageJobs(queue, jobs);
    await enqueueCardImageCatalogJob(queue);
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 1]);
    expect(sent).toEqual([{ version: 2, type: "catalog" }]);
  });

  test("rejects stale v1 jobs and validates v2 source and variant jobs", () => {
    const source = { version: 2, printingId: "p", sourceUrl: "https://example.com/p.png", sourceHash: HASH, sourceProvider: "riftcodex" };
    const variant = { version: 2, type: "variant", printingId: "p", sourceHash: HASH, variant: "normal", orientation: "portrait" };
    expect(isCardImageJob(source)).toBe(true);
    expect(isCardImageJob({ ...source, version: 1 })).toBe(false);
    expect(isCardImageVariantJob(variant)).toBe(true);
    expect(isCardImageVariantJob({ ...variant, sourceHash: "bad" })).toBe(false);
  });
});
