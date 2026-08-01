import { describe, expect, test } from "bun:test";
import type { Card } from "@riftseer/types";
import {
  applyGalleryEquipment,
  buildGalleryIndex,
} from "../pipeline/gallery.ts";
import { buildGalleryReconciliationEntries } from "../pipeline/reconcile.ts";
import {
  fetchGalleryCards,
  galleryEquipment,
  normalizeGalleryId,
  type RawGalleryCard,
} from "../sources/riftbound-gallery.ts";

function galleryCard(overrides: Partial<RawGalleryCard> = {}): RawGalleryCard {
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

function card(overrides: Partial<Card> & Pick<Card, "id" | "name">): Card {
  return {
    object: "card",
    name_normalized: overrides.name.toLowerCase(),
    attributes: {},
    classification: {},
    text: {},
    metadata: {},
    media: {},
    is_token: false,
    all_parts: [],
    used_by: [],
    related_champions: [],
    related_legends: [],
    related_signatures: [],
    related_printings: [],
    ...overrides,
  };
}

describe("official gallery source", () => {
  // The gallery writes `ogn-305-star-298` where RiftCodex writes `ogn-305*-298`.
  // Without folding these the 36 signature printings read as 36 missing cards.
  test("normalizeGalleryId folds the signature spelling onto RiftCodex's", () => {
    expect(normalizeGalleryId("ogn-305-star-298")).toBe("ogn-305*-298");
    expect(normalizeGalleryId("OGN-042a-298")).toBe("ogn-042a-298");
    expect(normalizeGalleryId("sfd-t03")).toBe("sfd-t03");
  });

  test("galleryEquipment reads the bonus and the granted effect", () => {
    expect(
      galleryEquipment(
        galleryCard({
          mightBonus: { value: { id: 0, label: "+0" } },
          effect: {
            richText: { body: "<p>[Assault 2] (+2 :rb_might: while attacking.)</p>" },
          },
        }),
      ),
    ).toEqual({
      mightBonus: 0,
      effect: "[Assault 2] (+2 :rb_might: while attacking.)",
    });
  });

  test("galleryEquipment keeps a bonus that is the whole effect", () => {
    expect(
      galleryEquipment(
        galleryCard({ mightBonus: { value: { id: 3, label: "+3" } } }),
      ),
    ).toEqual({ mightBonus: 3 });
  });

  // `ven-103-166` Shadows of the Past is a Spell carrying a stray `effect: "1"`.
  // Keying off `effect` rather than `mightBonus` would publish it as rules text.
  test("galleryEquipment ignores a non-equipment card carrying an effect", () => {
    expect(
      galleryEquipment(
        galleryCard({
          id: "ven-103-166",
          name: "Shadows of the Past",
          cardType: { type: [{ id: "spell", label: "Spell" }] },
          effect: { richText: { body: "<p>1</p>" } },
        }),
      ),
    ).toBeNull();
  });
});

describe("gallery equipment application", () => {
  const index = buildGalleryIndex([
    galleryCard({
      mightBonus: { value: { id: 0, label: "+0" } },
      effect: { richText: { body: "<p>[Assault 2]</p>" } },
    }),
    galleryCard({
      id: "sfd-059-221",
      name: "Svellsongur",
      mightBonus: { value: { id: 0, label: "+0" } },
    }),
  ]);

  // The gallery covers the numbered sets only, so a promo printing of an
  // equipment card is never in it. Keying on the name is what carries the
  // effect across to the JDG and OPP printings.
  test("applies to every printing including ones the gallery omits", () => {
    const cards = [
      card({ id: "sfd", name: "Serrated Dirk" }),
      card({ id: "opp", name: "Serrated Dirk" }),
    ];

    applyGalleryEquipment(cards, index);

    for (const printing of cards) {
      expect(printing.attributes?.might_bonus).toBe(0);
      expect(printing.text?.equipment).toBe("[Assault 2]");
    }
  });

  test("keeps a +0 bonus that has no accompanying effect", () => {
    const svellsongur = card({ id: "jdg", name: "Svellsongur" });

    applyGalleryEquipment([svellsongur], index);

    expect(svellsongur.attributes?.might_bonus).toBe(0);
    expect(svellsongur.text?.equipment).toBeUndefined();
  });

  test("clears equipment fields a card no longer has upstream", () => {
    const demoted = card({
      id: "demoted",
      name: "Not Equipment",
      attributes: { might_bonus: 2 },
      text: { equipment: "[Ganking]" },
    });

    applyGalleryEquipment([demoted], index);

    expect(demoted.attributes?.might_bonus).toBeUndefined();
    expect(demoted.text?.equipment).toBeUndefined();
  });
});

describe("gallery reconciliation", () => {
  test("files a printing the gallery lists and we do not hold", () => {
    const index = buildGalleryIndex([
      galleryCard({
        id: "unl-t01",
        name: "Baron Pit",
        publicCode: "UNL-T01",
        collectorNumber: 1,
        set: { value: { id: "UNL", label: "Unleashed" } },
        cardType: { type: [{ id: "battlefield", label: "Battlefield" }] },
      }),
    ]);

    const entries = buildGalleryReconciliationEntries([], index);

    expect(entries).toEqual([
      {
        fingerprint: "gallery-missing:unl-t01",
        kind: "missing_card",
        source: "gallery",
        payload: {
          gallery: expect.objectContaining({
            riftbound_id: "unl-t01",
            name: "Baron Pit",
            public_code: "UNL-T01",
            type: "Battlefield",
            collector_number: "T01",
            is_token: true,
            set_code: "UNL",
            set_name: "Unleashed",
          }),
        },
        proposed_card_id: null,
      },
    ]);
  });

  test("flags a field the gallery disagrees with us about", () => {
    const index = buildGalleryIndex([
      galleryCard({ rarity: { value: { id: "epic", label: "Epic" } } }),
    ]);
    const dirk = card({
      id: "dirk",
      name: "Serrated Dirk",
      collector_number: "9",
      classification: { rarity: "Uncommon", type: "Gear" },
      external_ids: { riftbound_id: "sfd-009-221" },
    });

    const entries = buildGalleryReconciliationEntries([dirk], index);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      fingerprint: "gallery-diff:rarity:dirk:Epic",
      kind: "field_diff",
      source: "gallery",
      payload: expect.objectContaining({
        field: "rarity",
        current_value: "Uncommon",
        proposed_value: "Epic",
      }),
      proposed_card_id: "dirk",
    });
  });

  // The gallery's `collectorNumber` is a bare integer exactly as RiftCodex's
  // is; the printed prefix lives in `publicCode`. Comparing against the integer
  // reported a diff on all 13 prefixed printings.
  test("compares the printed collector number, not the bare integer", () => {
    const index = buildGalleryIndex([
      galleryCard({
        id: "ven-sp3-006",
        name: "Ahri, Inquisitive",
        collectorNumber: 3,
        publicCode: "VEN-SP3/006",
        set: { value: { id: "VEN", label: "Vendetta" } },
        cardType: { type: [{ id: "unit", label: "Unit" }] },
        rarity: { value: { id: "epic", label: "Epic" } },
      }),
    ]);
    const ahri = card({
      id: "ahri",
      name: "Ahri, Inquisitive",
      collector_number: "SP3",
      classification: { rarity: "Epic", type: "Unit" },
      external_ids: { riftbound_id: "ven-sp3-006" },
    });

    expect(buildGalleryReconciliationEntries([ahri], index)).toEqual([]);
  });

  // The gallery omits `might` on the 599 printings that have none rather than
  // sending null, so an absent field is silence, not a disagreement.
  test("treats an omitted gallery field as silence", () => {
    const index = buildGalleryIndex([galleryCard()]);
    const dirk = card({
      id: "dirk",
      name: "Serrated Dirk",
      collector_number: "9",
      classification: { rarity: "Uncommon", type: "Gear" },
      attributes: { might: 4, energy: 2, power: null },
      external_ids: { riftbound_id: "sfd-009-221" },
    });

    expect(buildGalleryReconciliationEntries([dirk], index)).toEqual([]);
  });

  // Both sources ship the same rules in slightly different markup; comparing
  // the rendered text is what keeps all 1,301 shared printings quiet.
  test("ignores markup-only differences in rules text", () => {
    const index = buildGalleryIndex([
      galleryCard({
        text: { richText: { body: "<p>[Equip] :rb_rune_fury:<br />Attach me.</p>" } },
      }),
    ]);
    const dirk = card({
      id: "dirk",
      name: "Serrated Dirk",
      collector_number: "9",
      classification: { rarity: "Uncommon", type: "Gear" },
      text: { rich: "<p>[Equip] :rb_rune_fury:  <br/>  Attach me.</p>" },
      external_ids: { riftbound_id: "sfd-009-221" },
    });

    expect(buildGalleryReconciliationEntries([dirk], index)).toEqual([]);
  });

  // Names differ stylistically on 390 of the shared printings and meaningfully
  // on none, so the queue must never raise one.
  test("never flags a name difference", () => {
    const index = buildGalleryIndex([
      galleryCard({
        id: "unl-116a-219",
        name: "Poppy, Paragon",
        collectorNumber: 116,
        publicCode: "UNL-116a/219",
        set: { value: { id: "UNL", label: "Unleashed" } },
        cardType: { type: [{ id: "unit", label: "Unit" }] },
        rarity: { value: { id: "rare", label: "Rare" } },
      }),
    ]);
    const poppy = card({
      id: "poppy",
      name: "Poppy - Paragon (Alternate Art)",
      collector_number: "116",
      classification: { rarity: "Rare", type: "Unit" },
      external_ids: { riftbound_id: "unl-116a-219" },
    });

    expect(buildGalleryReconciliationEntries([poppy], index)).toEqual([]);
  });
});

