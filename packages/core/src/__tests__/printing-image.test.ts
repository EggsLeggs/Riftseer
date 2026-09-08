/**
 * What a printing's `image` actually contains, which the OpenAPI schema cannot
 * say.
 *
 * Every key of `PrintingImage` is optional, so a schema check passes whether or
 * not the API ever populates one. The TTS mod read `image.normal` directly and
 * spawned every card blank, because no printing in production is hosted and
 * unhosted art carries `original` alone. These tests pin both shapes so the
 * difference is a test failure rather than a field report.
 *
 * Consumers must walk the ladder in `printingImageUrl()`
 * (`@riftseer/types/card-image`) rather than reaching for a single key.
 */
import { expect, test } from "bun:test";
import type { CardRequest } from "@riftseer/types";
import { printingImageUrl } from "@riftseer/types/card-image";
import { fakeDb, oracleRow, printingRow, providerWith } from "./fake-supabase.ts";

const SOURCE = "https://cmsassets.rgpub.io/sanity/images/x/card-744x1039.png";
const HASH = "0123456789abcdef0123456789abcdef";

async function resolveOne(printingOverrides: Record<string, unknown>) {
  const { db } = fakeDb({
    oracles: [oracleRow("o1", "Gold", "p1")],
    printings: [printingRow("p1", "o1", "001", printingOverrides)],
  });
  const req: CardRequest = { raw: "[[Gold]]", name: "Gold" };
  const [result] = await providerWith(db).resolveRequests([req]);
  return result!.printing;
}

test("unhosted art carries original and nothing else", async () => {
  const printing = await resolveOne({ image_source_url: SOURCE, image_hosted_at: null });

  expect(printing?.image).toEqual({ original: SOURCE });
  // The exact absence the mod tripped over.
  expect(printing?.image?.normal).toBeUndefined();
  expect(printing?.image?.large).toBeUndefined();
  expect(printing?.image?.small).toBeUndefined();
});

test("the size ladder still finds a URL for unhosted art", async () => {
  const printing = await resolveOne({ image_source_url: SOURCE, image_hosted_at: null });

  // This is what every consumer must do, and what the mod now does in Lua.
  expect(printingImageUrl(printing, "normal")).toBe(SOURCE);
  expect(printingImageUrl(printing, "small")).toBe(SOURCE);
  expect(printingImageUrl(printing, "large")).toBe(SOURCE);
});

test("hosted art carries the whole variant set", async () => {
  const printing = await resolveOne({
    image_source_url: SOURCE,
    image_hosted_at: "2026-01-01T00:00:00.000Z",
    image_source_hash: HASH,
  });

  expect(Object.keys(printing?.image ?? {}).sort()).toEqual([
    "large",
    "normal",
    "original",
    "small",
  ]);
  // Derived from the printing id, versioned by the leading 16 of the hash.
  expect(printing?.image?.normal).toBe(
    `https://img.riftseer.com/cards/p1/normal.webp?v=${HASH.slice(0, 16)}`,
  );
  expect(printingImageUrl(printing, "normal")).toBe(printing?.image?.normal);
});

test("a printing with no source image has no image at all", async () => {
  const printing = await resolveOne({ image_source_url: null, image_hosted_at: null });

  expect(printing?.image).toBeUndefined();
  expect(printingImageUrl(printing, "normal")).toBeUndefined();
});

test("hosting is gated on both the timestamp and the hash", async () => {
  // `image_hosted_at` without a hash cannot produce a versioned URL, so the
  // provider falls back rather than emitting keys that 404.
  const noHash = await resolveOne({
    image_source_url: SOURCE,
    image_hosted_at: "2026-01-01T00:00:00.000Z",
    image_source_hash: null,
  });

  expect(noHash?.image).toEqual({ original: SOURCE });

  // A hash alone means the upload never finished, so the R2 objects the
  // versioned URLs point at do not exist yet.
  const noTimestamp = await resolveOne({
    image_source_url: SOURCE,
    image_hosted_at: null,
    image_source_hash: HASH,
  });

  expect(noTimestamp?.image).toEqual({ original: SOURCE });
});
