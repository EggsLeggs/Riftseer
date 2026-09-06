import { describe, expect, it } from "bun:test";
import {
  absoluteRiftseerUri,
  buildPublicSlugSegments,
  generateOracleSlug,
  generatePublicSlug,
  slugifyCardName,
} from "../index.ts";

const base = {
  id: "aaaaaaaaaaaaaaaaaaaaaaaa",
  name: "Sun Disc",
  setCode: "OGN",
  collectorNumber: "21",
};

describe("stable public slugs", () => {
  it("normalizes punctuation, ornaments, and accents deterministically", () => {
    expect(slugifyCardName("Ye'dael — Café ★")).toBe("yedael-cafe");
    expect(slugifyCardName("  Sun  --  Disc  ")).toBe("sun-disc");
  });

  it("builds printing segments from printing-level fields", () => {
    expect(buildPublicSlugSegments(base)).toEqual(["ogn", "21", "sun-disc"]);
    expect(buildPublicSlugSegments({ ...base, alternateArt: true })).toEqual([
      "ogn", "21a", "sun-disc",
    ]);
    expect(buildPublicSlugSegments({ ...base, signature: true })).toEqual([
      "ogn", "21", "signature", "sun-disc",
    ]);
  });

  it("preserves prefixed collectors and uses a sentinel when missing", () => {
    expect(buildPublicSlugSegments({ ...base, collectorNumber: "SP3" })[1]).toBe("sp3");
    expect(buildPublicSlugSegments({ ...base, collectorNumber: undefined })[1]).toBe("x");
  });

  it("suffixes only the printing name segment on collisions", () => {
    const taken = new Set(["ogn/21/sun-disc", "ogn/21/sun-disc-2"]);
    expect(generatePublicSlug(base, (slug) => taken.has(slug))).toBe("ogn/21/sun-disc-3");
  });

  it("suffixes colliding oracle slugs independently", () => {
    expect(generateOracleSlug("Sun Disc", (slug) => slug !== "sun-disc-3")).toBe("sun-disc-3");
  });

  it("builds encoded absolute URLs and tolerates absent inputs", () => {
    expect(absoluteRiftseerUri("https://riftseer.com/", "ogn/21/sun disc")).toBe(
      "https://riftseer.com/card/ogn/21/sun%20disc",
    );
    expect(absoluteRiftseerUri(undefined, "ogn/21/sun-disc")).toBeUndefined();
  });
});
