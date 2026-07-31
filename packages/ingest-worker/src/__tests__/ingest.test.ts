import { describe, expect, test } from "bun:test";
import type { Card } from "@riftseer/types";
import { collapseDuplicates } from "../pipeline/dedup.ts";
import {
  INGEST_RPC_CARD_BATCH_SIZE,
  runBatchedIngestRpc,
} from "../pipeline/db.ts";
import { buildProductMap, enrichCards } from "../pipeline/enrich.ts";
import { linkRelatedPrintings } from "../pipeline/link.ts";
import {
  applyDbOverrides,
  applyDbSetOverrides,
} from "../pipeline/overrides-db.ts";
import {
  printedVariantSignals,
  rawToCard,
  type RawCard,
} from "../sources/riftcodex.ts";

function card(overrides: Partial<Card> & Pick<Card, "id" | "name">): Card {
  return {
    object: "card",
    id: overrides.id,
    name: overrides.name,
    name_normalized:
      overrides.name_normalized ??
      overrides.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim(),
    collector_number: overrides.collector_number,
    released_at: overrides.released_at,
    external_ids: overrides.external_ids ?? { riftcodex_id: overrides.id },
    set:
      overrides.set ??
      {
        set_code: "TST",
        set_name: "Test Set",
      },
    attributes: overrides.attributes ?? {},
    classification: overrides.classification ?? {},
    text: overrides.text ?? {},
    artist: overrides.artist,
    metadata: overrides.metadata ?? {},
    media: overrides.media ?? {},
    purchase_uris: overrides.purchase_uris ?? {},
    prices: overrides.prices ?? {},
    is_token: overrides.is_token ?? false,
    source: overrides.source ?? "riftcodex",
    all_parts: overrides.all_parts ?? [],
    used_by: overrides.used_by ?? [],
    related_champions: overrides.related_champions ?? [],
    related_legends: overrides.related_legends ?? [],
    related_signatures: overrides.related_signatures ?? [],
    related_printings: overrides.related_printings ?? [],
  };
}

function rawCard(overrides: Partial<RawCard> = {}): RawCard {
  return {
    id: "raw-card",
    name: "Test Card",
    riftbound_id: "tst-001-100",
    public_code: "TST-001/100",
    collector_number: 1,
    attributes: { energy: null, might: null, power: null },
    classification: {
      type: "Unit",
      supertype: null,
      rarity: "Common",
      domain: [],
    },
    text: { rich: "", plain: "" },
    set: { set_id: "TST", label: "Test Set" },
    media: {
      image_url: "https://example.com/card.png",
      artist: "Test Artist",
      accessibility_text: "Test card",
    },
    tags: [],
    orientation: "portrait",
    metadata: {
      clean_name: "Test Card",
      alternate_art: false,
      overnumbered: false,
      signature: false,
    },
    ...overrides,
  };
}

