import { describe, expect, test } from "bun:test";
import {
  enqueueCardImageCatalogJob,
  enqueueCardImageJobs,
  preparePrintingImageJobs,
} from "../images/catalog.ts";
import { hashImageSourceUrl, selectBestImageSource } from "../images/model.ts";
import {
  hasCompleteCurrentImageSet,
  processCardImageJob,
  processCardImageVariantJob,
} from "../images/processor.ts";
import {
  CARD_IMAGE_JOB_VERSION,
  isCardImageJob,
  isCardImageVariantJob,
  type CardImageJob,
} from "../images/types.ts";
import type { DurablePrinting } from "../pipeline/durable.ts";
import type { Env } from "../env.ts";
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
    expect(
      selectBestImageSource(
        printing("p", { image_source_url: "https://tcgplayer.example/card.png" }),
        BASE,
      ),
    ).toEqual({ url: "https://tcgplayer.example/card.png", provider: "tcgplayer" });
    expect(
      selectBestImageSource(
        printing("p", { image_source_url: `${BASE}/cards/p/normal.webp` }),
        BASE,
      ),
    ).toBeNull();
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
    expect(result.jobs[0]).toMatchObject({
      version: 2,
      printingId: "p",
      sourceUrl: "https://upstream.example/new.png",
    });
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
    expect(result.jobs[0]).toMatchObject({
      printingId: "p",
      sourceProvider: "admin",
      sourceHash: HASH,
    });
  });

  test("publishes only when all four objects carry the current source hash", () => {
    const current = { customMetadata: { sourceHash: HASH } };
    const stale = { customMetadata: { sourceHash: "b".repeat(64) } };
    expect(hasCompleteCurrentImageSet([current, current, current, current], HASH)).toBe(true);
    // The three variants alone are not a hosted printing: `original` is the URL
    // the download action hands out.
    expect(hasCompleteCurrentImageSet([current, current, current], HASH)).toBe(false);
    expect(hasCompleteCurrentImageSet([current, stale, current, current], HASH)).toBe(false);
    expect(hasCompleteCurrentImageSet([current, current, current, null], HASH)).toBe(false);
  });

  test("batches queue writes at Cloudflare's 100-message limit and starts discovery once", async () => {
    const batches: unknown[][] = [];
    const sent: unknown[] = [];
    const queue = {
      sendBatch: async (batch: unknown[]) => {
        batches.push(batch);
      },
      send: async (job: unknown) => {
        sent.push(job);
      },
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
    const source = {
      version: 2,
      printingId: "p",
      sourceUrl: "https://example.com/p.png",
      sourceHash: HASH,
      sourceProvider: "riftcodex",
    };
    const variant = {
      version: 2,
      type: "variant",
      printingId: "p",
      sourceHash: HASH,
      variant: "normal",
      orientation: "portrait",
    };
    expect(isCardImageJob(source)).toBe(true);
    expect(isCardImageJob({ ...source, version: 1 })).toBe(false);
    expect(isCardImageVariantJob(variant)).toBe(true);
    expect(isCardImageVariantJob({ ...variant, sourceHash: "bad" })).toBe(false);
  });
});

interface StoredRow {
  image_source_url: string | null;
  image_source_hash: string | null;
  image_source_provider: string | null;
  image_orientation: string | null;
  image_hosted_at: string | null;
}

function row(overrides: Partial<StoredRow> = {}): StoredRow {
  return {
    image_source_url: "https://upstream.example/card.png",
    image_source_hash: HASH,
    image_source_provider: "riftcodex",
    image_orientation: "portrait",
    image_hosted_at: null,
    ...overrides,
  };
}

/** Just enough PostgREST for `loadCurrentPrintingImage` plus the publish RPC. */
function store(stored: StoredRow | null, published = true) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    rpcCalls,
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: async () => ({ data: stored ? [stored] : [], error: null }),
          }),
        }),
      }),
      rpc: async (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        return { data: published, error: null };
      },
    },
  };
}

const KEYS = {
  original: "cards/p/original",
  small: "cards/p/small.webp",
  normal: "cards/p/normal.webp",
  large: "cards/p/large.webp",
};

function completeSet(
  sourceHash = HASH,
): Record<string, { customMetadata: { sourceHash: string } }> {
  return Object.fromEntries(
    Object.values(KEYS).map((key) => [key, { customMetadata: { sourceHash } }]),
  );
}

