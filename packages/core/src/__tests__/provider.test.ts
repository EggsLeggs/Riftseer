/**
 * Provider tests — uses a mock fetch so no real network calls are made.
 */

import { describe, it, expect, beforeAll, mock, spyOn } from "bun:test";
import { RiftCodexProvider, normalizeCardName } from "../providers/riftcodex.ts";

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_CARDS = [
  {
    id: "bf1bafdc-2739-469b-bde6-c24a868f4979",
    name: "Sun Disc",
    riftbound_id: "ogn-021-298",
    tcgplayer_id: "652792",
    public_code: "OGN-021/298",
    collector_number: 21,
    attributes: { energy: 2, might: null, power: 1 },
    classification: { type: "Gear", supertype: null, rarity: "Uncommon", domain: ["Fury"] },
    text: { rich: "<p>Exhaust: next unit ready.</p>", plain: ":rb_exhaust:: Next unit ready." },
    set: { set_id: "OGN", label: "Origins" },
    media: {
      image_url: "https://cdn.example.com/sun-disc.png",
      artist: "Envar Studio",
      accessibility_text: "Sun Disc gear card",
    },
    tags: [],
    orientation: "portrait",
    metadata: { clean_name: "Sun Disc", alternate_art: false, overnumbered: false, signature: false },
  },
  {
    id: "9d874135-ed0d-49fe-9a9c-9d65e87a8edc",
    name: "Stalwart Poro",
    riftbound_id: "ogn-052-298",
    tcgplayer_id: "652828",
    public_code: "OGN-052/298",
    collector_number: 52,
    attributes: { energy: 2, might: 2, power: null },
    classification: { type: "Unit", supertype: null, rarity: "Common", domain: ["Calm"] },
    text: { rich: "<p>[Shield]</p>", plain: "[Shield]" },
    set: { set_id: "OGN", label: "Origins" },
    media: {
      image_url: "https://cdn.example.com/stalwart-poro.png",
      artist: "Six More Vodka",
      accessibility_text: "Stalwart Poro unit card",
    },
    tags: ["Poro"],
    orientation: "portrait",
    metadata: { clean_name: "Stalwart Poro", alternate_art: false, overnumbered: false, signature: false },
  },
  {
    id: "aaaa-1111",
    name: "Sun Disc",
    riftbound_id: "sfd-001-100",
    tcgplayer_id: "999",
    public_code: "SFD-001/100",
    collector_number: 1,
    attributes: { energy: 3, might: null, power: 2 },
    classification: { type: "Gear", supertype: null, rarity: "Rare", domain: ["Fury"] },
    text: { rich: "<p>Reprint</p>", plain: "Reprint." },
    set: { set_id: "SFD", label: "Spiritforged" },
    media: {
      image_url: "https://cdn.example.com/sun-disc-sfd.png",
      artist: "Some Artist",
      accessibility_text: "Sun Disc reprint",
    },
    tags: [],
    orientation: "portrait",
    metadata: { clean_name: "Sun Disc", alternate_art: false, overnumbered: false, signature: false },
  },
];

const MOCK_PAGE_RESPONSE = {
  items: MOCK_CARDS,
  total: MOCK_CARDS.length,
  page: 1,
  size: 100,
  pages: 1,
};

// ─── Mock fetch ───────────────────────────────────────────────────────────────

