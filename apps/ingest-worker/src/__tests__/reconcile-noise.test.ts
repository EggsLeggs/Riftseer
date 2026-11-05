import { describe, expect, test } from "bun:test";
import { buildGalleryReconciliationEntries } from "../pipeline/reconcile.ts";
import type { GalleryIndex } from "../pipeline/gallery.ts";
import type { IngestPrinting } from "../pipeline/types.ts";

/**
 * The queue is only useful if every entry is actionable. Three sources of
 * diff were neither: the gallery escapes its HTML, prints `[NO TEXT]` where we
 * store nothing, and drops the zero-padding the riftbound id carries.
 */
function printing(overrides: Partial<IngestPrinting> = {}): IngestPrinting {
  return {
    id: "p1",
    name: "Test Card",
    name_normalized: "test card",
    card_type: "Unit",
    is_token: false,
    energy: null,
    might: null,
    power: null,
    tags: [],
    domains: [],
    set_code: "TST",
    riftbound_id: "tst-038-100",
    collector_number: "038",
    finishes: [],
    is_signature: false,
    is_alternate_art: false,
    is_overnumbered: false,
    is_special_collection: false,
    ...overrides,
  } as IngestPrinting;
}

function index(raw: Record<string, unknown>): GalleryIndex {
  return {
    byRiftboundId: new Map([["tst-038-100", { id: "tst-038-100", name: "Test Card", ...raw }]]),
  } as unknown as GalleryIndex;
}

function fields(entries: ReturnType<typeof buildGalleryReconciliationEntries>) {
  return entries.filter((e) => e.kind === "field_diff").map((e) => (e.payload as any).field);
}

describe("gallery reconciliation drops formatting-only differences", () => {
  test("a zero-padded collector number is not a disagreement", () => {
    const entries = buildGalleryReconciliationEntries(
      [printing()],
      index({ publicCode: "TST-038/100", collectorNumber: 38 }),
    );

    expect(fields(entries)).not.toContain("collector_number");
  });

  test("but a genuinely different number still is", () => {
    const entries = buildGalleryReconciliationEntries(
      [printing()],
      index({ publicCode: "TST-039/100", collectorNumber: 39 }),
    );

    expect(fields(entries)).toContain("collector_number");
  });

  test("HTML entities in the gallery's text are decoded before comparing", () => {
    const entries = buildGalleryReconciliationEntries(
      [printing({ text_rich: 'It has "Kill this" and 1 > 0 & more.' })],
      index({
        publicCode: "TST-038/100",
        collectorNumber: 38,
        text: { richText: { body: "It has &quot;Kill this&quot; and 1 &gt; 0 &amp; more." } },
      }),
    );

    expect(fields(entries)).not.toContain("text");
  });

  test("a real wording change still surfaces", () => {
    const entries = buildGalleryReconciliationEntries(
      [printing({ text_rich: "Each instance of damage the spell deals is increased by 1." })],
      index({
        publicCode: "TST-038/100",
        collectorNumber: 38,
        text: { richText: { body: "Each instance of damage they deal is increased by 1." } },
      }),
    );

    expect(fields(entries)).toContain("text");
  });

  test("the gallery's [NO TEXT] placeholder equals storing nothing", () => {
    const entries = buildGalleryReconciliationEntries(
      [printing({ text_rich: undefined })],
      index({
        publicCode: "TST-038/100",
        collectorNumber: 38,
        text: { richText: { body: "[NO TEXT]" } },
      }),
    );

    expect(fields(entries)).not.toContain("text");
  });
});
