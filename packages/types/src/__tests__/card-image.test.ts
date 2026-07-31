import { describe, expect, it } from "bun:test";
import type { CardMedia } from "../card.ts";
import {
  CARD_IMAGE_CDN_HOST,
  cardImageDownloadUrl,
  cardImageUrl,
  hasHostedCardMedia,
  isHostedCardImageUrl,
} from "../card-image.ts";

const hosted: CardMedia = {
  media_urls: {
    small: `https://${CARD_IMAGE_CDN_HOST}/cards/abc/small.webp?v=1`,
    normal: `https://${CARD_IMAGE_CDN_HOST}/cards/abc/normal.webp?v=1`,
    large: `https://${CARD_IMAGE_CDN_HOST}/cards/abc/large.webp?v=1`,
    original: `https://${CARD_IMAGE_CDN_HOST}/cards/abc/original?v=1`,
  },
};

const upstream: CardMedia = {
  media_urls: {
    small: "https://cdn.riftcodex.com/cards/abc_small.jpg",
    normal: "https://cdn.riftcodex.com/cards/abc.jpg",
    large: "https://cdn.riftcodex.com/cards/abc_large.jpg",
    png: "https://cdn.riftcodex.com/cards/abc.png",
  },
};

describe("isHostedCardImageUrl", () => {
  it("accepts img.riftseer.com /cards/ paths", () => {
    expect(
      isHostedCardImageUrl(
        `https://${CARD_IMAGE_CDN_HOST}/cards/abc/normal.webp`,
      ),
    ).toBe(true);
  });

  it("rejects upstream hosts", () => {
    expect(
      isHostedCardImageUrl("https://cdn.riftcodex.com/cards/abc.jpg"),
    ).toBe(false);
  });
});

describe("hasHostedCardMedia", () => {
  it("detects hosted variants", () => {
    expect(hasHostedCardMedia(hosted)).toBe(true);
    expect(hasHostedCardMedia(upstream)).toBe(false);
    expect(hasHostedCardMedia(undefined)).toBe(false);
  });
});

describe("cardImageUrl", () => {
  it("picks the requested CDN size", () => {
    expect(cardImageUrl(hosted, "small")).toBe(hosted.media_urls!.small);
    expect(cardImageUrl(hosted, "normal")).toBe(hosted.media_urls!.normal);
    expect(cardImageUrl(hosted, "large")).toBe(hosted.media_urls!.large);
  });

  it("falls back along the size ladder for hosted media", () => {
    const missingSmall: CardMedia = {
      media_urls: {
        normal: hosted.media_urls!.normal,
        large: hosted.media_urls!.large,
      },
    };
    expect(cardImageUrl(missingSmall, "small")).toBe(
      hosted.media_urls!.normal,
    );
  });

  it("ignores size for unmigrated upstream art", () => {
    expect(cardImageUrl(upstream, "small")).toBe(upstream.media_urls!.normal);
    expect(cardImageUrl(upstream, "large")).toBe(upstream.media_urls!.normal);
    expect(cardImageUrl(upstream)).toBe(upstream.media_urls!.normal);
  });

  it("returns undefined when media is empty", () => {
    expect(cardImageUrl(undefined)).toBeUndefined();
    expect(cardImageUrl({ media_urls: {} })).toBeUndefined();
  });
});

describe("cardImageDownloadUrl", () => {
  it("prefers original for hosted media", () => {
    expect(cardImageDownloadUrl(hosted)).toBe(hosted.media_urls!.original);
  });

  it("prefers png for upstream media", () => {
    expect(cardImageDownloadUrl(upstream)).toBe(upstream.media_urls!.png);
  });
});