function mockFetch(response: unknown) {
  return mock(async (url: string) => {
    return {
      ok: true,
      status: 200,
      json: async () => response,
      headers: { get: () => null },
    } as unknown as Response;
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("normalizeCardName", () => {
  it("lowercases", () => expect(normalizeCardName("Sun Disc")).toBe("sun disc"));
  it("strips apostrophes", () => expect(normalizeCardName("Ye'dael")).toBe("yedael"));
  it("strips hyphens", () => expect(normalizeCardName("Kai-Sa")).toBe("kaisa"));
  it("collapses extra whitespace", () => expect(normalizeCardName("Sun  Disc")).toBe("sun disc"));
  it("trims", () => expect(normalizeCardName("  Sun Disc  ")).toBe("sun disc"));
});

describe("RiftCodexProvider", () => {
  let provider: RiftCodexProvider;

  beforeAll(async () => {
    // Patch global fetch to return our mock data
    const orig = globalThis.fetch;
    globalThis.fetch = mockFetch(MOCK_PAGE_RESPONSE) as unknown as typeof fetch;

    provider = new RiftCodexProvider();
    await provider.refresh(); // skip warmup/cache; refresh directly

    globalThis.fetch = orig;
  });

  // ── getCardById ────────────────────────────────────────────────────────────

  describe("getCardById", () => {
    it("returns a card for a known ID", async () => {
      const card = await provider.getCardById("bf1bafdc-2739-469b-bde6-c24a868f4979");
      expect(card).not.toBeNull();
      expect(card!.name).toBe("Sun Disc");
    });

    it("returns null for unknown ID (no live fetch in test)", async () => {
      // Patch fetch to return 404
      const orig = globalThis.fetch;
      globalThis.fetch = mock(async () => ({
        ok: false,
        status: 404,
        json: async () => ({}),
        headers: { get: () => null },
      })) as unknown as typeof fetch;

      const card = await provider.getCardById("nonexistent-id");
      expect(card).toBeNull();

      globalThis.fetch = orig;
    });
  });

  // ── searchByName ───────────────────────────────────────────────────────────

  describe("searchByName", () => {
    it("finds exact match", async () => {
      const results = await provider.searchByName("Sun Disc");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toBe("Sun Disc");
    });

    it("is case-insensitive", async () => {
      const results = await provider.searchByName("sun disc");
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("filters by set code", async () => {
      const results = await provider.searchByName("Sun Disc", { set: "SFD" });
      expect(results.length).toBe(1);
      expect(results[0].set?.set_code).toBe("SFD");
    });

    it("fuzzy matches near-miss names", async () => {
      const results = await provider.searchByName("Stalwart Poro", { fuzzy: true });
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name).toBe("Stalwart Poro");
    });

    it("returns empty array for unrecognisable name when fuzzy=false", async () => {
      const results = await provider.searchByName("zzzzz_nonexistent", { fuzzy: false });
      expect(results).toHaveLength(0);
    });

    it("respects limit", async () => {
      const results = await provider.searchByName("Sun Disc", { limit: 1 });
      expect(results).toHaveLength(1);
    });
  });

  // ── resolveRequest ─────────────────────────────────────────────────────────

  describe("resolveRequest", () => {
    it("resolves exact name match", async () => {
      const res = await provider.resolveRequest({ raw: "Sun Disc", name: "Sun Disc" });
      expect(res.matchType).toBe("exact");
      expect(res.card).not.toBeNull();
      expect(res.card!.name).toBe("Sun Disc");
    });

    it("resolves exact name + set", async () => {
      const res = await provider.resolveRequest({
        raw: "Sun Disc|SFD",
        name: "Sun Disc",
        set: "SFD",
      });
      expect(res.matchType).toBe("exact");
      expect(res.card!.set?.set_code).toBe("SFD");
    });

    it("falls back to default printing when set not found", async () => {
      const res = await provider.resolveRequest({
        raw: "Sun Disc|ZZZ",
        name: "Sun Disc",
        set: "ZZZ",
      });
      // Falls back to any printing
      expect(res.card).not.toBeNull();
      expect(res.card!.name).toBe("Sun Disc");
    });

    it("resolves exact name + set + collector", async () => {
      const res = await provider.resolveRequest({
        raw: "Sun Disc|OGN-021",
        name: "Sun Disc",
        set: "OGN",
        collector: "21",
      });
      expect(res.matchType).toBe("exact");
      expect(res.card!.collector_number).toBe("21");
    });

    it("returns not-found for completely unknown card", async () => {
      const res = await provider.resolveRequest({
        raw: "zzzzz_nonexistent",
        name: "zzzzz_nonexistent",
      });
      expect(res.matchType).toBe("not-found");
      expect(res.card).toBeNull();
    });

    it("fuzzy-matches a typo", async () => {
      // "Stalwart Pero" is close enough to "Stalwart Poro"
      const res = await provider.resolveRequest({
        raw: "Stalwart Pero",
        name: "Stalwart Pero",
      });
      // May be fuzzy or exact depending on threshold; card should not be null
      expect(res.card).not.toBeNull();
      expect(res.card!.name).toBe("Stalwart Poro");
    });

    it("never throws — always returns ResolvedCard", async () => {
      const res = await provider.resolveRequest({ raw: "", name: "" });
      expect(res).toHaveProperty("matchType");
    });
  });

  // ── Metadata ───────────────────────────────────────────────────────────────

  it("reports correct cache size", () => {
    expect(provider.getCacheSize()).toBe(MOCK_CARDS.length);
  });
});
