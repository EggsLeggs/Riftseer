import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Card, CardMedia } from "@riftseer/types";
import {
  buildHostedMediaUrls,
  buildImageObjectKeys,
  hasCompleteHostedMedia,
  hashImageSourceUrl,
  selectBestImageSource,
} from "../images/model.ts";
import {
  enqueueCardImageCatalogJob,
  enqueueCardImageJobs,
  prepareCardImageJobs,
} from "../images/catalog.ts";
import {
  CARD_IMAGE_JOB_VERSION,
  isCardImageJob,
  isCardImageVariantJob,
  type CardImageJob,
} from "../images/types.ts";
import { hasCompleteCurrentVariantSet } from "../images/processor.ts";

const IMAGE_BASE_URL = "https://img.riftseer.com";

function card(id: string, media: CardMedia): Card {
  return {
    object: "card",
    id,
    name: `Card ${id}`,
    name_normalized: `card ${id}`,
    media,
    is_token: false,
    source: "riftcodex",
    all_parts: [],
    used_by: [],
    related_champions: [],
    related_legends: [],
    related_signatures: [],
    related_printings: [],
  };
}

function supabaseWithMedia(
  rows: Array<{ id: string; media: CardMedia }>,
  onQueriedIds?: (ids: string[]) => void,
): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        in: async (_column: string, ids: string[]) => {
          onQueriedIds?.(ids);
          return {
            data: rows.filter((row) => ids.includes(row.id)),
            error: null,
          };
        },
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("image hosting", () => {
  test("selects the explicit high-quality upstream source", () => {
    const selected = selectBestImageSource(
      card("one", {
        source_url: "https://cdn.riftcodex.com/card-large.png",
        source_provider: "riftcodex",
        media_urls: {
          small: "https://cdn.riftcodex.com/card-small.png",
          normal: "https://cdn.riftcodex.com/card-normal.png",
        },
      }),
      IMAGE_BASE_URL,
    );

    expect(selected).toEqual({
      url: "https://cdn.riftcodex.com/card-large.png",
      provider: "riftcodex",
    });
  });

  test("builds versioned public URLs over stable R2 object keys", async () => {
    const sourceHash = await hashImageSourceUrl(
      "https://cdn.riftcodex.com/card.png",
    );
    const keys = buildImageObjectKeys("67f4064886be8495f7165dd7");
    const urls = buildHostedMediaUrls(
      IMAGE_BASE_URL,
      "67f4064886be8495f7165dd7",
      sourceHash,
    );

    expect(sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(keys).toEqual({
      small: "cards/67f4064886be8495f7165dd7/small.webp",
      normal: "cards/67f4064886be8495f7165dd7/normal.webp",
      large: "cards/67f4064886be8495f7165dd7/large.webp",
      original: "cards/67f4064886be8495f7165dd7/original",
    });
    expect(urls.normal).toBe(
      `${IMAGE_BASE_URL}/${keys.normal}?v=${sourceHash.slice(0, 16)}`,
    );
    expect(
      hasCompleteHostedMedia({ media_urls: urls }, IMAGE_BASE_URL),
    ).toBe(true);
  });

  test("publishes only after every stable variant key has the current source", () => {
    const currentHash = "a".repeat(64);
    const staleHash = "b".repeat(64);
    const current = {
      customMetadata: { sourceHash: currentHash },
    };

    expect(
      hasCompleteCurrentVariantSet([current, current, current], currentHash),
    ).toBe(true);
    expect(
      hasCompleteCurrentVariantSet(
        [
          current,
          { customMetadata: { sourceHash: staleHash } },
          current,
        ],
        currentHash,
      ),
    ).toBe(false);
    expect(
      hasCompleteCurrentVariantSet([current, current, null], currentHash),
    ).toBe(false);
  });

  test("preserves hosted URLs when the source hash is unchanged", async () => {
    const sourceUrl = "https://cdn.riftcodex.com/card.png";
    const sourceHash = await hashImageSourceUrl(sourceUrl);
    const hostedUrls = buildHostedMediaUrls(
      IMAGE_BASE_URL,
      "unchanged",
      sourceHash,
    );
    const incoming = card("unchanged", {
      source_url: sourceUrl,
      source_provider: "riftcodex",
      media_urls: { normal: sourceUrl },
    });
    const supabase = supabaseWithMedia([
      {
        id: "unchanged",
        media: {
          source_url: sourceUrl,
          source_hash: sourceHash,
          source_provider: "riftcodex",
          orientation: "portrait",
          media_urls: hostedUrls,
        },
      },
    ]);

    const prepared = await prepareCardImageJobs(
      supabase,
      [incoming],
      IMAGE_BASE_URL,
    );

    expect(prepared.jobs).toHaveLength(0);
    expect(prepared.reused).toBe(1);
    expect(incoming.media?.media_urls).toEqual(hostedUrls);
    expect(incoming.media?.source_hash).toBe(sourceHash);
  });

  test("queues a new job when an upstream URL changes", async () => {
    const incoming = card("changed", {
      source_url: "https://cdn.riftcodex.com/new.png",
      source_provider: "riftcodex",
      media_urls: { normal: "https://cdn.riftcodex.com/new.png" },
    });
    const supabase = supabaseWithMedia([
      {
        id: "changed",
        media: {
          source_url: "https://cdn.riftcodex.com/old.png",
          source_hash: await hashImageSourceUrl(
            "https://cdn.riftcodex.com/old.png",
          ),
          media_urls: buildHostedMediaUrls(
            IMAGE_BASE_URL,
            "changed",
            await hashImageSourceUrl(
              "https://cdn.riftcodex.com/old.png",
            ),
          ),
        },
      },
    ]);

    const prepared = await prepareCardImageJobs(
      supabase,
      [incoming],
      IMAGE_BASE_URL,
    );

    expect(prepared.jobs).toHaveLength(1);
    expect(prepared.jobs[0]?.cardId).toBe("changed");
    expect(prepared.jobs[0]?.sourceUrl).toEndWith("/new.png");
    expect(incoming.media?.source_hash).toBe(
      prepared.jobs[0]?.sourceHash,
    );
    expect(isCardImageJob(prepared.jobs[0])).toBe(true);
  });

  test("reads only the cards in the batch, not the whole catalogue", async () => {
    const queried: string[][] = [];
    const supabase = supabaseWithMedia(
      [
        { id: "wanted", media: { source_url: "https://cdn.x/wanted.png" } },
        { id: "other", media: { source_url: "https://cdn.x/other.png" } },
      ],
      (ids) => queried.push(ids),
    );

    await prepareCardImageJobs(
      supabase,
      [card("wanted", { source_url: "https://cdn.x/wanted.png" })],
      IMAGE_BASE_URL,
    );

    expect(queried).toEqual([["wanted"]]);
  });

  test("keeps an admin image when the upstream source is not admin", async () => {
    const adminUrl = "https://cdn.admin/curated.png";
    const adminHash = await hashImageSourceUrl(adminUrl);
    const adminMedia: CardMedia = {
      source_url: adminUrl,
      source_hash: adminHash,
      source_provider: "admin",
      media_urls: buildHostedMediaUrls(IMAGE_BASE_URL, "curated", adminHash),
    };
    const incoming = card("curated", {
      source_url: "https://cdn.riftcodex.com/upstream.png",
      source_provider: "riftcodex",
    });
    const supabase = supabaseWithMedia([{ id: "curated", media: adminMedia }]);

    const prepared = await prepareCardImageJobs(
      supabase,
      [incoming],
      IMAGE_BASE_URL,
    );

    // The upsert must not launder the admin image into an upstream one — the
    // queue consumer's admin guard reads the row this ingest is about to write.
    expect(prepared.adminPreserved).toBe(1);
    expect(prepared.jobs).toHaveLength(0);
    expect(incoming.media).toEqual(adminMedia);
  });

  test("re-queues an admin image that is not hosted yet", async () => {
    const adminUrl = "https://cdn.admin/pending.png";
    const adminHash = await hashImageSourceUrl(adminUrl);
    const incoming = card("pending", {
      source_url: "https://cdn.riftcodex.com/upstream.png",
      source_provider: "riftcodex",
    });
    const supabase = supabaseWithMedia([
      {
        id: "pending",
        media: {
          source_url: adminUrl,
          source_hash: adminHash,
          source_provider: "admin",
        },
      },
    ]);

    const prepared = await prepareCardImageJobs(
      supabase,
      [incoming],
      IMAGE_BASE_URL,
    );

    expect(prepared.adminPreserved).toBe(1);
    expect(prepared.jobs).toEqual([
      {
        version: CARD_IMAGE_JOB_VERSION,
        cardId: "pending",
        sourceUrl: adminUrl,
        sourceHash: adminHash,
        sourceProvider: "admin",
      },
    ]);
  });

  test("sends queue jobs in Cloudflare's 100-message batches", async () => {
    const batchSizes: number[] = [];
    const queue = {
      sendBatch: async (messages: Iterable<{ body: unknown }>) => {
        batchSizes.push(Array.from(messages).length);
        return {
          metadata: {
            metrics: {
              backlogCount: 0,
              backlogBytes: 0,
            },
          },
        };
      },
    } as unknown as Queue;
    const jobs: CardImageJob[] = Array.from({ length: 205 }, (_, index) => ({
      version: CARD_IMAGE_JOB_VERSION,
      cardId: String(index),
      sourceUrl: `https://cdn.riftcodex.com/${index}.png`,
      sourceHash: index.toString(16).padStart(64, "0"),
      sourceProvider: "riftcodex",
    }));

    await enqueueCardImageJobs(queue, jobs);

    expect(batchSizes).toEqual([100, 100, 5]);
  });

  test("starts image discovery with one catalog queue message", async () => {
    const messages: unknown[] = [];
    const queue = {
      send: async (body: unknown) => {
        messages.push(body);
      },
    } as unknown as Queue;

    await enqueueCardImageCatalogJob(queue);

    expect(messages).toEqual([{ version: 1, type: "catalog" }]);
  });

  test("validates split-step image variant jobs", () => {
    expect(
      isCardImageVariantJob({
        version: 1,
        type: "variant",
        cardId: "card-1",
        sourceHash: "a".repeat(64),
        variant: "normal",
        orientation: "portrait",
      }),
    ).toBe(true);
    expect(
      isCardImageVariantJob({
        version: 1,
        type: "variant",
        cardId: "card-1",
        sourceHash: "a".repeat(64),
        variant: "original",
        orientation: "portrait",
      }),
    ).toBe(false);
  });
});