describe("fetchGalleryCards", () => {
  /**
   * Answers every request with one card, reporting `totalPages` as the size of
   * the gallery — so the fetcher stops (or doesn't) purely on that number.
   * Records each requested URL.
   */
  function stubFetch(totalPages: number) {
    const urls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: string) => {
      urls.push(String(input));
      return new Response(
        JSON.stringify({
          data: [{ id: `card-${urls.length}`, name: `Card ${urls.length}` }],
          metadata: { totalPages },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof globalThis.fetch;
    return {
      restore: () => void (globalThis.fetch = real),
      urls,
      params: (key: string) =>
        urls.map((url) => new URL(url).searchParams.get(key)),
    };
  }

  const config = {
    baseUrl: "https://content.publishing.riotgames.com",
    timeoutMs: 1000,
  };

  test("pages by offset until every reported page has been fetched", async () => {
    const stub = stubFetch(2);
    try {
      await expect(fetchGalleryCards(config)).resolves.toHaveLength(2);
      expect(stub.urls).toHaveLength(2);
      // `from` is an item offset, not a page number: page 2 starts one full
      // page in. Read the size off the request so the page size can change.
      const pageSize = stub.params("limit")[0];
      expect(stub.params("from")).toEqual(["0", String(Number(pageSize))]);
    } finally {
      stub.restore();
    }
  });

  // A truncated gallery would read as a complete one: equipment would go
  // missing and pending review entries would be pruned as no longer reported.
  test("throws rather than return a partial gallery at the page cap", async () => {
    const stub = stubFetch(1000);
    try {
      await expect(fetchGalleryCards(config)).rejects.toThrow(
        "gallery pagination exceeded",
      );
    } finally {
      stub.restore();
    }
  });
});