describe("ingest helpers", () => {
  test("uploads bounded card batches before enabling stale-card pruning", async () => {
    const calls: Array<{
      p_sets: unknown[];
      p_artists: unknown[];
      p_cards: unknown[];
      p_valid_ids: string[];
    }> = [];
    const client = {
      rpc: async (_name: string, payload: (typeof calls)[number]) => {
        calls.push(payload);
        return { error: null };
      },
    };
    const cardCount = INGEST_RPC_CARD_BATCH_SIZE * 2 + 1;
    const p_cards = Array.from({ length: cardCount }, (_, index) => ({
      id: `card-${index}`,
    }));
    const p_valid_ids = p_cards.map((entry) => entry.id);

    await runBatchedIngestRpc(client as never, {
      p_sets: [{ set_code: "TST" }] as never,
      p_artists: [{ name: "Artist" }],
      p_cards: p_cards as never,
      p_valid_ids,
    });

    expect(calls).toHaveLength(4);
    expect(calls.slice(0, 3).map((call) => call.p_cards.length)).toEqual([
      INGEST_RPC_CARD_BATCH_SIZE,
      INGEST_RPC_CARD_BATCH_SIZE,
      1,
    ]);
    expect(calls.slice(0, 3).every((call) => call.p_valid_ids.length === 0)).toBe(
      true,
    );
    expect(calls[3].p_cards).toEqual([]);
    expect(calls[3].p_valid_ids).toEqual(p_valid_ids);
  });

  test("does not prune when an upsert batch fails", async () => {
    const calls: Array<{ p_cards: unknown[]; p_valid_ids: string[] }> = [];
    const client = {
      rpc: async (_name: string, payload: (typeof calls)[number]) => {
        calls.push(payload);
        return calls.length === 2
          ? { error: { message: "connection closed" } }
          : { error: null };
      },
    };
    const p_cards = Array.from(
      { length: INGEST_RPC_CARD_BATCH_SIZE + 1 },
      (_, index) => ({ id: `card-${index}` }),
    );

    await expect(
      runBatchedIngestRpc(client as never, {
        p_sets: [] as never,
        p_artists: [],
        p_cards: p_cards as never,
        p_valid_ids: p_cards.map((entry) => entry.id),
      }),
    ).rejects.toThrow("upsert batch 2/2 failed");

    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.p_valid_ids.length === 0)).toBe(true);
  });

  test("collapseDuplicates keeps the tcgplayer-backed upstream duplicate", () => {
    const cards = [
      card({
        id: "without-tcg",
        name: "Sett, Brawler",
        collector_number: "4",
        external_ids: { riftcodex_id: "without-tcg" },
        media: {},
      }),
      card({
        id: "with-tcg",
        name: "Sett, Brawler",
        collector_number: "4",
        external_ids: {
          riftcodex_id: "with-tcg",
          tcgplayer_id: "706098",
        },
        media: {
          media_urls: {
            normal: "https://example.com/sett.png",
          },
        },
      }),
    ];

    const collapsed = collapseDuplicates(cards);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].id).toBe("with-tcg");
    expect(collapsed[0].external_ids?.tcgplayer_id).toBe("706098");
    expect(collapsed[0].media?.media_urls?.normal).toBe(
      "https://example.com/sett.png",
    );
  });

  test("collapseDuplicates keeps real printed collector variants", () => {
    const cards = [
      card({
        id: "base",
        name: "Shen, Scourge of Shadows",
        collector_number: "42",
        external_ids: {
          riftcodex_id: "base",
          riftbound_id: "ven-042-166",
        },
      }),
      card({
        id: "variant",
        name: "Shen, Scourge of Shadows",
        collector_number: "42",
        external_ids: {
          riftcodex_id: "variant",
          riftbound_id: "ven-042a-166",
        },
      }),
    ];

    expect(collapseDuplicates(cards).map((collapsed) => collapsed.id)).toEqual([
      "base",
      "variant",
    ]);
  });

  test("collapseDuplicates prefers a correctly labelled alternate-art duplicate", () => {
    const cards = [
      card({
        id: "mislabeled-alt",
        name: "Shen, Scourge of Shadows",
        collector_number: "42",
        external_ids: {
          riftcodex_id: "mislabeled-alt",
          riftbound_id: "ven-042a-166",
          tcgplayer_id: "706106",
        },
        metadata: { alternate_art: false },
      }),
      card({
        id: "correct-alt",
        name: "Shen, Scourge of Shadows (Alternate Art)",
        collector_number: "42",
        external_ids: {
          riftcodex_id: "correct-alt",
          riftbound_id: "ven-042a-166",
          tcgplayer_id: "706105",
        },
        metadata: { alternate_art: true },
      }),
    ];

    const collapsed = collapseDuplicates(cards);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].id).toBe("correct-alt");
    expect(collapsed[0].metadata?.alternate_art).toBe(true);
  });

  test("collapseDuplicates removes the live VEN Mind Rune duplicate", () => {
    const cards = [
      card({
        id: "6a517606ad64d2d80a4f03ad",
        name: "Mind Rune",
        collector_number: "3",
        external_ids: {
          riftcodex_id: "6a517606ad64d2d80a4f03ad",
          riftbound_id: "ven-r03",
        },
        set: { set_code: "VEN", set_name: "Vendetta" },
      }),
      card({
        id: "6a56ab98ff602fd324f4763f",
        name: "Mind Rune",
        collector_number: "3",
        external_ids: {
          riftcodex_id: "6a56ab98ff602fd324f4763f",
          riftbound_id: "ven-r03",
          tcgplayer_id: "706067",
        },
        set: { set_code: "VEN", set_name: "Vendetta" },
      }),
    ];

    expect(collapseDuplicates(cards).map((collapsed) => collapsed.id)).toEqual([
      "6a56ab98ff602fd324f4763f",
    ]);
  });

  test("collapseDuplicates reduces the five live VEN Shen rows to three printings", () => {
    const cards = [
      card({
        id: "base-old",
        name: "Shen, Scourge of Shadows",
        collector_number: "42",
        external_ids: {
          riftcodex_id: "base-old",
          riftbound_id: "ven-042-166",
        },
      }),
      card({
        id: "base-current",
        name: "Shen, Scourge of Shadows",
        collector_number: "42",
        external_ids: {
          riftcodex_id: "base-current",
          riftbound_id: "ven-042-166",
          tcgplayer_id: "706106",
        },
      }),
      card({
        id: "alt-old",
        name: "Shen, Scourge of Shadows",
        collector_number: "42",
        external_ids: {
          riftcodex_id: "alt-old",
          riftbound_id: "ven-042a-166",
        },
        metadata: { alternate_art: true },
      }),
      card({
        id: "alt-current",
        name: "Shen, Scourge of Shadows (Alternate Art)",
        collector_number: "42",
        external_ids: {
          riftcodex_id: "alt-current",
          riftbound_id: "ven-042a-166",
          tcgplayer_id: "706105",
        },
        metadata: { alternate_art: true },
      }),
      card({
        id: "overnumbered",
        name: "Shen, Scourge of Shadows",
        collector_number: "170",
        external_ids: {
          riftcodex_id: "overnumbered",
          riftbound_id: "ven-170-166",
        },
        metadata: { overnumbered: true },
      }),
    ];

    expect(collapseDuplicates(cards).map((collapsed) => collapsed.id)).toEqual([
      "base-current",
      "alt-current",
      "overnumbered",
    ]);
  });

  test("collapseDuplicates preserves promo cards that reuse a collector number", () => {
    const cards = [
      card({
        id: "promo-one",
        name: "Zilean - Time Mage",
        collector_number: "86",
        external_ids: {
          riftcodex_id: "promo-one",
          riftbound_id: "unl-086-219",
        },
        set: { set_code: "OPP", set_name: "Organized Play Promos" },
      }),
      card({
        id: "promo-two",
        name: "Another Promo",
        collector_number: "86",
        external_ids: {
          riftcodex_id: "promo-two",
          riftbound_id: "ogn-086-104",
        },
        set: { set_code: "OPP", set_name: "Organized Play Promos" },
      }),
    ];

    expect(collapseDuplicates(cards).map((collapsed) => collapsed.id)).toEqual([
      "promo-one",
      "promo-two",
    ]);
  });

  test("rawToCard repairs variant flags from the printed Riftbound id", () => {
    expect(printedVariantSignals("ven-042a-166")).toEqual({
      alternateArt: true,
      overnumbered: false,
      signature: false,
    });
    expect(printedVariantSignals("ogn-305*-298")).toEqual({
      alternateArt: false,
      overnumbered: true,
      signature: true,
    });
    expect(printedVariantSignals("ven-r03")).toEqual({
      alternateArt: false,
      overnumbered: false,
      signature: false,
    });

    const alternate = rawToCard(
      rawCard({
        riftbound_id: "ven-042a-166",
        collector_number: 42,
      }),
    );
    const overnumbered = rawToCard(
      rawCard({
        riftbound_id: "ven-170-166",
        collector_number: 170,
      }),
    );

    expect(alternate.metadata?.alternate_art).toBe(true);
    expect(overnumbered.metadata?.overnumbered).toBe(true);
  });

  test("rawToCard removes the invalid Champion supertype from Legends", () => {
    const yasuo = rawToCard(
      rawCard({
        name: "Yasuo - Unforgiven",
        riftbound_id: "ogn-259-298",
        collector_number: 259,
        classification: {
          type: "Legend",
          supertype: "Champion",
          rarity: "Rare",
          domain: ["Calm", "Chaos"],
        },
      }),
    );

    expect(yasuo.classification).toEqual({
      type: "Legend",
      supertype: undefined,
      rarity: "Rare",
      tags: undefined,
      domains: ["Calm", "Chaos"],
    });
  });

  test("linkRelatedPrintings includes token printings", () => {
    const cards = [
      card({
        id: "r271",
        name: "Recruit (271) // Buff",
        collector_number: "271",
        is_token: true,
      }),
      card({
        id: "r272",
        name: "Recruit (272) // Buff",
        collector_number: "272",
        is_token: true,
      }),
      card({
        id: "r273",
        name: "Recruit (273) // Buff",
        collector_number: "273",
        is_token: true,
      }),
    ];

    linkRelatedPrintings(cards);

    expect(cards[0].related_printings.map((related) => related.id).sort()).toEqual([
      "r272",
      "r273",
    ]);
    expect(cards[1].related_printings.map((related) => related.id).sort()).toEqual([
      "r271",
      "r273",
    ]);
  });

  test("enrichCards falls back to set group, collector number, and normalized name", () => {
    const cards = [
      card({
        id: "sett-alt",
        name: "Sett - Brawler (Alternate Art)",
        name_normalized: "sett brawler alternate art",
        collector_number: "164",
        external_ids: { riftcodex_id: "sett-alt" },
        metadata: { alternate_art: true },
        set: {
          set_code: "OGN",
          set_name: "Origins",
        },
      }),
    ];
    const maps = buildProductMap([
      {
        groupId: 24344,
        products: [
          {
            productId: 652952,
            name: "Sett - Brawler (Alternate Art)",
            cleanName: "Sett Brawler Alternate Art",
            imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/652952_200w.jpg",
            url: "https://www.tcgplayer.com/product/652952/test",
            extendedData: [
              {
                name: "Number",
                displayName: "Number",
                value: "164a/298",
              },
            ],
          },
        ],
        prices: [
          {
            productId: 652952,
            lowPrice: 1.25,
            midPrice: 2.5,
            marketPrice: null,
            subTypeName: "Normal",
          },
        ],
      },
    ]);

    const result = enrichCards(cards, maps, new Map([["OGN", 24344]]));

    expect(result).toEqual({
      enriched: 1,
      byId: 0,
      byCollectorName: 1,
      byName: 0,
    });
    expect(cards[0].external_ids?.tcgplayer_id).toBe("652952");
    expect(cards[0].prices?.tcgplayer?.normal).toBe(2.5);
    expect(cards[0].prices?.tcgplayer?.low_normal).toBe(1.25);
    expect(cards[0].purchase_uris?.tcgplayer).toContain("/product/652952/");
  });

  test("applyDbOverrides applies patches, manual cards, relationships, and deletions", () => {
    const base = card({
      id: "base",
      name: "Base Card",
      all_parts: [
        {
          object: "related_card",
          id: "deleted-token",
          name: "Deleted Token",
          component: "token",
        },
      ],
    });
    const deletedToken = card({
      id: "deleted-token",
      name: "Deleted Token",
      is_token: true,
    });

    const finalCards = applyDbOverrides([base, deletedToken], {
      cardOverrides: [
        {
          card_id: "base",
          patch: {
            text: { plain: "Admin text wins." },
            collector_number: null,
          },
        },
        {
          card_id: "manual-card",
          patch: {
            text: { plain: "Manual patch survives ingest." },
          },
        },
      ],
      manualCards: [
        {
          id: "manual-card",
          definition: {
            name: "Manual Card",
            name_normalized: "manual card",
            is_token: false,
          },
        },
      ],
      relationshipOverrides: [
        {
          id: "1",
          card_id: "base",
          kind: "all_parts",
          related_card_id: "deleted-token",
          action: "remove",
          created_at: "2026-07-29T00:00:00Z",
        },
        {
          id: "2",
          card_id: "base",
          kind: "related_printings",
          related_card_id: "manual-card",
          action: "add",
          created_at: "2026-07-29T00:00:01Z",
        },
      ],
      deletedCardIds: new Set(["deleted-token"]),
    });

    const byId = new Map(finalCards.map((finalCard) => [finalCard.id, finalCard]));

    expect(finalCards.map((finalCard) => finalCard.id)).toEqual([
      "base",
      "manual-card",
    ]);
    expect(byId.get("base")?.text?.plain).toBe("Admin text wins.");
    expect(byId.get("base")?.collector_number).toBeUndefined();
    expect(byId.get("base")?.all_parts).toEqual([]);
    expect(byId.get("base")?.related_printings).toEqual([
      expect.objectContaining({
        id: "manual-card",
        name: "Manual Card",
        component: "printing",
      }),
    ]);
    expect(byId.get("manual-card")?.source).toBe("manual");
    expect(byId.get("manual-card")?.text?.plain).toBe(
      "Manual patch survives ingest.",
    );
  });

  test("applyDbOverrides regroups printings around a renamed card", () => {
    // Automatic linking runs before the overlay, so a rename would otherwise
    // leave `related_printings` grouped on the pre-rename name while the RPC
    // stores an `oracle_key` derived from the new one.
    const cards = [
      card({ id: "a1", name: "Sun Disc", collector_number: "12" }),
      card({ id: "a2", name: "Sun Disc", collector_number: "13" }),
      card({ id: "b1", name: "Moon Disc", collector_number: "14" }),
    ];
    linkRelatedPrintings(cards);
    expect(cards[0].related_printings.map((r) => r.id)).toEqual(["a2"]);

    const finalCards = applyDbOverrides(cards, {
      cardOverrides: [
        {
          card_id: "a2",
          patch: { name: "Moon Disc", name_normalized: "moon disc" },
        },
      ],
      manualCards: [],
      relationshipOverrides: [],
      deletedCardIds: new Set<string>(),
    });

    const byId = new Map(finalCards.map((finalCard) => [finalCard.id, finalCard]));
    expect(byId.get("a1")?.related_printings).toEqual([]);
    expect(byId.get("a2")?.related_printings.map((r) => r.id)).toEqual(["b1"]);
    expect(byId.get("b1")?.related_printings.map((r) => r.id)).toEqual(["a2"]);
  });

  test("applyDbSetOverrides applies durable patches, manual sets, and deletions", () => {
    const finalSets = applyDbSetOverrides(
      [
        {
          set_code: "TST",
          set_name: "Test Set",
          is_promo: false,
          external_ids: { riftcodex_set_id: "tst" },
        },
        {
          set_code: "OLD",
          set_name: "Deleted Set",
          is_promo: false,
          external_ids: {},
        },
      ],
      {
        setOverrides: [
          {
            set_code: "TST",
            patch: { set_name: "Admin Test Set", is_promo: true },
          },
          {
            set_code: "MAN",
            patch: { parent_set_code: "TST" },
          },
        ],
        manualSets: [
          {
            set_code: "MAN",
            definition: {
              set_name: "Manual Set",
              is_promo: false,
              external_ids: {},
            },
          },
        ],
        deletedSetCodes: new Set(["OLD"]),
      },
    );

    expect(finalSets).toEqual([
      expect.objectContaining({
        set_code: "TST",
        set_name: "Admin Test Set",
        is_promo: true,
      }),
      expect.objectContaining({
        set_code: "MAN",
        set_name: "Manual Set",
        parent_set_code: "TST",
      }),
    ]);
  });
});
