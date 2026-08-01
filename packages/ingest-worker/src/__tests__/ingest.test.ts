import { describe, expect, test } from "bun:test";
import { collapseDuplicates } from "../pipeline/dedup.ts";
import { INGEST_RPC_CARD_BATCH_SIZE, ingestCatalogue } from "../pipeline/db.ts";
import {
  buildProductMap,
  collectorCandidates,
  enrichPrintings,
} from "../pipeline/enrich.ts";
import { EdgeSet, linkChampionsLegends, linkOracles, linkTokens } from "../pipeline/link.ts";
import { buildOracles, oracleDisplayName } from "../pipeline/oracles.ts";
import {
  RECONCILIATION_BATCH_SIZE,
  buildReconciliationEntries,
  syncReconciliationQueue,
} from "../pipeline/reconcile.ts";
import type { IngestOracle, IngestPrinting } from "../pipeline/types.ts";
import type { TCGGroupResult, TCGProduct } from "../sources/tcgcsv.ts";
import {
  printedCollectorNumber,
  printedVariantSignals,
  rawToPrinting,
  type RawCard,
} from "../sources/riftcodex.ts";
import { oracle, printing } from "./fixtures.ts";

function raw(overrides: Partial<RawCard> = {}): RawCard {
  return {
    id: "raw-card",
    name: "Test Card",
    riftbound_id: "tst-001-100",
    public_code: "TST-001/100",
    collector_number: 1,
    attributes: { energy: null, might: null, power: null },
    classification: { type: "Unit", supertype: null, rarity: "Common", domain: [] },
    text: { rich: "", plain: "" },
    set: { set_id: "TST", label: "Test Set" },
    media: { image_url: "https://example.com/card.png", artist: "Artist", accessibility_text: "Card" },
    tags: [],
    orientation: "portrait",
    metadata: { clean_name: "Test Card", alternate_art: false, overnumbered: false, signature: false },
    ...overrides,
  };
}

function product(productId: number, name: string, number: string | null, rarity?: string): TCGProduct {
  return {
    productId,
    name,
    cleanName: name,
    imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_200w.jpg`,
    url: `https://www.tcgplayer.com/product/${productId}/test`,
    extendedData: [
      ...(number ? [{ name: "Number", displayName: "Number", value: number }] : []),
      ...(rarity ? [{ name: "Rarity", displayName: "Rarity", value: rarity }] : []),
    ],
  };
}

function maps(products: TCGProduct[]) {
  const group: TCGGroupResult = { groupId: 1, products, prices: [] };
  return buildProductMap([group]);
}

function ingestClient(failRpcCall?: number) {
  const calls: Array<{ name: string; payload: any }> = [];
  return {
    calls,
    client: {
      from: () => ({
        select: () => ({
          order: () => ({ range: async () => ({ data: [], error: null }) }),
        }),
      }),
      rpc: async (name: string, payload: any) => {
        calls.push({ name, payload });
        if (calls.length === failRpcCall) return { data: null, error: { message: "constraint failed" } };
        return { data: { ok: true }, error: null };
      },
    },
  };
}

describe("catalogue batching", () => {
  test("keeps oracle groups whole and prunes only after every batch", async () => {
    const { client, calls } = ingestClient();
    const oracles: IngestOracle[] = Array.from({ length: INGEST_RPC_CARD_BATCH_SIZE + 1 }, (_, index) =>
      oracle(`card ${index}`, { printings: [printing(`p${index}`, { name: `Card ${index}` })] }),
    );
    const result = await ingestCatalogue(client as never, [], oracles, [], []);
    expect(result.batches).toBe(2);
    expect(calls).toHaveLength(3);
    expect(calls.slice(0, 2).map((call) => call.payload.p_printings.length)).toEqual([150, 1]);
    expect(calls.slice(0, 2).every((call) => call.payload.p_prune === false && call.payload.p_valid_printing_ids === null)).toBe(true);
    expect(calls[2]?.payload).toMatchObject({ p_oracles: null, p_printings: null, p_prune: true });
    expect(calls[2]?.payload.p_valid_printing_ids).toHaveLength(oracles.length);
  });

  test("never reaches prune after a deterministic batch failure", async () => {
    const { client, calls } = ingestClient(2);
    const oracles = Array.from({ length: INGEST_RPC_CARD_BATCH_SIZE + 1 }, (_, index) =>
      oracle(`card ${index}`, { printings: [printing(`p${index}`, { name: `Card ${index}` })] }),
    );
    await expect(ingestCatalogue(client as never, [], oracles, [], [])).rejects.toThrow("batch 2/2 failed");
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.payload.p_prune === false)).toBe(true);
  });
});

