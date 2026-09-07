import { describe, expect, test } from "bun:test";
import { deckBuyLines, formatBuyList, groupBuyLines, tcgplayerMassEntryUrl } from "./deck-buy";

const cards = [
  { name: "Yasuo", quantity: 1, zone: "legend", set_code: "ogn" },
  { name: "Ahri", quantity: 3, zone: "main", set_code: "ogn" },
  { name: "Spare", quantity: 1, zone: "considering", set_code: "ogn" },
];

describe("deckBuyLines", () => {
  test("skips considering unless asked, and can fold in tokens", () => {
    expect(deckBuyLines(cards).map((line) => line.name)).toEqual(["Yasuo", "Ahri"]);
    expect(
      deckBuyLines(cards, [{ name: "Spirit" }], {
        includeTokens: true,
        includeConsidering: true,
      }).map((line) => line.name),
    ).toEqual(["Yasuo", "Ahri", "Spare", "Spirit"]);
  });
});

describe("formatBuyList", () => {
  test("optionally pins a set code", () => {
    const lines = deckBuyLines(cards);
    expect(formatBuyList(lines)).toBe("1 Yasuo\n3 Ahri");
    expect(formatBuyList(lines, true)).toBe("1 Yasuo [OGN]\n3 Ahri [OGN]");
  });
});

describe("tcgplayerMassEntryUrl", () => {
  test("encodes the list for mass entry", () => {
    const url = tcgplayerMassEntryUrl(deckBuyLines(cards));
    expect(url.startsWith("https://www.tcgplayer.com/massentry?")).toBe(true);
    expect(url).toContain("productlineName=Riftbound");
    expect(url).toContain("c=1+Yasuo%7C%7C3+Ahri");
  });
});

describe("groupBuyLines", () => {
  test("keeps zone order", () => {
    expect(groupBuyLines(deckBuyLines(cards)).map((group) => group.key)).toEqual([
      "legend",
      "main",
    ]);
  });
});