function environment(objects: Record<string, { customMetadata: { sourceHash: string } }>) {
  const puts: string[] = [];
  const sent: unknown[] = [];
  const fetched: string[] = [];
  const env = {
    CARD_IMAGE_BASE_URL: BASE,
    UPSTREAM_TIMEOUT_MS: "30000",
    CARD_IMAGES: {
      head: async (key: string) => objects[key] ?? null,
      get: async (key: string) => {
        const object = objects[key];
        if (!object) return null;
        return { ...object, body: new Blob([new Uint8Array([1, 2, 3])]).stream() };
      },
      put: async (key: string) => {
        puts.push(key);
      },
    },
    IMAGES: {
      info: async () => ({ width: 744, height: 1039 }),
      input: () => ({
        transform: () => ({
          output: async () => ({
            response: () => new Response(new Blob([new Uint8Array([1])]), { status: 200 }),
          }),
        }),
      }),
    },
    CARD_IMAGE_QUEUE: {
      sendBatch: async (batch: Array<{ body: unknown }>) => {
        sent.push(...batch.map((message) => message.body));
      },
    },
  };
  return { env: env as unknown as Env, puts, sent, fetched };
}

const JOB: CardImageJob = {
  version: CARD_IMAGE_JOB_VERSION,
  printingId: "p",
  sourceUrl: "https://upstream.example/card.png",
  sourceHash: HASH,
  sourceProvider: "riftcodex",
};

describe("publishing art R2 already holds", () => {
  test("adopts a complete current object set instead of re-hosting it", async () => {
    const db = store(row());
    const { env, puts, sent } = environment(completeSet());

    expect(await processCardImageJob(db.supabase as never, env, JOB)).toBe("adopted");

    // The whole point: nothing was downloaded, transcoded, uploaded or queued.
    expect(puts).toEqual([]);
    expect(sent).toEqual([]);
    expect(db.rpcCalls).toEqual([
      {
        fn: "apply_printing_hosted_media",
        args: {
          p_printing_id: "p",
          p_source_hash: HASH,
          p_source_url: "https://upstream.example/card.png",
          p_source_provider: "riftcodex",
          p_orientation: "portrait",
          p_alt_text: null,
        },
      },
    ]);
  });

  test("adoption is idempotent: a row published in the meantime is left alone", async () => {
    const db = store(row({ image_hosted_at: "2026-08-01T00:00:00Z" }));
    const { env } = environment(completeSet());
    expect(await processCardImageJob(db.supabase as never, env, JOB)).toBe("unchanged");
    expect(db.rpcCalls).toEqual([]);
  });

  test("objects built from an older source are rebuilt, not adopted", async () => {
    const db = store(row());
    const objects = completeSet();
    objects[KEYS.large] = { customMetadata: { sourceHash: "b".repeat(64) } };
    const { env, puts, sent } = environment(objects);

    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }))) as never;
    try {
      expect(await processCardImageJob(db.supabase as never, env, JOB)).toBe("queued");
    } finally {
      globalThis.fetch = original;
    }

    expect(puts).toEqual([KEYS.original]);
    expect(sent).toHaveLength(3);
    expect(db.rpcCalls).toEqual([]);
  });

  test("a row with no orientation is rebuilt: nothing here reads the pixels", async () => {
    const db = store(row({ image_orientation: null }));
    const { env, puts } = environment(completeSet());

    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }))) as never;
    try {
      expect(await processCardImageJob(db.supabase as never, env, JOB)).toBe("queued");
    } finally {
      globalThis.fetch = original;
    }
    expect(puts).toEqual([KEYS.original]);
    expect(db.rpcCalls).toEqual([]);
  });

  test("a source that moved on since the job was queued publishes nothing", async () => {
    const db = store(row({ image_source_hash: "b".repeat(64) }));
    const { env, puts } = environment(completeSet());
    expect(await processCardImageJob(db.supabase as never, env, JOB)).toBe("stale");
    expect(puts).toEqual([]);
    expect(db.rpcCalls).toEqual([]);
  });

  test("a variant job will not publish over an original from another source", async () => {
    const objects = completeSet();
    objects[KEYS.original] = { customMetadata: { sourceHash: "b".repeat(64) } };
    const db = store(row());
    const { env } = environment(objects);
    expect(
      await processCardImageVariantJob(db.supabase as never, env, {
        version: CARD_IMAGE_JOB_VERSION,
        type: "variant",
        printingId: "p",
        sourceHash: HASH,
        variant: "normal",
        orientation: "portrait",
      }),
    ).toBe("variant");
    expect(db.rpcCalls).toEqual([]);
  });
});
