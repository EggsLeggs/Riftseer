import { describe, expect, it } from "bun:test";
import type { CardLegality, CardRuling, Oracle } from "../types.ts";
import {
  buildOracleDetail,
  cardmarketUrlForPrinting,
  tcgplayerUrlForPrinting,
} from "../card-detail.ts";
import { makeOracle, makePrinting } from "./fixtures.ts";

const oracle = makeOracle("oracle", {
  name: "Sun Disc",
  slug: "sun-disc",
  might_bonus: 0,
});
const base = makePrinting("base", "oracle", {
  public_slug: "ogn/21/sun-disc",
  prices: { tcgplayer: { normal: 2 } },
});
const alt = makePrinting("alt", "oracle", {
  public_slug: "ven/21a/sun-disc",
  alternate_art: true,
});
const token = makeOracle("token", {
  name: "Sprite",
  slug: "sprite",
  is_token: true,
  preferred_printing: makePrinting("token-print", "token", {
    image: { small: "https://img.example/sprite.webp" },
  }),
});

function provider(overrides: Record<string, unknown> = {}) {
  return {
    async getPrintingsForOracle() { return [base, alt]; },
    async getOracleRelationships() {
      return { makes_tokens: [token], used_by: [], characters: [], signatures: [] };
    },
    ...overrides,
  };
}

describe("marketplace links", () => {
  it("trusts only HTTPS marketplace hosts", () => {
    expect(tcgplayerUrlForPrinting({
      ...base,
      purchase_uris: { tcgplayer: "https://partner.tcgplayer.com/c/1" },
    }, oracle.name)).toContain("partner.tcgplayer.com");
    expect(cardmarketUrlForPrinting({
      ...base,
      purchase_uris: { cardmarket: "http://www.cardmarket.com/unsafe" },
    }, oracle.name)).toContain("Products/Search");
  });

  it("falls back from product id to an exact name search", () => {
    expect(tcgplayerUrlForPrinting({
      ...base,
      external_ids: { tcgplayer_id: "555" },
    }, oracle.name)).toBe("https://www.tcgplayer.com/product/555");
    expect(tcgplayerUrlForPrinting(base, oracle.name)).toContain("q=Sun+Disc");
  });
});

describe("buildOracleDetail", () => {
  it("assembles printings and oracle relationship refs without name deduplication", async () => {
    const detail = await buildOracleDetail(oracle, alt, provider());
    expect(detail.printings.map((printing) => printing.id)).toEqual(["base", "alt"]);
    expect(detail.printing.id).toBe("alt");
    expect(detail.tokens).toEqual([{
      object: "oracle_ref",
      id: "token",
      name: "Sprite",
      slug: "sprite",
      uri: "/api/v1/cards/token",
      riftseer_uri: undefined,
      image_small: "https://img.example/sprite.webp",
    }]);
  });

  it("preserves a real might_bonus of zero", async () => {
    const detail = await buildOracleDetail(oracle, base, provider());
    expect(detail.oracle.might_bonus).toBe(0);
    expect("might_bonus" in detail.oracle).toBe(true);
  });

  it("hydrates oracle and relationship URLs from oracle slugs", async () => {
    const detail = await buildOracleDetail(oracle, base, provider(), {
      siteOrigin: "https://riftseer.com/",
    });
    expect(detail.oracle.riftseer_uri).toBe("https://riftseer.com/card/sun-disc");
    expect(detail.tokens[0]?.riftseer_uri).toBe("https://riftseer.com/card/sprite");
  });

  it("applies the printing transform before selecting the current printing", async () => {
    const detail = await buildOracleDetail(oracle, base, provider(), {
      prepare: (printing) => ({ ...printing, prices: undefined }),
    });
    expect(detail.printing.prices).toBeUndefined();
    expect(detail.printings.every((printing) => printing.prices === undefined)).toBe(true);
  });

  it("uses embedded printings without another provider read", async () => {
    let calls = 0;
    const embedded: Oracle = { ...oracle, printings: [base] };
    const detail = await buildOracleDetail(embedded, base, provider({
      async getPrintingsForOracle() { calls += 1; return []; },
    }));
    expect(calls).toBe(0);
    expect(detail.printings).toEqual([base]);
  });

  it("loads rulings and resolved legalities by printing id", async () => {
    const seen: string[] = [];
    const ruling: CardRuling = { object: "card_ruling", id: "r", type: "ruling", text: "Rule" };
    const legality: CardLegality = {
      object: "card_legality",
      format_id: "f",
      format_code: "standard",
      format_name: "Standard",
      status: "banned",
      scope: "oracle",
    };
    const detail = await buildOracleDetail(oracle, alt, provider({
      async getRulings(id: string) { seen.push(`r:${id}`); return [ruling]; },
      async getLegalities(id: string) { seen.push(`l:${id}`); return [legality]; },
    }));
    expect(seen).toEqual(["r:alt", "l:alt"]);
    expect(detail.rulings).toEqual([ruling]);
    expect(detail.legalities).toEqual([legality]);
  });

  it("degrades supplementary ruling and legality failures to empty arrays", async () => {
    const detail = await buildOracleDetail(oracle, base, provider({
      async getRulings() { throw new Error("missing table"); },
      async getLegalities() { throw new Error("missing table"); },
    }));
    expect(detail.rulings).toEqual([]);
    expect(detail.legalities).toEqual([]);
    expect(detail.printing.id).toBe("base");
  });
});
