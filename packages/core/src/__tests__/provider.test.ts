import { expect, test } from "bun:test";
import { normalizeCardName } from "../normalize.ts";

test("card-name normalization makes punctuation and spacing lookup-stable", () => {
  expect(normalizeCardName("  Thousand-Tailed  Ye'dael  ")).toBe("thousand tailed yedael");
  expect(normalizeCardName("Kai-Sa")).toBe(normalizeCardName("Kai Sa"));
});
