import { describe, expect, test } from "bun:test";
import type { Card } from "@riftseer/types";
import { collapseDuplicates } from "../pipeline/dedup.ts";
import {
  INGEST_RPC_CARD_BATCH_SIZE,
  runBatchedIngestRpc,
} from "../pipeline/db.ts";
import {
  backfillLinkedPrices,
  buildProductMap,
  enrichCards,
} from "../pipeline/enrich.ts";
import {
  linkChampionsLegends,
  linkRelatedPrintings,
  linkTokens,
} from "../pipeline/link.ts";
import {
  applyDbOverrides,
  applyDbSetOverrides,
} from "../pipeline/overrides-db.ts";
import {
  RECONCILIATION_BATCH_SIZE,
  buildReconciliationEntries,
  syncReconciliationQueue,
} from "../pipeline/reconcile.ts";
import type { TCGProduct } from "../sources/tcgcsv.ts";
import {
  printedCollectorNumber,
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

function tcgProduct({
  productId,
  cleanName,
  number,
  releasedOn,
  rarity,
}: {
  productId: number;
  cleanName: string;
  number: string | null;
  releasedOn?: string;
  rarity?: string;
}): TCGProduct {
  return {
    productId,
    name: cleanName,
    cleanName,
    imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_200w.jpg`,
    url: `https://www.tcgplayer.com/product/${productId}/test`,
    extendedData: [
      ...(number === null
        ? []
        : [{ name: "Number", displayName: "Number", value: number }]),
      ...(rarity ? [{ name: "Rarity", displayName: "Rarity", value: rarity }] : []),
    ],
    ...(releasedOn ? { presaleInfo: { releasedOn } } : {}),
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
        // A deterministic failure — retrying a constraint violation would only
        // delay the report, so it must surface on the first attempt.
        return calls.length === 2
          ? {
              error: {
                message:
                  'duplicate key value violates unique constraint "cards_public_slug_uidx"',
              },
            }
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
      specialCollection: false,
    });
    expect(printedVariantSignals("ogn-305*-298")).toEqual({
      alternateArt: false,
      overnumbered: true,
      signature: true,
      specialCollection: false,
    });
    expect(printedVariantSignals("ven-r03")).toEqual({
      alternateArt: false,
      overnumbered: false,
      signature: false,
      specialCollection: false,
    });
    // SP3 is 3 of a six-card showcase run, not an overnumbered main-set card.
    expect(printedVariantSignals("ven-sp3-006")).toEqual({
      alternateArt: false,
      overnumbered: false,
      signature: false,
      specialCollection: true,
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

  // RiftCodex types collector_number as an integer, so the printed prefix only
  // survives in the riftbound_id. The digits there are printed verbatim: T03
  // is zero-padded, SP3 is not.
  test("printedCollectorNumber restores the prefix the integer field drops", () => {
    expect(printedCollectorNumber("sfd-t03", 3)).toBe("T03");
    expect(printedCollectorNumber("ven-sp3-006", 3)).toBe("SP3");
    expect(printedCollectorNumber("ven-r01", 1)).toBe("R01");
  });

  test("printedCollectorNumber leaves unprefixed numbers to RiftCodex", () => {
    // The id zero-pads where the card and every existing slug do not.
    expect(printedCollectorNumber("ogn-042a-298", 42)).toBe("42");
    expect(printedCollectorNumber("ogn-271-298", 271)).toBe("271");
    expect(printedCollectorNumber(undefined, 7)).toBe("7");
    expect(printedCollectorNumber("malformed", 7)).toBe("7");
  });

  test("rawToCard carries the printed collector number and SP flag", () => {
    const showcase = rawToCard(
      rawCard({ riftbound_id: "ven-sp3-006", collector_number: 3 }),
    );
    expect(showcase.collector_number).toBe("SP3");
    expect(showcase.metadata?.special_collection).toBe(true);
    expect(showcase.metadata?.overnumbered).toBe(false);
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

  // A reference in rules text resolves to one printing, but "which cards make
  // this token" is a fact about the token itself — every printing must answer.
  test("linkTokens gives every printing of a token the same used_by", () => {
    const cards = [
      card({ id: "r271", name: "Recruit (271) // Buff", is_token: true }),
      card({ id: "r272", name: "Recruit (272) // Buff", is_token: true }),
      card({ id: "r273", name: "Recruit (273) // Buff", is_token: true }),
      card({
        id: "maker",
        name: "Vanguard Captain",
        text: { plain: "Play a 1 Might Recruit unit token." },
      }),
    ];

    linkTokens(cards);

    for (const token of cards.slice(0, 3)) {
      expect(token.used_by.map((related) => related.id)).toEqual(["maker"]);
    }
    // The creator still links to a single printing, not all three.
    expect(cards[3].all_parts).toHaveLength(1);
  });

  test("linkTokens clears used_by for a token nothing references", () => {
    const cards = [
      card({
        id: "sprite",
        name: "Sprite (274) // Buff",
        is_token: true,
        used_by: [
          {
            object: "related_card",
            id: "stale",
            name: "Stale",
            component: "token_of",
          },
        ],
      }),
      card({ id: "other", name: "Other", text: { plain: "Draw 1." } }),
    ];

    linkTokens(cards);

    expect(cards[0].used_by).toEqual([]);
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
      byCollector: 0,
      byName: 0,
    });
    expect(cards[0].external_ids?.tcgplayer_id).toBe("652952");
    expect(cards[0].prices?.tcgplayer?.normal).toBe(2.5);
    expect(cards[0].prices?.tcgplayer?.low_normal).toBe(1.25);
    expect(cards[0].purchase_uris?.tcgplayer).toContain("/product/652952/");
  });

  test("enrichCards matches a variant printing to its own product by collector number", () => {
    // Vendetta names both printings "Ambessa, The Wolf"; TCGPlayer distinguishes
    // them by name suffix and by the `a` on the collector number. Matching on
    // collector number + name alone put both on the base printing's product,
    // which published the base printing's price on the alternate art.
    const cards = [
      card({
        id: "ambessa-alt",
        name: "Ambessa, The Wolf",
        name_normalized: "ambessa the wolf",
        collector_number: "84",
        metadata: { alternate_art: true },
        external_ids: { riftcodex_id: "ambessa-alt", riftbound_id: "ven-084a-166" },
        set: { set_code: "VEN", set_name: "Vendetta" },
      }),
      card({
        id: "ambessa-base",
        name: "Ambessa, The Wolf",
        name_normalized: "ambessa the wolf",
        collector_number: "84",
        external_ids: { riftcodex_id: "ambessa-base", riftbound_id: "ven-084-166" },
        set: { set_code: "VEN", set_name: "Vendetta" },
      }),
    ];
    const maps = buildProductMap([
      {
        groupId: 24698,
        products: [
          tcgProduct({
            productId: 707608,
            cleanName: "Ambessa The Wolf",
            number: "084/166",
            rarity: "Rare",
          }),
          tcgProduct({
            productId: 707609,
            cleanName: "Ambessa The Wolf Alternate Art",
            number: "084a/166",
            rarity: "Showcase",
          }),
        ],
        prices: [
          { productId: 707608, lowPrice: 1, midPrice: 2, marketPrice: 1.5, subTypeName: "Normal" },
          { productId: 707609, lowPrice: 8, midPrice: 12, marketPrice: 9.5, subTypeName: "Normal" },
        ],
      },
    ]);

    const result = enrichCards(cards, maps, new Map([["VEN", 24698]]));

    expect(result).toEqual({
      enriched: 2,
      byId: 0,
      byCollectorName: 1,
      byCollector: 1,
      byName: 0,
    });
    const [alt, base] = cards;
    expect(base.external_ids?.tcgplayer_id).toBe("707608");
    expect(base.prices?.tcgplayer?.normal).toBe(1.5);
    expect(alt.external_ids?.tcgplayer_id).toBe("707609");
    expect(alt.prices?.tcgplayer?.normal).toBe(9.5);
  });

  test("enrichCards gives a contested product to one printing only", () => {
    // TCGPlayer lists one "Ambessa The Wolf"; we hold the base printing and its
    // alternate art, which RiftCodex names identically. The base matches on
    // collector number, the alt art only on name.
    const cards = [
      card({
        id: "ambessa-alt",
        name: "Ambessa, The Wolf",
        name_normalized: "ambessa the wolf",
        collector_number: "84",
        metadata: { alternate_art: true },
        external_ids: { riftcodex_id: "ambessa-alt", riftbound_id: "ven-084a-166" },
        set: { set_code: "VEN", set_name: "Vendetta" },
      }),
      card({
        id: "ambessa-base",
        name: "Ambessa, The Wolf",
        name_normalized: "ambessa the wolf",
        collector_number: "84",
        external_ids: { riftcodex_id: "ambessa-base", riftbound_id: "ven-084-166" },
        set: { set_code: "VEN", set_name: "Vendetta" },
      }),
    ];
    const maps = buildProductMap([
      {
        groupId: 24698,
        products: [
          tcgProduct({
            productId: 707608,
            cleanName: "Ambessa The Wolf",
            number: "084/166",
            rarity: "Rare",
          }),
        ],
        prices: [
          {
            productId: 707608,
            lowPrice: 1,
            midPrice: 2,
            marketPrice: 1.5,
            subTypeName: "Normal",
          },
        ],
      },
    ]);

    const result = enrichCards(cards, maps, new Map([["VEN", 24698]]));

    expect(result).toEqual({
      enriched: 1,
      byId: 0,
      byCollectorName: 1,
      byCollector: 0,
      byName: 0,
    });
    const [alt, base] = cards;
    expect(base.external_ids?.tcgplayer_id).toBe("707608");
    expect(base.prices?.tcgplayer?.normal).toBe(1.5);
    // The alt art is genuinely not listed — no id, so the reconciler never
    // compares it against a product describing the base printing.
    expect(alt.external_ids?.tcgplayer_id).toBeUndefined();
    expect(alt.prices?.tcgplayer).toBeUndefined();
    expect(alt.purchase_uris?.tcgplayer).toBeUndefined();
  });

  test("enrichCards breaks a same-tier tie toward the least variant printing", () => {
    const cards = [
      card({
        id: "sig",
        name: "Vi - Peacekeeper",
        name_normalized: "vi peacekeeper",
        metadata: { signature: true, overnumbered: true },
        external_ids: { riftcodex_id: "sig" },
        set: { set_code: "UNL", set_name: "Unleashed" },
      }),
      card({
        id: "plain",
        name: "Vi - Peacekeeper",
        name_normalized: "vi peacekeeper",
        external_ids: { riftcodex_id: "plain" },
        set: { set_code: "UNL", set_name: "Unleashed" },
      }),
    ];
    const maps = buildProductMap([
      {
        groupId: 24560,
        products: [
          tcgProduct({ productId: 900, cleanName: "Vi Peacekeeper", number: null }),
        ],
        prices: [],
      },
    ]);

    const result = enrichCards(cards, maps, new Map([["UNL", 24560]]));

    expect(result).toEqual({
      enriched: 1,
      byId: 0,
      byCollectorName: 0,
      byCollector: 0,
      byName: 1,
    });
    expect(cards[1].external_ids?.tcgplayer_id).toBe("900");
    expect(cards[0].external_ids?.tcgplayer_id).toBeUndefined();
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
          oracle_key: null,
          kind: "all_parts",
          related_card_id: "deleted-token",
          action: "remove",
          created_at: "2026-07-29T00:00:00Z",
        },
        {
          id: "2",
          card_id: "base",
          oracle_key: null,
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

  test("applyDbOverrides expands oracle relationship overrides to every printing", () => {
    const target = card({ id: "legend-1", name: "Heart of the Tempest" });
    const printings = [
      card({ id: "p1", name: "Kennen", collector_number: "1" }),
      card({ id: "p2", name: "Kennen", collector_number: "2" }),
    ];

    const finalCards = applyDbOverrides([...printings, target], {
      cardOverrides: [],
      manualCards: [],
      relationshipOverrides: [
        {
          id: "oracle-add",
          card_id: null,
          oracle_key: "kennen",
          kind: "related_legends",
          related_card_id: "legend-1",
          action: "add",
          created_at: "2026-08-06T00:00:00Z",
        },
      ],
      deletedCardIds: new Set<string>(),
    });

    const byId = new Map(finalCards.map((finalCard) => [finalCard.id, finalCard]));
    expect(byId.get("p1")?.related_legends).toEqual([
      expect.objectContaining({ id: "legend-1", component: "legend" }),
    ]);
    expect(byId.get("p2")?.related_legends).toEqual([
      expect.objectContaining({ id: "legend-1", component: "legend" }),
    ]);
  });

  test("applyDbOverrides lets a new printing inherit an oracle relationship override", () => {
    const target = card({ id: "token-1", name: "Spark", is_token: true });
    const first = card({ id: "unit-1", name: "Sparkcaller", collector_number: "10" });

    const afterFirst = applyDbOverrides([first, target], {
      cardOverrides: [],
      manualCards: [],
      relationshipOverrides: [
        {
          id: "oracle-parts",
          card_id: null,
          oracle_key: "sparkcaller",
          kind: "all_parts",
          related_card_id: "token-1",
          action: "add",
          created_at: "2026-08-06T00:00:00Z",
        },
      ],
      deletedCardIds: new Set<string>(),
    });
    expect(afterFirst.find((c) => c.id === "unit-1")?.all_parts).toEqual([
      expect.objectContaining({ id: "token-1", component: "part" }),
    ]);

    // A sibling printing that did not exist on the previous run still picks up
    // the same oracle-scoped override — that is what makes "all printings"
    // cover future printings without re-saving.
    const sibling = card({
      id: "unit-2",
      name: "Sparkcaller",
      collector_number: "10a",
    });
    const afterSecond = applyDbOverrides([first, sibling, target], {
      cardOverrides: [],
      manualCards: [],
      relationshipOverrides: [
        {
          id: "oracle-parts",
          card_id: null,
          oracle_key: "sparkcaller",
          kind: "all_parts",
          related_card_id: "token-1",
          action: "add",
          created_at: "2026-08-06T00:00:00Z",
        },
      ],
      deletedCardIds: new Set<string>(),
    });

    expect(afterSecond.find((c) => c.id === "unit-2")?.all_parts).toEqual([
      expect.objectContaining({ id: "token-1", component: "part" }),
    ]);
  });

  test("applyDbOverrides lets a printing override beat an oracle relationship add", () => {
    const target = card({ id: "legend-1", name: "Heart of the Tempest" });
    const printings = [
      card({ id: "p1", name: "Kennen", collector_number: "1" }),
      card({ id: "p2", name: "Kennen", collector_number: "2" }),
    ];

    const finalCards = applyDbOverrides([...printings, target], {
      cardOverrides: [],
      manualCards: [],
      relationshipOverrides: [
        {
          id: "oracle-add",
          card_id: null,
          oracle_key: "kennen",
          kind: "related_legends",
          related_card_id: "legend-1",
          action: "add",
          created_at: "2026-08-06T00:00:00Z",
        },
        {
          id: "print-remove",
          card_id: "p2",
          oracle_key: null,
          kind: "related_legends",
          related_card_id: "legend-1",
          action: "remove",
          created_at: "2026-08-06T00:00:01Z",
        },
      ],
      deletedCardIds: new Set<string>(),
    });

    const byId = new Map(finalCards.map((finalCard) => [finalCard.id, finalCard]));
    expect(byId.get("p1")?.related_legends.map((r) => r.id)).toEqual(["legend-1"]);
    expect(byId.get("p2")?.related_legends).toEqual([]);
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

  test("queues unmatched products but not sealed ones or claimed products", () => {
    const cards = [
      card({
        id: "matched-card",
        name: "Sun Disc",
        collector_number: "12",
        external_ids: { riftcodex_id: "matched-card", tcgplayer_id: "1001" },
        set: { set_code: "OGN", set_name: "Origins" },
      }),
      // Same set and collector number as the unmatched product below, so it is
      // offered as the suggestion.
      card({
        id: "suggestion-card",
        name: "Solari Priestess",
        collector_number: "77",
        external_ids: { riftcodex_id: "suggestion-card" },
        set: { set_code: "OGN", set_name: "Origins" },
      }),
    ];
    const maps = buildProductMap([
      {
        groupId: 24344,
        products: [
          tcgProduct({ productId: 1001, cleanName: "Sun Disc", number: "12" }),
          tcgProduct({
            productId: 1002,
            cleanName: "Solari Priestess Foil",
            number: "77",
          }),
          tcgProduct({
            productId: 1003,
            cleanName: "Origins Booster Box",
            number: null,
          }),
        ],
        prices: [],
      },
    ]);

    const entries = buildReconciliationEntries(
      cards,
      maps,
      new Map([["OGN", 24344]]),
    );

    expect(entries).toEqual([
      {
        fingerprint: "product:1002",
        kind: "unmatched_product",
        source: "tcgplayer",
        payload: expect.objectContaining({
          product: expect.objectContaining({
            product_id: 1002,
            set_code: "OGN",
            collector_number: "77",
          }),
          card_id: "suggestion-card",
        }),
        proposed_card_id: "suggestion-card",
      },
    ]);
  });

  test("flags a released-date disagreement but not a variant collector suffix", () => {
    const cards = [
      card({
        id: "alt-art",
        name: "Sett - Brawler (Alternate Art)",
        collector_number: "164",
        released_at: "2025-10-31",
        metadata: { alternate_art: true },
        external_ids: { riftcodex_id: "alt-art", tcgplayer_id: "2001" },
        set: { set_code: "OGN", set_name: "Origins" },
      }),
    ];
    const maps = buildProductMap([
      {
        groupId: 24344,
        products: [
          tcgProduct({
            productId: 2001,
            cleanName: "Sett Brawler Alternate Art",
            // TCGPlayer's `a` suffix is how it spells our number, not a diff.
            number: "164a/298",
            releasedOn: "2025-11-14T00:00:00",
          }),
        ],
        prices: [],
      },
    ]);

    const entries = buildReconciliationEntries(
      cards,
      maps,
      new Map([["OGN", 24344]]),
    );

    expect(entries).toEqual([
      {
        fingerprint: "diff:released_at:alt-art:2025-11-14",
        kind: "field_diff",
        source: "tcgplayer",
        payload: expect.objectContaining({
          field: "released_at",
          current_value: "2025-10-31",
          proposed_value: "2025-11-14",
          card_id: "alt-art",
        }),
        proposed_card_id: "alt-art",
      },
    ]);
  });

  test("flags a rarity disagreement, ignoring case and an absent upstream value", () => {
    const cards = [
      card({
        id: "lacerate",
        name: "Lacerate",
        collector_number: "127",
        classification: { type: "Spell", rarity: "Common" },
        external_ids: { riftcodex_id: "lacerate", tcgplayer_id: "3001" },
        set: { set_code: "VEN", set_name: "Vendetta" },
      }),
      card({
        id: "cased",
        name: "Sun Disc",
        collector_number: "21",
        classification: { type: "Spell", rarity: "Uncommon" },
        external_ids: { riftcodex_id: "cased", tcgplayer_id: "3002" },
        set: { set_code: "VEN", set_name: "Vendetta" },
      }),
      card({
        id: "unrated",
        name: "Whirlwind",
        collector_number: "187",
        classification: { type: "Spell", rarity: "Rare" },
        external_ids: { riftcodex_id: "unrated", tcgplayer_id: "3003" },
        set: { set_code: "VEN", set_name: "Vendetta" },
      }),
    ];
    const maps = buildProductMap([
      {
        groupId: 24698,
        products: [
          tcgProduct({
            productId: 3001,
            cleanName: "Lacerate",
            number: "127/166",
            rarity: "Uncommon",
          }),
          tcgProduct({
            productId: 3002,
            cleanName: "Sun Disc",
            number: "21/166",
            rarity: "UNCOMMON",
          }),
          // TCGPlayer writes a literal "None" where it has no rarity.
          tcgProduct({
            productId: 3003,
            cleanName: "Whirlwind",
            number: "187/166",
            rarity: "None",
          }),
        ],
        prices: [],
      },
    ]);

    const entries = buildReconciliationEntries(
      cards,
      maps,
      new Map([["VEN", 24698]]),
    );

    expect(entries).toEqual([
      {
        fingerprint: "diff:rarity:lacerate:Uncommon",
        kind: "field_diff",
        source: "tcgplayer",
        payload: expect.objectContaining({
          field: "rarity",
          current_value: "Common",
          proposed_value: "Uncommon",
          card_id: "lacerate",
        }),
        proposed_card_id: "lacerate",
      },
    ]);
  });

  test("prunes the reconciliation queue only after every batch is upserted", async () => {
    const calls: Array<{
      p_entries: unknown[];
      p_fingerprints: string[];
      p_prune: boolean;
    }> = [];
    const client = {
      rpc: async (_name: string, payload: (typeof calls)[number]) => {
        calls.push(payload);
        return { data: { ok: true, upserted: payload.p_entries.length }, error: null };
      },
    };
    const entries = Array.from(
      { length: RECONCILIATION_BATCH_SIZE + 1 },
      (_, index) => ({
        fingerprint: `product:${index}`,
        kind: "unmatched_product" as const,
        source: "tcgplayer" as const,
        payload: {
          product: {
            product_id: index,
            name: `Product ${index}`,
            url: "https://example.com",
            image_url: null,
            collector_number: null,
            group_id: 1,
            set_code: "OGN",
          },
        },
        proposed_card_id: null,
      }),
    );

    const result = await syncReconciliationQueue(client as never, entries, true);

    expect(calls.map((call) => call.p_entries.length)).toEqual([
      RECONCILIATION_BATCH_SIZE,
      1,
      0,
    ]);
    expect(calls.slice(0, 2).every((call) => call.p_prune === false)).toBe(true);
    expect(calls[2].p_prune).toBe(true);
    expect(calls[2].p_fingerprints).toHaveLength(entries.length);
    expect(result.upserted).toBe(entries.length);
  });

  test("backfills prices for a card linked only by an admin override", () => {
    const linked = card({
      id: "confirmed",
      name: "Sun Disc",
      external_ids: { riftcodex_id: "confirmed", tcgplayer_id: "3001" },
      set: { set_code: "OGN", set_name: "Origins" },
    });
    const maps = buildProductMap([
      {
        groupId: 24344,
        products: [
          tcgProduct({ productId: 3001, cleanName: "Sun Disc", number: "12" }),
        ],
        prices: [
          {
            productId: 3001,
            lowPrice: 0.5,
            midPrice: 1.5,
            marketPrice: 1.25,
            subTypeName: "Normal",
          },
        ],
      },
    ]);

    expect(backfillLinkedPrices([linked], maps)).toBe(1);
    expect(linked.prices?.tcgplayer?.normal).toBe(1.25);
    expect(linked.purchase_uris?.tcgplayer).toContain("/product/3001/");
    // A second pass must not undo an admin's media override or re-apply prices.
    expect(backfillLinkedPrices([linked], maps)).toBe(0);
  });

  test("links champions to legends on the character tag, not a shared species", () => {
    const cards = [
      card({
        id: "poppy-champ",
        name: "Poppy - Paragon",
        classification: {
          type: "Unit",
          supertype: "Champion",
          tags: ["Yordle", "Demacia", "Poppy"],
        },
      }),
      card({
        id: "kennen-champ",
        name: "Kennen, Storm of Shuriken",
        classification: {
          type: "Unit",
          supertype: "Champion",
          tags: ["Yordle", "Kennen"],
        },
      }),
      // Riftcodex tags this legend `Yordle` as well as `Kennen`, though the
      // printed type line reads "LEGEND | KENNEN".
      card({
        id: "kennen-legend",
        name: "Yordle, Kennen - Heart of the Tempest",
        classification: { type: "Legend", tags: ["Yordle", "Kennen"] },
      }),
      card({
        id: "poppy-legend",
        name: "Poppy - Keeper of the Hammer",
        classification: { type: "Legend", tags: ["Poppy"] },
      }),
      // The species tag sits in the epithet, so it must not be read as the
      // character — otherwise every Cat-tagged legend would link here.
      card({
        id: "nidalee-champ",
        name: "Nidalee - Cat Form",
        classification: {
          type: "Unit",
          supertype: "Champion",
          tags: ["Cat", "Ixtal", "Nidalee"],
        },
      }),
      card({
        id: "cat-legend",
        name: "Rengar - Pridestalker",
        classification: { type: "Legend", tags: ["Cat", "Rengar"] },
      }),
    ];

    linkChampionsLegends(cards);

    const byId = new Map(cards.map((c) => [c.id, c]));
    const names = (id: string, key: "related_legends" | "related_champions") =>
      byId.get(id)![key].map((r) => r.name);

    expect(names("poppy-champ", "related_legends")).toEqual([
      "Poppy - Keeper of the Hammer",
    ]);
    expect(names("kennen-champ", "related_legends")).toEqual([
      "Yordle, Kennen - Heart of the Tempest",
    ]);
    expect(names("kennen-legend", "related_champions")).toEqual([
      "Kennen, Storm of Shuriken",
    ]);
    expect(names("nidalee-champ", "related_legends")).toEqual([]);
    expect(names("cat-legend", "related_champions")).toEqual([]);
  });
});
