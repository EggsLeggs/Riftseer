import { describe, it, expect } from "bun:test";
import { parseCardRequests } from "../parser.ts";

describe("parseCardRequests", () => {
  // ── Basic extraction ──────────────────────────────────────────────────────

  it("extracts a single card name", () => {
    const res = parseCardRequests("Have you seen [[Sun Disc]]?");
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ raw: "Sun Disc", name: "Sun Disc" });
  });

  it("extracts multiple card names", () => {
    const res = parseCardRequests("[[Sun Disc]] and [[Stalwart Poro]] are great.");
    expect(res).toHaveLength(2);
    expect(res[0].name).toBe("Sun Disc");
    expect(res[1].name).toBe("Stalwart Poro");
  });

  it("trims whitespace inside brackets", () => {
    const res = parseCardRequests("[[  Sun Disc  ]]");
    expect(res[0].name).toBe("Sun Disc");
  });

  it("returns empty array when no tokens", () => {
    expect(parseCardRequests("No cards here!")).toHaveLength(0);
  });

  it("ignores empty brackets", () => {
    const res = parseCardRequests("[[]] is not a card");
    expect(res).toHaveLength(0);
  });

  // ── Set/collector parsing ─────────────────────────────────────────────────

  it("parses set code with pipe separator", () => {
    const res = parseCardRequests("[[Sun Disc|OGN]]");
    expect(res[0]).toMatchObject({ name: "Sun Disc", set: "OGN" });
    expect(res[0].collector).toBeUndefined();
  });

  it("parses set code with backslash separator", () => {
    const res = parseCardRequests("[[Sun Disc\\OGN]]");
    expect(res[0]).toMatchObject({ name: "Sun Disc", set: "OGN" });
  });

  it("normalises set code to uppercase", () => {
    const res = parseCardRequests("[[Sun Disc|ogn]]");
    expect(res[0].set).toBe("OGN");
  });

  it("parses set + collector with dash", () => {
    const res = parseCardRequests("[[Sun Disc|OGN-021]]");
    expect(res[0]).toMatchObject({ name: "Sun Disc", set: "OGN", collector: "021" });
  });

  it("parses set + collector with space", () => {
    const res = parseCardRequests("[[Sun Disc|OGN 21]]");
    expect(res[0]).toMatchObject({ name: "Sun Disc", set: "OGN", collector: "21" });
  });

  // ── Code block exclusion ──────────────────────────────────────────────────

  it("ignores [[...]] inside fenced code blocks", () => {
    const text = "Look at this:\n```\n[[Sun Disc]]\n```\nNot a card call.";
    expect(parseCardRequests(text)).toHaveLength(0);
  });

  it("ignores [[...]] inside inline code", () => {
    const text = "Type `[[Sun Disc]]` to call a card.";
    expect(parseCardRequests(text)).toHaveLength(0);
  });

  it("still extracts tokens outside code blocks", () => {
    const text = "Try `[[ignore]]` but [[Sun Disc]] is real.";
    const res = parseCardRequests(text);
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe("Sun Disc");
  });

  // ── Token cap ─────────────────────────────────────────────────────────────

  it("caps at 20 tokens", () => {
    const text = Array.from({ length: 25 }, (_, i) => `[[Card ${i}]]`).join(" ");
    const res = parseCardRequests(text);
    expect(res).toHaveLength(20);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("handles multi-word card names", () => {
    const res = parseCardRequests("[[Stand United]]");
    expect(res[0].name).toBe("Stand United");
  });

  it("handles card name with apostrophe (no set)", () => {
    const res = parseCardRequests("[[Ye'dael]]");
    expect(res[0].name).toBe("Ye'dael");
  });

  it("uses the first separator only", () => {
    // "Card|SET|extra" → name=Card, set=SET|EXTRA (treated as set code)
    const res = parseCardRequests("[[Card Name|SET|extra]]");
    expect(res[0].name).toBe("Card Name");
    expect(res[0].set).toBe("SET|EXTRA");
  });

  it("handles newlines in surrounding text", () => {
    const res = parseCardRequests("Hello\n\n[[Sun Disc]]\n\nWorld");
    expect(res[0].name).toBe("Sun Disc");
  });
});
