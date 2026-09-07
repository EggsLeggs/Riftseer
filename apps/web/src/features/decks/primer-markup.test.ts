import { describe, expect, test } from "bun:test";
import { parseMentionHref, primerMarkup } from "./primer-markup";

describe("primerMarkup", () => {
  test("text with no tokens passes through untouched", () => {
    const text = "## Plan\n\nGo aggressive early.";
    expect(primerMarkup(text)).toEqual({ markdown: text, mentions: [] });
  });

  test("a mention becomes a link and lands in the table", () => {
    const { markdown, mentions } = primerMarkup("Lead with [[Vayne]] on curve.");
    expect(markdown).toBe("Lead with [Vayne](#card:0) on curve.");
    expect(mentions).toEqual([{ kind: "card", raw: "Vayne", label: "Vayne", embed: false }]);
  });

  test("an embed keeps its own marker and drops the bang", () => {
    const { markdown, mentions } = primerMarkup("![[Vayne|VEN-SP3]]");
    expect(markdown).toBe("[Vayne](#card-embed:0)");
    expect(mentions).toEqual([{ kind: "card", raw: "Vayne|VEN-SP3", label: "Vayne", embed: true }]);
  });

  test("the label is the parsed name, not the whole token", () => {
    const { markdown } = primerMarkup("[[Ryze's Rune|OGN-042]]");
    expect(markdown).toBe("[Ryze's Rune](#card:0)");
  });

  test("a user mention becomes a profile link", () => {
    const { markdown, mentions } = primerMarkup("Ask [@amory] about the curve.");
    expect(markdown).toBe("Ask [@amory](#user:0) about the curve.");
    expect(mentions).toEqual([{ kind: "user", handle: "amory" }]);
  });

  test("tokens inside code spans stay literal", () => {
    const text = "Type `[[Vayne]]` in chat.\n\n```\n[[Yasuo]]\n```\n\n[[Garen]]";
    const { markdown, mentions } = primerMarkup(text);
    expect(mentions.map((m) => (m.kind === "card" ? m.raw : m.handle))).toEqual(["Garen"]);
    expect(markdown).toContain("`[[Vayne]]`");
    expect(markdown).toContain("[[Yasuo]]");
    expect(markdown).toContain("[Garen](#card:0)");
  });

  test("an empty token is left alone", () => {
    const { markdown, mentions } = primerMarkup("[[ ]] and [[Vayne]]");
    expect(mentions).toHaveLength(1);
    expect(markdown).toContain("[[ ]]");
  });
});

describe("parseMentionHref", () => {
  test("round-trips both kinds and rejects everything else", () => {
    expect(parseMentionHref("#card:3")).toEqual({ index: 3, kind: "card" });
    expect(parseMentionHref("#card-embed:0")).toEqual({
      index: 0,
      kind: "card-embed",
    });
    expect(parseMentionHref("#user:1")).toEqual({ index: 1, kind: "user" });
    expect(parseMentionHref("https://example.com")).toBeNull();
    expect(parseMentionHref("#card:x")).toBeNull();
    expect(parseMentionHref(undefined)).toBeNull();
  });
});
