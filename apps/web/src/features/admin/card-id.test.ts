import { describe, expect, test } from "bun:test";
import { generateCardId, isValidCardId } from "./card-id";

describe("generateCardId", () => {
  test("matches the RiftCodex ObjectId shape", () => {
    expect(generateCardId()).toMatch(/^[a-f0-9]{24}$/);
  });

  test("does not repeat across calls", () => {
    const ids = new Set(Array.from({ length: 200 }, generateCardId));
    expect(ids.size).toBe(200);
  });
});

describe("isValidCardId", () => {
  test("accepts a 24-character hex id, trimmed and case-insensitively", () => {
    expect(isValidCardId("67f4064886be8495f7165dd7")).toBe(true);
    expect(isValidCardId("  67F4064886BE8495F7165DD7 ")).toBe(true);
  });

  test("rejects wrong lengths and non-hex characters", () => {
    expect(isValidCardId("67f4064886be8495f7165dd")).toBe(false);
    expect(isValidCardId("67f4064886be8495f7165dd77")).toBe(false);
    expect(isValidCardId("67f4064886be8495f7165ddz")).toBe(false);
    expect(isValidCardId("")).toBe(false);
  });
});
