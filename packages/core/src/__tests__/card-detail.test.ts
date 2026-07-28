import { describe, it, expect } from "bun:test";
import type { Card } from "@riftseer/types";
import {
  buildCardDetail,
  cardmarketUrlForCard,
  collectorLabel,
  tcgplayerUrlForCard,
} from "../card-detail.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<Card> & Pick<Card, "id" | "name">): Card {
  return {
    object: "card",
    name_normalized: overrides.name.toLowerCase(),
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

function stub(card: Card, component: string) {
  return {
    object: "related_card" as const,
    id: card.id,
    name: card.name,
    component,
    uri: `/api/v1/cards/${card.id}`,
  };
}

function providerFor(cards: Card[]) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return {
    async getCardsByIds(ids: string[]): Promise<Card[]> {
      return ids.flatMap((id) => {
        const card = byId.get(id);
        return card ? [card] : [];
      });
    },
  };
}

// ─── collectorLabel ───────────────────────────────────────────────────────────

describe("collectorLabel", () => {
  it("marks signature printings with a star", () => {
    const card = makeCard({
      id: "1",
      name: "Sun Disc",
      collector_number: "21",
      metadata: { signature: true },
    });
    expect(collectorLabel(card)).toBe("21★");
  });

  it("marks alternate art with a trailing a", () => {
    const card = makeCard({
      id: "1",
      name: "Sun Disc",
      collector_number: "12",
      metadata: { alternate_art: true },
    });
    expect(collectorLabel(card)).toBe("12a");
  });

  it("returns undefined when there is no collector number", () => {
    expect(collectorLabel(makeCard({ id: "1", name: "Sun Disc" }))).toBeUndefined();
  });
});

// ─── Marketplace links ────────────────────────────────────────────────────────

describe("marketplace links", () => {
  it("prefers a stored TCGPlayer URI, including affiliate deep links", () => {
    const card = makeCard({
      id: "1",
      name: "Sun Disc",
      purchase_uris: {
        tcgplayer: "https://partner.tcgplayer.com/c/123/456/789?u=whatever",
      },
    });
    expect(tcgplayerUrlForCard(card)).toContain("partner.tcgplayer.com");
  });

  it("falls back to the product page when the stored URI is untrusted", () => {
    const card = makeCard({
      id: "1",
      name: "Sun Disc",
      purchase_uris: { tcgplayer: "https://evil.example.com/product/1" },
      external_ids: { tcgplayer_id: "555" },
    });
    expect(tcgplayerUrlForCard(card)).toBe("https://www.tcgplayer.com/product/555");
  });

  it("falls back to a name search when there is no product id", () => {
    const card = makeCard({ id: "1", name: "Sun Disc" });
    expect(tcgplayerUrlForCard(card)).toContain("q=Sun+Disc");
  });

  it("builds an exact-match Cardmarket search when no URI is stored", () => {
    const card = makeCard({ id: "1", name: "Sun Disc" });
    expect(cardmarketUrlForCard(card)).toContain("exactMatch=on");
  });

  it("rejects non-https marketplace URIs", () => {
    const card = makeCard({
      id: "1",
      name: "Sun Disc",
      purchase_uris: { cardmarket: "http://www.cardmarket.com/en/Riftbound" },
    });
    expect(cardmarketUrlForCard(card)).toContain("Products/Search");
  });
});

// ─── buildCardDetail ──────────────────────────────────────────────────────────

