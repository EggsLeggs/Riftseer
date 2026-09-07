import { describe, expect, it } from "bun:test";
import {
  absoluteRiftseerUri,
  cardHref,
  cardPathFromPublicSlug,
  cardSiteUrl,
  normalizeSiteOrigin,
  oracleHref,
} from "../render/index.ts";

describe("site paths", () => {
  it("encodes each slug segment on its own", () => {
    expect(cardPathFromPublicSlug("ogn/21/sun disc")).toBe("/card/ogn/21/sun%20disc");
    expect(cardPathFromPublicSlug("ogn/12a/signature/ye-dael")).toBe(
      "/card/ogn/12a/signature/ye-dael",
    );
  });

  it("prefers the pinned slug and falls back to the id route", () => {
    expect(cardHref({ id: "abc", public_slug: "ogn/1/brush" })).toBe("/card/ogn/1/brush");
    expect(cardHref({ id: "abc", public_slug: null })).toBe("/card/abc");
    expect(cardHref({ id: "a b" })).toBe("/card/a%20b");
  });

  it("routes an oracle by its single-segment slug", () => {
    expect(oracleHref({ slug: "brush" })).toBe("/card/brush");
  });
});

describe("absolute URLs", () => {
  it("strips trailing slashes from the origin", () => {
    expect(normalizeSiteOrigin("https://riftseer.com///")).toBe("https://riftseer.com");
    expect(absoluteRiftseerUri("https://riftseer.com/", "ogn/21/sun disc")).toBe(
      "https://riftseer.com/card/ogn/21/sun%20disc",
    );
  });

  it("is undefined without an origin or a slug", () => {
    expect(absoluteRiftseerUri(undefined, "ogn/21/sun-disc")).toBeUndefined();
    expect(absoluteRiftseerUri("https://riftseer.com", "")).toBeUndefined();
  });
});

describe("cardSiteUrl", () => {
  const oracle = { id: "o1", riftseer_uri: "https://riftseer.com/card/brush" };

  it("prefers the printing's riftseer_uri, then the oracle's", () => {
    expect(
      cardSiteUrl(oracle, { id: "p1", riftseer_uri: "https://riftseer.com/card/ogn/1/brush" }, "x"),
    ).toBe("https://riftseer.com/card/ogn/1/brush");
    expect(cardSiteUrl(oracle, { id: "p1" }, "x")).toBe("https://riftseer.com/card/brush");
    expect(cardSiteUrl(oracle, null, "x")).toBe("https://riftseer.com/card/brush");
  });

  it("falls back to the compatibility route on the given origin", () => {
    expect(cardSiteUrl({ id: "o1" }, { id: "p1" }, "https://riftseer.com/")).toBe(
      "https://riftseer.com/card/p1",
    );
    expect(cardSiteUrl({ id: "o1" }, null, "https://riftseer.com")).toBe(
      "https://riftseer.com/card/o1",
    );
  });
});