describe("RiftCodex quirks", () => {
  test("restores printed T03, SP3, and R01 collector prefixes", () => {
    expect(printedCollectorNumber("sfd-t03", 3)).toBe("T03");
    expect(printedCollectorNumber("ven-sp3-006", 3)).toBe("SP3");
    expect(printedCollectorNumber("ven-r01", 1)).toBe("R01");
  });

  test("does not copy zero-padding from ordinary Riftbound ids", () => {
    expect(printedCollectorNumber("ogn-042a-298", 42)).toBe("42");
    expect(printedCollectorNumber("ogn-305*-298", 305)).toBe("305");
  });

  test("repairs variant flags from the printed id", () => {
    expect(printedVariantSignals("ogn-042a-298")).toMatchObject({ alternateArt: true });
    expect(printedVariantSignals("ogn-305*-298")).toMatchObject({ signature: true, overnumbered: true });
    expect(printedVariantSignals("ven-sp3-006")).toMatchObject({ specialCollection: true, overnumbered: false });
  });

  test("raw mapping keeps printing rarity, repaired flavour, and Legend type semantics", () => {
    const result = rawToPrinting(raw({
      name: "Yasuo - Unforgiven",
      riftbound_id: "ven-sp3-006",
      collector_number: 3,
      classification: { type: "Legend", supertype: "Champion", rarity: "Showcase", domain: ["Order"] },
      text: { rich: "Rules", plain: "Rules", flavour: "Words.\"\n— Yasuo" },
    }));
    expect(result).toMatchObject({ collector_number: "SP3", rarity: "Showcase", is_special_collection: true });
    expect(result.supertype).toBeUndefined();
    expect(result.flavour_text).toBe('"Words."\n— Yasuo');
  });
});