describe("buildCardDetail", () => {
  it("includes the current printing, sorted oldest set first", async () => {
    const older = makeCard({
      id: "older",
      name: "Sun Disc",
      collector_number: "21",
      set: { set_code: "OGN", set_name: "Origins", published_on: "2025-01-01" },
      attributes: { energy: 3, might: null, power: 1 },
    });
    const newer = makeCard({
      id: "newer",
      name: "Sun Disc",
      collector_number: "4",
      set: { set_code: "VEN", set_name: "Vendetta", published_on: "2026-01-01" },
      attributes: { energy: 3, might: null, power: 1 },
    });
    newer.related_printings = [stub(older, "printing")];

    const detail = await buildCardDetail(newer, providerFor([older]));

    expect(detail.printings.map((p) => p.id)).toEqual(["older", "newer"]);
    expect(detail.printings.find((p) => p.is_current)?.id).toBe("newer");
    expect(detail.printings[0].is_current).toBeUndefined();
    expect(detail.printings[0]).toMatchObject({ energy: 3, power: 1 });
  });

  it("breaks ties on collector number numerically", async () => {
    const set = { set_code: "OGN", set_name: "Origins", published_on: "2025-01-01" };
    const two = makeCard({ id: "two", name: "Sun Disc", collector_number: "2", set });
    const ten = makeCard({ id: "ten", name: "Sun Disc", collector_number: "10", set });
    two.related_printings = [stub(ten, "printing")];

    const detail = await buildCardDetail(two, providerFor([ten]));

    expect(detail.printings.map((p) => p.collector_number)).toEqual(["2", "10"]);
  });

  it("expands token stubs and ignores other all_parts components", async () => {
    const token = makeCard({ id: "token", name: "Sprite", is_token: true });
    const other = makeCard({ id: "other", name: "Melded Thing" });
    const card = makeCard({ id: "card", name: "Sun Disc" });
    card.all_parts = [stub(token, "token"), stub(other, "meld_part")];

    const detail = await buildCardDetail(card, providerFor([token, other]));

    expect(detail.tokens.map((t) => t.id)).toEqual(["token"]);
    expect(detail.tokens[0].is_token).toBe(true);
  });

  it("collapses champion printings to one row per character", async () => {
    const set = { set_code: "OGN", set_name: "Origins", published_on: "2025-01-01" };
    const plain = makeCard({
      id: "plain",
      name: "Ambessa",
      collector_number: "153",
      set,
    });
    const signature = makeCard({
      id: "signature",
      name: "Ambessa (Signature)",
      collector_number: "196",
      set,
      metadata: { signature: true },
    });
    const otherChampion = makeCard({ id: "bard", name: "Bard", set });
    const legend = makeCard({ id: "legend", name: "Warlord" });
    legend.related_champions = [
      stub(signature, "champion"),
      stub(plain, "champion"),
      stub(otherChampion, "champion"),
    ];

    const detail = await buildCardDetail(
      legend,
      providerFor([plain, signature, otherChampion]),
    );

    expect(detail.champions.map((c) => c.id)).toEqual(["plain", "bard"]);
  });

  it("collapses used_by printings to one preferred row per card", async () => {
    const set = { set_code: "OGN", set_name: "Origins", published_on: "2025-01-01" };
    const plain = makeCard({
      id: "plain",
      name: "Lillia, Bashful Bloom",
      collector_number: "123",
      set,
    });
    const alt = makeCard({
      id: "alt",
      name: "Lillia, Bashful Bloom",
      collector_number: "123",
      set,
      metadata: { alternate_art: true },
    });
    const signature = makeCard({
      id: "signature",
      name: "Lillia, Bashful Bloom (Signature)",
      collector_number: "200",
      set,
      metadata: { signature: true },
    });
    const other = makeCard({
      id: "other",
      name: "Yuumi, Magical Cat",
      collector_number: "50",
      set,
    });
    const token = makeCard({ id: "token", name: "Sprite", is_token: true });
    token.used_by = [
      stub(signature, "token"),
      stub(alt, "token"),
      stub(plain, "token"),
      stub(other, "token"),
    ];

    const detail = await buildCardDetail(
      token,
      providerFor([plain, alt, signature, other]),
    );

    expect(detail.used_by.map((c) => c.id)).toEqual(["plain", "other"]);
  });

  it("drops related ids that no longer resolve", async () => {
    const card = makeCard({ id: "card", name: "Sun Disc" });
    card.related_printings = [
      { object: "related_card", id: "gone", name: "Sun Disc", component: "printing" },
    ];

    const detail = await buildCardDetail(card, providerFor([]));

    expect(detail.printings.map((p) => p.id)).toEqual(["card"]);
  });

  it("applies the prepare transform to expanded cards", async () => {
    const printing = makeCard({
      id: "printing",
      name: "Sun Disc",
      prices: { tcgplayer: { normal: 5 } },
    });
    const card = makeCard({ id: "card", name: "Sun Disc" });
    card.related_printings = [stub(printing, "printing")];

    const detail = await buildCardDetail(card, providerFor([printing]), {
      prepare: (c) => ({ ...c, prices: undefined }),
    });

    expect(detail.printings.find((p) => p.id === "printing")?.prices).toBeUndefined();
  });

  it("computes riftseer_uri for expanded printings from the site origin", async () => {
    const printing = makeCard({
      id: "printing",
      name: "Sun Disc",
      public_slug: "ogn/22a/sun-disc",
    });
    const card = makeCard({ id: "card", name: "Sun Disc" });
    card.related_printings = [stub(printing, "printing")];

    const detail = await buildCardDetail(card, providerFor([printing]), {
      siteOrigin: "https://riftseer.com",
    });

    expect(detail.printings.find((p) => p.id === "printing")?.riftseer_uri).toBe(
      "https://riftseer.com/card/ogn/22a/sun-disc",
    );
  });

  it("expands related_signatures and collapses reprints to one row per name", async () => {
    const set = { set_code: "OGN", set_name: "Origins", published_on: "2025-01-01" };
    const daisy = makeCard({
      id: "daisy",
      name: "Daisy!",
      collector_number: "196",
      set,
      classification: { type: "Unit", supertype: "Signature" },
    });
    const daisyReprint = makeCard({
      id: "daisy-2",
      name: "Daisy!",
      collector_number: "260",
      set,
      classification: { type: "Unit", supertype: "Signature" },
    });
    const legend = makeCard({ id: "legend", name: "Ivern - Green Father" });
    legend.related_signatures = [stub(daisy, "signature"), stub(daisyReprint, "signature")];

    const detail = await buildCardDetail(legend, providerFor([daisy, daisyReprint]));

    expect(detail.signatures.map((c) => c.name)).toEqual(["Daisy!"]);
  });

  it("makes no provider call when there are no related cards", async () => {
    let calls = 0;
    const detail = await buildCardDetail(makeCard({ id: "card", name: "Sun Disc" }), {
      async getCardsByIds() {
        calls += 1;
        return [];
      },
    });

    expect(calls).toBe(0);
    expect(detail.printings).toHaveLength(1);
    expect(detail.tokens).toEqual([]);
    expect(detail.champions).toEqual([]);
  });
});
