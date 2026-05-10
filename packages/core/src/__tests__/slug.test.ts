import { describe, it, expect } from "bun:test";
import {
  slugifyCardName,
  buildPublicSlugSegments,
  joinPublicSlug,
  withNameCollisionSuffix,
  generatePublicSlug,
  absoluteRiftseerUri,
} from "../index.ts";
import type { Card } from "../types.ts";

function makeCard(partial: Partial<Card> & { id: string; name: string }): Card {
  return {
    object: "card",
    name_normalized: partial.name.toLowerCase(),
    is_token: false,
    all_parts: [],
    used_by: [],
    related_champions: [],
    related_legends: [],
    related_printings: [],
    ...partial,
  } as Card;
}

describe("slugifyCardName", () => {
  it("hyphenates and lowercases", () => {
    expect(slugifyCardName("Sun Disc")).toBe("sun-disc");
  });
  it("strips apostrophes without a separator", () => {
    expect(slugifyCardName("Ye'dael")).toBe("yedael");
  });
  it("strips stars and other ornaments", () => {
    expect(slugifyCardName("Farseek ★")).toBe("farseek");
  });
  it("collapses runs and trims edges", () => {
    expect(slugifyCardName("  Sun  --  Disc  ")).toBe("sun-disc");
  });
  it("folds unicode to ascii where possible", () => {
    expect(slugifyCardName("Café")).toBe("cafe");
  });
});

describe("buildPublicSlugSegments", () => {
  it("uses lowercase set + collector + name", () => {
    const card = makeCard({
      id: "1",
      name: "Sun Disc",
      collector_number: "21",
      set: { set_code: "OGN", set_name: "Origins" },
    });
    expect(buildPublicSlugSegments(card)).toEqual(["ogn", "21", "sun-disc"]);
  });

  it("appends `a` to numeric collectors for alternate art", () => {
    const card = makeCard({
      id: "1",
      name: "Sun Disc",
      collector_number: "21",
      set: { set_code: "OGN", set_name: "Origins" },
      metadata: { alternate_art: true },
    });
    expect(buildPublicSlugSegments(card)).toEqual(["ogn", "21a", "sun-disc"]);
  });

  it("does not double-suffix when collector already ends with a non-digit", () => {
    const card = makeCard({
      id: "1",
      name: "Sun Disc",
      collector_number: "21a",
      set: { set_code: "OGN", set_name: "Origins" },
      metadata: { alternate_art: true },
    });
    expect(buildPublicSlugSegments(card)).toEqual(["ogn", "21a", "sun-disc"]);
  });

  it("inserts a `signature` segment before the name", () => {
    const card = makeCard({
      id: "1",
      name: "Sun Disc",
      collector_number: "21",
      set: { set_code: "OGN", set_name: "Origins" },
      metadata: { signature: true },
    });
    expect(buildPublicSlugSegments(card)).toEqual([
      "ogn",
      "21",
      "signature",
      "sun-disc",
    ]);
  });

  it("uses the missing-collector sentinel when collector is empty", () => {
    const card = makeCard({
      id: "1",
      name: "Wild Token",
      collector_number: undefined,
      set: { set_code: "PROMO", set_name: "Promos" },
    });
    expect(buildPublicSlugSegments(card)).toEqual(["promo", "x", "wild-token"]);
  });
});

describe("withNameCollisionSuffix / generatePublicSlug", () => {
  it("appends -2, -3, … to the name segment only", () => {
    expect(withNameCollisionSuffix(["ogn", "21", "sun-disc"], 1)).toEqual([
      "ogn",
      "21",
      "sun-disc",
    ]);
    expect(withNameCollisionSuffix(["ogn", "21", "sun-disc"], 2)).toEqual([
      "ogn",
      "21",
      "sun-disc-2",
    ]);
    expect(withNameCollisionSuffix(["ogn", "21", "signature", "sun-disc"], 3)).toEqual(
      ["ogn", "21", "signature", "sun-disc-3"],
    );
  });

  it("walks attempts until isTaken returns false", () => {
    const card = makeCard({
      id: "1",
      name: "Sun Disc",
      collector_number: "21",
      set: { set_code: "OGN", set_name: "Origins" },
    });
    const taken = new Set(["ogn/21/sun-disc", "ogn/21/sun-disc-2"]);
    expect(generatePublicSlug(card, (s) => taken.has(s))).toBe(
      "ogn/21/sun-disc-3",
    );
  });
});

describe("joinPublicSlug / absoluteRiftseerUri", () => {
  it("joins segments with /", () => {
    expect(joinPublicSlug(["ogn", "21", "sun-disc"])).toBe("ogn/21/sun-disc");
  });
  it("builds an absolute site URL", () => {
    expect(absoluteRiftseerUri("https://riftseer.com", "ogn/21/sun-disc")).toBe(
      "https://riftseer.com/card/ogn/21/sun-disc",
    );
  });
  it("strips trailing slashes from the origin", () => {
    expect(
      absoluteRiftseerUri("https://riftseer.com/", "ogn/21/sun-disc"),
    ).toBe("https://riftseer.com/card/ogn/21/sun-disc");
  });
  it("returns undefined when origin or slug is missing", () => {
    expect(absoluteRiftseerUri(undefined, "ogn/21/sun-disc")).toBeUndefined();
    expect(absoluteRiftseerUri("https://riftseer.com", undefined)).toBeUndefined();
  });
});
