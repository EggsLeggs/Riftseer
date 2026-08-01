import { describe, expect, it } from "bun:test";
import type { Printing } from "../card.ts";
import {
  CARD_IMAGE_CDN_HOST,
  adminUploadObjectKey,
  hostedObjectKeyFromUrl,
  isHostedCardImageUrl,
  printingImageDownloadUrl,
  printingImageObjectKeys,
  printingImageUrl,
  printingImageUrls,
} from "../card-image.ts";

const BASE = `https://${CARD_IMAGE_CDN_HOST}`;
const HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function printing(image: Printing["image"]): Pick<Printing, "image"> {
  return { image };
}

describe("hosted URL derivation", () => {
  it("derives every variant from the printing id and hash", () => {
    expect(printingImageUrls(BASE, "abc", HASH)).toEqual({
      small: `${BASE}/cards/abc/small.webp?v=0123456789abcdef`,
      normal: `${BASE}/cards/abc/normal.webp?v=0123456789abcdef`,
      large: `${BASE}/cards/abc/large.webp?v=0123456789abcdef`,
      original: `${BASE}/cards/abc/original?v=0123456789abcdef`,
    });
  });

  // The ?v= suffix is what lets a corrected image bypass immutable CDN caches
  // without changing the object key.
  it("busts the cache when the source hash changes", () => {
    const a = printingImageUrls(BASE, "abc", HASH);
    const b = printingImageUrls(BASE, "abc", `f${HASH.slice(1)}`);
    expect(a.normal).not.toBe(b.normal);
  });

  it("keeps object keys free of the cache-busting suffix", () => {
    expect(printingImageObjectKeys("abc")).toEqual({
      small: "cards/abc/small.webp",
      normal: "cards/abc/normal.webp",
      large: "cards/abc/large.webp",
      original: "cards/abc/original",
    });
    expect(adminUploadObjectKey("abc", HASH)).toBe(`cards/abc/uploads/${HASH}`);
  });

  it("rejects a base URL that is not HTTP(S)", () => {
    expect(() => printingImageUrls("ftp://example.com", "abc", HASH)).toThrow();
  });
});

describe("hostedObjectKeyFromUrl", () => {
  it("maps our own CDN URLs back to R2 keys", () => {
    expect(hostedObjectKeyFromUrl(`${BASE}/cards/abc/normal.webp?v=1`, BASE)).toBe(
      "cards/abc/normal.webp",
    );
  });

  it("returns null for upstream hosts", () => {
    expect(
      hostedObjectKeyFromUrl("https://cdn.riftcodex.com/cards/abc.jpg", BASE),
    ).toBeNull();
  });

  // The prefix is checked on the encoded path and again after decoding, so a
  // URL that only *looks* like it is under cards/ once decoded is rejected —
  // the decoded form is what R2 is ultimately asked for.
  it("rejects a path whose prefix only appears after decoding", () => {
    expect(hostedObjectKeyFromUrl(`${BASE}/%63ards/abc`, BASE)).toBeNull();
    expect(hostedObjectKeyFromUrl(`${BASE}/uploads/abc`, BASE)).toBeNull();
  });

  it("decodes the key it hands to R2", () => {
    expect(hostedObjectKeyFromUrl(`${BASE}/cards/a%20b/normal.webp`, BASE)).toBe(
      "cards/a b/normal.webp",
    );
  });

  it("accepts hosted URLs without a base when using the production host", () => {
    expect(isHostedCardImageUrl(`${BASE}/cards/abc/normal.webp`)).toBe(true);
    expect(isHostedCardImageUrl("https://cdn.riftcodex.com/cards/abc.jpg")).toBe(
      false,
    );
  });
});

describe("printingImageUrl", () => {
  const hosted = printing(printingImageUrls(BASE, "abc", HASH));

  it("picks the requested size", () => {
    expect(printingImageUrl(hosted, "small")).toContain("small.webp");
    expect(printingImageUrl(hosted, "large")).toContain("large.webp");
  });

  // Unhosted art has only `original` — the upstream URL — so every size must
  // still resolve to something rather than leaving a blank card.
  it("falls back along the ladder for unhosted art", () => {
    const upstream = printing({ original: "https://cdn.riftcodex.com/abc.jpg" });
    expect(printingImageUrl(upstream, "small")).toBe(
      "https://cdn.riftcodex.com/abc.jpg",
    );
    expect(printingImageDownloadUrl(upstream)).toBe(
      "https://cdn.riftcodex.com/abc.jpg",
    );
  });

  it("prefers original bytes for downloads", () => {
    expect(printingImageDownloadUrl(hosted)).toContain("/original?");
  });

  it("returns undefined when there is no image at all", () => {
    expect(printingImageUrl(undefined)).toBeUndefined();
    expect(printingImageUrl(printing({}))).toBeUndefined();
  });
});
