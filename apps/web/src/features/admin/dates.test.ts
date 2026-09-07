import { describe, expect, test } from "bun:test";
import { toDateInputValue } from "./dates";

describe("toDateInputValue", () => {
  test("passes a plain ISO date straight through", () => {
    expect(toDateInputValue("2025-10-31")).toBe("2025-10-31");
  });

  test("drops a time component", () => {
    expect(toDateInputValue("2025-10-31T00:00:00.000Z")).toBe("2025-10-31");
  });

  test("treats null, undefined and blanks as unset", () => {
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue(undefined)).toBe("");
    expect(toDateInputValue("   ")).toBe("");
  });

  test("accepts a Date without shifting the calendar day", () => {
    expect(toDateInputValue(new Date(2025, 9, 31))).toBe("2025-10-31");
  });

  test("accepts epoch milliseconds and seconds", () => {
    const ms = new Date(2025, 9, 31, 12).getTime();
    expect(toDateInputValue(ms)).toBe("2025-10-31");
    expect(toDateInputValue(Math.floor(ms / 1000))).toBe("2025-10-31");
  });

  test("falls back to unset instead of throwing on unusable values", () => {
    expect(toDateInputValue("not a date")).toBe("");
    expect(toDateInputValue(new Date("nonsense"))).toBe("");
    expect(toDateInputValue({})).toBe("");
  });
});
