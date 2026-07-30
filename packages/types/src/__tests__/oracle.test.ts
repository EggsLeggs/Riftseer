import { describe, expect, it } from "bun:test";
import { oracleKeyForName } from "../oracle.ts";

describe("oracleKeyForName", () => {
  it("normalizes a plain name", () => {
    expect(oracleKeyForName("Sun Disc")).toBe("sun disc");
  });

  it("keeps only the first face", () => {
    expect(oracleKeyForName("Sprite (274) // Buff")).toBe("sprite");
    expect(oracleKeyForName("Gold // Buff")).toBe("gold");
  });

  it("strips every trailing parenthetical", () => {
    expect(oracleKeyForName("Ambessa, Matriarch of War (Signature)")).toBe(
      "ambessa matriarch of war",
    );
    expect(oracleKeyForName("Recruit (271) (Alternate Art)")).toBe("recruit");
  });

  it("groups printings of the same card onto one key", () => {
    const keys = new Set([
      oracleKeyForName("Recruit (271) // Buff"),
      oracleKeyForName("Recruit (272) // Buff"),
      oracleKeyForName("Recruit"),
    ]);
    expect(keys.size).toBe(1);
  });

  it("folds punctuation and hyphens the way name lookups do", () => {
    expect(oracleKeyForName("Thousand-Tailed Fox")).toBe("thousand tailed fox");
    expect(oracleKeyForName("Vi's Gauntlets")).toBe("vis gauntlets");
  });

  it("leaves a parenthetical that is not trailing alone", () => {
    expect(oracleKeyForName("Sett (Brawler) Rises")).toBe("sett brawler rises");
  });
});
