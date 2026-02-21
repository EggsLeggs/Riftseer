/**
 * Core provider/normalize tests.
 * normalizeCardName is used by the Supabase provider and the ingest pipeline.
 */

import { describe, it, expect } from "bun:test";
import { normalizeCardName } from "../normalize.ts";

describe("normalizeCardName", () => {
  it("lowercases", () => expect(normalizeCardName("Sun Disc")).toBe("sun disc"));
  it("strips apostrophes", () => expect(normalizeCardName("Ye'dael")).toBe("yedael"));
  it("strips hyphens", () => expect(normalizeCardName("Kai-Sa")).toBe("kaisa"));
  it("collapses extra whitespace", () => expect(normalizeCardName("Sun  Disc")).toBe("sun disc"));
  it("trims", () => expect(normalizeCardName("  Sun Disc  ")).toBe("sun disc"));
});
