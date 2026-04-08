import { describe, expect, test } from "bun:test";
import { normalizeApiOrigin } from "./api.ts";

describe("normalizeApiOrigin", () => {
  test("returns plain origin unchanged", () => {
    expect(normalizeApiOrigin("https://host.com")).toBe("https://host.com");
  });

  test("strips trailing /api", () => {
    expect(normalizeApiOrigin("https://host.com/api")).toBe("https://host.com");
  });

  test("strips trailing /api/v1", () => {
    expect(normalizeApiOrigin("https://host.com/api/v1")).toBe("https://host.com");
  });

  test("strips trailing slashes", () => {
    expect(normalizeApiOrigin("https://host.com/")).toBe("https://host.com");
    expect(normalizeApiOrigin("https://host.com///")).toBe("https://host.com");
  });

  test("strips trailing /api/ (slash after /api)", () => {
    expect(normalizeApiOrigin("https://host.com/api/")).toBe("https://host.com");
  });

  test("strips trailing /api/v1/ (slash after /api/v1)", () => {
    expect(normalizeApiOrigin("https://host.com/api/v1/")).toBe("https://host.com");
  });

  test("strips surrounding whitespace", () => {
    expect(normalizeApiOrigin("  https://host.com  ")).toBe("https://host.com");
  });

  test("strips whitespace and /api/v1", () => {
    expect(normalizeApiOrigin(" https://host.com/api/v1/ ")).toBe("https://host.com");
  });

  test("leaves unrelated paths intact", () => {
    expect(normalizeApiOrigin("https://host.com/other")).toBe("https://host.com/other");
  });
});
