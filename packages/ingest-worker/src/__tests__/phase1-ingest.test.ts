import { describe, expect, test } from "bun:test";
import type { Card } from "@riftseer/types";
import { collapseDuplicates } from "../pipeline/dedup.ts";
import { buildProductMap, enrichCards } from "../pipeline/enrich.ts";
import { linkRelatedPrintings } from "../pipeline/link.ts";
import { applyDbOverrides } from "../pipeline/overrides-db.ts";

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

describe("Phase 1 ingest helpers", () => {
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
  });
});
