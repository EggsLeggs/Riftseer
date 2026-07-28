import { describe, expect, it } from "bun:test";
import type { Card } from "../card.ts";
import {
  comparePrintingRefs,
  isReprintPrinting,
  onlyAltArtSiblings,
} from "../printings.ts";

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

describe("onlyAltArtSiblings", () => {
  it("returns true for a base printing with only an alt-art sibling", () => {
    const card = makeCard({
      id: "base",
      name: "Sun Disc",
      related_printings: [
        {
          object: "related_card",
          id: "alt",
          name: "Sun Disc (Alternate Art)",
          component: "printing",
        },
      ],
    });

    expect(onlyAltArtSiblings(card)).toBe(true);
    expect(isReprintPrinting(card)).toBe(false);
  });

  it("returns false for cross-set printings with the same name", () => {
    const card = makeCard({
      id: "ogn",
      name: "Sun Disc",
      set: { set_code: "OGN", set_name: "Origins", published_on: "2025-01-01" },
      related_printings: [
        {
          object: "related_card",
          id: "set2",
          name: "Sun Disc",
          component: "printing",
          set_code: "SET2",
          published_on: "2026-01-01",
        },
      ],
    });

    expect(onlyAltArtSiblings(card)).toBe(false);
  });
});

describe("isReprintPrinting", () => {
  it("marks a later-set printing as a reprint when stub metadata is present", () => {
    const card = makeCard({
      id: "set2",
      name: "Sun Disc",
      set: { set_code: "SET2", set_name: "Set 2", published_on: "2026-01-01" },
      related_printings: [
        {
          object: "related_card",
          id: "ogn",
          name: "Sun Disc",
          component: "printing",
          set_code: "OGN",
          published_on: "2025-01-01",
        },
      ],
    });

    expect(isReprintPrinting(card)).toBe(true);
  });

  it("does not mark the original printing as a reprint", () => {
    const card = makeCard({
      id: "ogn",
      name: "Sun Disc",
      set: { set_code: "OGN", set_name: "Origins", published_on: "2025-01-01" },
      related_printings: [
        {
          object: "related_card",
          id: "set2",
          name: "Sun Disc",
          component: "printing",
          set_code: "SET2",
          published_on: "2026-01-01",
        },
      ],
    });

    expect(isReprintPrinting(card)).toBe(false);
  });

  it("does not mark alt-art printings as reprints", () => {
    const card = makeCard({
      id: "alt",
      name: "Sun Disc (Alternate Art)",
      metadata: { alternate_art: true },
      set: { set_code: "OGN", set_name: "Origins", published_on: "2025-01-01" },
      related_printings: [
        {
          object: "related_card",
          id: "base",
          name: "Sun Disc",
          component: "printing",
          set_code: "OGN",
          published_on: "2025-01-01",
        },
      ],
    });

    expect(isReprintPrinting(card)).toBe(false);
  });

  it("marks a later collector in the same set as a reprint", () => {
    const set = { set_code: "OGN", set_name: "Origins", published_on: "2025-01-01" };
    const card = makeCard({
      id: "260",
      name: "Daisy!",
      collector_number: "260",
      set,
      related_printings: [
        {
          object: "related_card",
          id: "196",
          name: "Daisy!",
          component: "printing",
          set_code: "OGN",
          collector_number: "196",
          published_on: "2025-01-01",
        },
      ],
    });

    expect(isReprintPrinting(card)).toBe(true);
  });

  it("returns false when stubs lack printing metadata", () => {
    const card = makeCard({
      id: "set2",
      name: "Sun Disc",
      related_printings: [
        {
          object: "related_card",
          id: "ogn",
          name: "Sun Disc",
          component: "printing",
        },
      ],
    });

    expect(isReprintPrinting(card)).toBe(false);
  });

  it("does not classify by set_code or id alone without release dates", () => {
    const card = makeCard({
      id: "zzz",
      name: "Sun Disc",
      related_printings: [
        {
          object: "related_card",
          id: "aaa",
          name: "Sun Disc",
          component: "printing",
          set_code: "OGN",
        },
      ],
    });

    expect(isReprintPrinting(card)).toBe(false);
  });
});

describe("comparePrintingRefs", () => {
  it("orders by release date then collector number", () => {
    const older = { published_on: "2025-01-01", collector_number: "12", id: "a" };
    const newer = { published_on: "2026-01-01", collector_number: "12", id: "b" };
    const laterCollector = {
      published_on: "2025-01-01",
      collector_number: "260",
      id: "c",
    };

    expect(comparePrintingRefs(older, newer)).toBeLessThan(0);
    expect(comparePrintingRefs(older, laterCollector)).toBeLessThan(0);
  });
});