describe("duplicate collapse", () => {
  test("keeps the TCGPlayer-backed upstream duplicate and backfills its image", () => {
    const result = collapseDuplicates([
      printing("z", { name: "Sett, Brawler", name_normalized: "sett brawler", set_code: "VEN", riftbound_id: "ven-004-166", tcgplayer_id: undefined, image_source_url: "https://example.com/card.png" }),
      printing("a", { name: "Sett, Brawler", name_normalized: "sett brawler", set_code: "VEN", riftbound_id: "ven-004-166", tcgplayer_id: "99" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "a", tcgplayer_id: "99", image_source_url: "https://example.com/card.png" });
  });

  test("preserves genuinely different printed variants and promo number reuse", () => {
    const result = collapseDuplicates([
      printing("base", { name: "Card", set_code: "OGN", riftbound_id: "ogn-042-298" }),
      printing("alt", { name: "Card", set_code: "OGN", riftbound_id: "ogn-042a-298", is_alternate_art: true }),
      printing("promo-a", { name: "Card A", set_code: "JDG", riftbound_id: "jdg-001-a" }),
      printing("promo-b", { name: "Card B", set_code: "JDG", riftbound_id: "jdg-001-b" }),
    ]);
    expect(result.map((value) => value.id)).toEqual(["base", "alt", "promo-a", "promo-b"]);
  });

  test("prefers duplicate metadata that agrees with an alternate-art id", () => {
    const result = collapseDuplicates([
      printing("plain", { name: "Card", set_code: "OGN", riftbound_id: "ogn-042a-298" }),
      printing("alt", { name: "Card", set_code: "OGN", riftbound_id: "ogn-042a-298", is_alternate_art: true }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("alt");
  });
});

describe("oracle grouping and relationships", () => {
  test("strips variant annotations only for the oracle display name", () => {
    expect(oracleDisplayName("Sprite (274) // Buff")).toBe("Sprite");
    expect(oracleDisplayName("Ambessa (Signature)")).toBe("Ambessa");
  });

  test("emits add, remove, scalar override, and clear deltas per printing", () => {
    const built = buildOracles([
      printing("1", { name: "Vayne", tags: ["Sentinel"], domains: ["Order"], energy: 2, text_plain: "Rules" }),
      printing("2", { name: "Vayne", tags: ["Sentinel"], domains: ["Order"], energy: 2, text_plain: "Rules" }),
      printing("3", { name: "Vayne", tags: ["Scout"], domains: ["Chaos"], energy: 3, text_plain: undefined }),
    ]);
    expect(built.oracles[0]).toMatchObject({ tags: ["Sentinel"], domains: ["Order"], energy: 2, text_plain: "Rules" });
    expect(built.deltas).toEqual([{
      printing_id: "3",
      energy_override: 3,
      tags_added: ["Scout"],
      tags_removed: ["Sentinel"],
      domains_added: ["Chaos"],
      domains_removed: ["Order"],
      cleared_fields: ["text_plain"],
    }]);
  });

  test("stores a token edge once and relies on reverse lookup for used_by", () => {
    const maker = oracle("brush", { text_plain: "Create a Sprite unit token." });
    const token = oracle("sprite", { name: "Sprite", is_token: true });
    const edges = linkOracles([maker, token]);
    expect(edges).toEqual([{ from_oracle_key: "brush", to_oracle_key: "sprite", kind: "makes_token" }]);
  });

  test("links champions on character tags, not shared species or regions", () => {
    const poppy = oracle("poppy", { name: "Poppy - Paragon", supertype: "Champion", tags: ["Yordle", "Demacia", "Poppy"] });
    const kennen = oracle("kennen", { name: "Kennen - Keeper", supertype: "Champion", tags: ["Yordle", "Ionia", "Kennen"] });
    const legend = oracle("heart", { name: "Heart of the Tempest", card_type: "Legend", tags: ["Yordle", "Kennen"] });
    const edges = new EdgeSet();
    linkChampionsLegends([poppy, kennen, legend], edges);
    expect(edges.edges).toEqual([{ from_oracle_key: "heart", to_oracle_key: "kennen", kind: "character" }]);
  });
});

describe("TCGPlayer matching", () => {
  test("tries printed variant collectors before their bare number", () => {
    expect(collectorCandidates(printing("alt", { collector_number: "113", riftbound_id: "ven-113a-166", is_alternate_art: true }))).toEqual(["113a", "113"]);
    expect(collectorCandidates(printing("token", { collector_number: "T03", riftbound_id: "sfd-t03" }))).toEqual(["t03", "03", "3"]);
  });

  test("matches base and alternate printings to their own collector products", () => {
    const base = printing("base", { name: "Ambessa The Wolf", name_normalized: "ambessa the wolf", set_code: "VEN", collector_number: "113", riftbound_id: "ven-113-166" });
    const alt = printing("alt", { ...base, id: "alt", riftcodex_id: "alt", riftbound_id: "ven-113a-166", is_alternate_art: true });
    const result = enrichPrintings([base, alt], maps([product(1, "Ambessa The Wolf", "113"), product(2, "Ambessa The Wolf Alternate Art", "113a")]), new Map([["VEN", 1]]));
    expect(result.enriched).toBe(2);
    expect([base.tcgplayer_id, alt.tcgplayer_id]).toEqual(["1", "2"]);
  });

  test("variant-distance tiebreak gives a contested product to the plain printing", () => {
    const base = printing("base", { name: "Vayne", name_normalized: "vayne", set_code: "VEN", collector_number: undefined, riftbound_id: undefined });
    const alt = printing("alt", { ...base, id: "alt", riftcodex_id: "alt", is_alternate_art: true });
    enrichPrintings([alt, base], maps([product(9, "Vayne", null)]), new Map([["VEN", 1]]));
    expect(base.tcgplayer_id).toBe("9");
    expect(alt.tcgplayer_id).toBeUndefined();
  });

  test("an admin-locked product link wins contention", () => {
    const locked = printing("locked", { name: "Vayne", name_normalized: "vayne", set_code: "VEN", tcgplayer_id: "9", tcgplayer_id_locked: true });
    const plain = printing("plain", { name: "Vayne", name_normalized: "vayne", set_code: "VEN", tcgplayer_id: "9" });
    enrichPrintings([plain, locked], maps([product(9, "Vayne", null)]), new Map([["VEN", 1]]));
    expect(locked.tcgplayer_url).toContain("/9/");
    expect(plain.tcgplayer_id).toBeUndefined();
  });
});

describe("reconciliation queue", () => {
  test("queues unclaimed cards but skips sealed products and claimed links", () => {
    const productMaps = maps([product(1, "Unmatched Card", "12"), product(2, "Booster Box", null), product(3, "Claimed", "13")]);
    const entries = buildReconciliationEntries([
      printing("claimed", { set_code: "TST", collector_number: "13", tcgplayer_id: "3" }),
    ], productMaps, new Map([["TST", 1]]));
    expect(entries.map((entry) => entry.payload.product?.product_id)).toEqual([1]);
  });

  test("files printing-level rarity and release disagreements without variant collector noise", () => {
    const p = product(1, "Alt Card", "12a", "Showcase");
    p.presaleInfo = { releasedOn: "2026-02-01T00:00:00Z" };
    const entries = buildReconciliationEntries([
      printing("alt", { name: "Alt Card", set_code: "TST", collector_number: "12", is_alternate_art: true, tcgplayer_id: "1", rarity: "Rare", released_at: "2026-01-01" }),
    ], maps([p]), new Map([["TST", 1]]));
    expect(entries.map((entry) => entry.payload.field)).toEqual(["rarity", "released_at"]);
  });

  test("upserts bounded reconciliation batches before the one final prune", async () => {
    const calls: any[] = [];
    const client = { rpc: async (_name: string, payload: any) => { calls.push(payload); return { data: { upserted: payload.p_entries.length, pruned: payload.p_prune ? 2 : 0 }, error: null }; } };
    const entries = Array.from({ length: RECONCILIATION_BATCH_SIZE + 1 }, (_, index) => ({ ...productEntryForSync(index) }));
    expect(await syncReconciliationQueue(client as never, entries, true)).toEqual({ upserted: entries.length, pruned: 2 });
    expect(calls.map((call) => [call.p_entries.length, call.p_prune])).toEqual([[250, false], [1, false], [0, true]]);
  });
});

function productEntryForSync(index: number) {
  return {
    fingerprint: `product:${index}`,
    kind: "unmatched_product" as const,
    source: "tcgplayer" as const,
    payload: {},
    proposed_printing_id: null,
  };
}
