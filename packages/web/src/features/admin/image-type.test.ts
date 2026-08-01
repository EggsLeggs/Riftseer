import { describe, expect, test } from "bun:test";
import {
  detectImageContentType,
  extensionForImageType,
} from "./image-type";

describe("detectImageContentType", () => {
  test("recognises PNG and JPEG magic bytes", () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    expect(detectImageContentType(png.buffer)).toBe("image/png");

    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(detectImageContentType(jpeg.buffer)).toBe("image/jpeg");
  });

  test("rejects unknown bytes", () => {
    expect(detectImageContentType(new Uint8Array([1, 2, 3]).buffer)).toBeNull();
  });
});

describe("extensionForImageType", () => {
  test("maps known types", () => {
    expect(extensionForImageType("image/webp")).toBe("webp");
    expect(extensionForImageType("image/mystery")).toBe("bin");
  });
});
