/**
 * Core provider/normalize tests.
 * normalizeCardName is used by the Supabase provider and the ingest pipeline.
 */

import { describe, it, expect } from "bun:test";
import { normalizeCardName } from "../normalize.ts";

describe("normalizeCardName", () => {
  it("lowercases", () => expect(normalizeCardName("Sun Disc")).toBe("sun disc"));
  it("strips apostrophes", () => expect(normalizeCardName("Ye'dael")).toBe("yedael"));
  it("converts hyphens to spaces", () => expect(normalizeCardName("Thousand-Tailed Watcher")).toBe("thousand tailed watcher"));
  it("hyphen and space produce same result", () => expect(normalizeCardName("Kai-Sa")).toBe(normalizeCardName("Kai Sa")));
  it("collapses extra whitespace", () => expect(normalizeCardName("Sun  Disc")).toBe("sun disc"));
  it("trims", () => expect(normalizeCardName("  Sun Disc  ")).toBe("sun disc"));
});
