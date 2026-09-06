import { describe, expect, test } from "bun:test";
import { applyGalleryEquipment, buildGalleryIndex } from "../pipeline/gallery.ts";
import { buildGalleryReconciliationEntries } from "../pipeline/reconcile.ts";
import {
  fetchGalleryCards,
  galleryEquipment,
  normalizeGalleryId,
  type RawGalleryCard,
} from "../sources/riftbound-gallery.ts";
import { oracle, printing } from "./fixtures.ts";

function gallery(overrides: Partial<RawGalleryCard> = {}): RawGalleryCard {
  return {
    id: "sfd-009-221",
    name: "Serrated Dirk",
    collectorNumber: 9,
    publicCode: "SFD-009/221",
    set: { value: { id: "SFD", label: "Spiritforged" } },
    cardType: { type: [{ id: "gear", label: "Gear" }] },
    rarity: { value: { id: "uncommon", label: "Uncommon" } },
    ...overrides,
  };
}

describe("official gallery contracts", () => {
  test("normalizes the signature spelling and id case", () => {
    expect(normalizeGalleryId("ogn-305-star-298")).toBe("ogn-305*-298");
    expect(normalizeGalleryId("OGN-042a-298")).toBe("ogn-042a-298");
  });

  test("uses mightBonus presence as equipment, preserving a printed zero", () => {
    expect(galleryEquipment(gallery({
      mightBonus: { value: { id: 0, label: "+0" } },
      effect: { richText: { body: "<p>[Assault 2]</p>" } },
    }))).toEqual({ mightBonus: 0, effect: "[Assault 2]" });
    expect(galleryEquipment(gallery({ effect: { richText: { body: "1" } } }))).toBeNull();
  });

  test("writes equipment once on the oracle and self-clears absent equipment", () => {
    const equipped = oracle("serrated dirk", { name: "Serrated Dirk" });
    const demoted = oracle("not equipment", { might_bonus: 2, equipment_text: "Old" });
    const index = buildGalleryIndex([gallery({
      mightBonus: { value: { id: 0, label: "+0" } },
      effect: { richText: { body: "<p>[Assault 2]</p>" } },
    })]);
    expect(applyGalleryEquipment([equipped, demoted], index)).toEqual({ equipped: 1 });
    expect(equipped).toMatchObject({ might_bonus: 0, equipment_text: "[Assault 2]" });
    expect(demoted.might_bonus).toBeNull();
    expect(demoted.equipment_text).toBeUndefined();
  });

  test("distinguishes a missing sibling printing from an unmatched oracle", () => {
    const index = buildGalleryIndex([
      gallery({ id: "sfd-010-221", name: "Known", collectorNumber: 10, publicCode: "SFD-010/221" }),
      gallery({ id: "sfd-011-221", name: "Unknown", collectorNumber: 11, publicCode: "SFD-011/221" }),
    ]);
    const entries = buildGalleryReconciliationEntries([
      printing("held", { name: "Known", name_normalized: "known", riftbound_id: "sfd-009-221" }),
    ], index);
    expect(entries.map((entry) => entry.kind)).toEqual(["missing_printing", "unmatched_oracle"]);
    expect(entries[0]?.payload.oracle_key).toBe("known");
    expect(entries.every((entry) => entry.proposed_printing_id === null)).toBe(true);
  });

  test("files objective field disagreements but never stylistic name differences", () => {
    const index = buildGalleryIndex([gallery({ name: "Serrated Dirk, Fancy", rarity: { value: { id: "epic", label: "Epic" } } })]);
    const entries = buildGalleryReconciliationEntries([
      printing("dirk", { name: "Serrated Dirk", riftbound_id: "sfd-009-221", collector_number: "9", rarity: "Uncommon", card_type: "Gear" }),
    ], index);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: "field_diff",
      fingerprint: "gallery-diff:rarity:dirk:Epic",
      payload: { field: "rarity", current_value: "Uncommon", proposed_value: "Epic" },
      proposed_printing_id: "dirk",
    });
  });

  test("compares printed collector prefixes and ignores omitted or markup-only fields", () => {
    const index = buildGalleryIndex([gallery({
      id: "ven-sp3-006",
      name: "Ahri, Inquisitive",
      collectorNumber: 3,
      publicCode: "VEN-SP3/006",
      set: { value: { id: "VEN", label: "Vendetta" } },
      text: { richText: { body: "<p>[Equip] :rb_rune_fury:<br/>Attach me.</p>" } },
      rarity: undefined,
      cardType: undefined,
    })]);
    const entries = buildGalleryReconciliationEntries([
      printing("ahri", {
        name: "Ahri, Inquisitive",
        riftbound_id: "ven-sp3-006",
        collector_number: "SP3",
        text_rich: "<p>[Equip] :rb_rune_fury:  <br> Attach me.</p>",
      }),
    ], index);
    expect(entries).toEqual([]);
  });
});

describe("gallery pagination", () => {
  const config = { baseUrl: "https://content.publishing.riotgames.com", timeoutMs: 1000 };
  function stubFetch(totalPages: number) {
    const urls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: string) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ data: [{ id: `card-${urls.length}`, name: `Card ${urls.length}` }], metadata: { totalPages } }), { status: 200 });
    }) as typeof fetch;
    return { urls, restore: () => { globalThis.fetch = real; } };
  }

  test("pages by item offset until every reported page is fetched", async () => {
    const stub = stubFetch(2);
    try {
      await expect(fetchGalleryCards(config)).resolves.toHaveLength(2);
      expect(stub.urls.map((url) => new URL(url).searchParams.get("from"))).toEqual(["0", "200"]);
    } finally { stub.restore(); }
  });

  test("throws instead of returning a partial gallery at the page cap", async () => {
    const stub = stubFetch(1000);
    try { await expect(fetchGalleryCards(config)).rejects.toThrow("gallery pagination exceeded"); }
    finally { stub.restore(); }
  });
});
