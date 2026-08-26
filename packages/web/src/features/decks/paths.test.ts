import { describe, expect, test } from "bun:test";
import { deckHref, deckJoinHref, deckSlugTail, userDecksHref } from "./paths";

describe("deckSlugTail", () => {
  test("slugifies a name", () => {
    expect(deckSlugTail("Yasuo Fury Aggro")).toBe("yasuo-fury-aggro");
  });

  test("is null when there is nothing to slugify", () => {
    expect(deckSlugTail("")).toBeNull();
    expect(deckSlugTail(null)).toBeNull();
    expect(deckSlugTail(undefined)).toBeNull();
    expect(deckSlugTail("🔥🔥")).toBeNull();
  });

  test("never ends in a hyphen after truncation", () => {
    const tail = deckSlugTail(`${"a".repeat(59)} beyond the cap`);
    expect(tail).not.toBeNull();
    expect(tail!.endsWith("-")).toBe(false);
    expect(tail!.length).toBeLessThanOrEqual(60);
  });
});

describe("deckHref", () => {
  test("is id-first, so the tail is cosmetic", () => {
    expect(deckHref({ id: "abc123", name: "Yasuo Fury" })).toBe(
      "/deck/abc123/yasuo-fury",
    );
  });

  test("renaming changes only the tail, never the resolvable part", () => {
    const before = deckHref({ id: "abc123", name: "Old name" });
    const after = deckHref({ id: "abc123", name: "New name" });
    expect(before).not.toBe(after);
    expect(before.startsWith("/deck/abc123")).toBe(true);
    expect(after.startsWith("/deck/abc123")).toBe(true);
  });

  test("omits the tail entirely when the name yields none", () => {
    expect(deckHref({ id: "abc123", name: "" })).toBe("/deck/abc123");
    expect(deckHref({ id: "abc123" })).toBe("/deck/abc123");
  });

  test("encodes the id", () => {
    expect(deckHref({ id: "a b/c", name: "Deck" })).toBe("/deck/a%20b%2Fc/deck");
  });
});

describe("other deck paths", () => {
  test("encodes invite codes and handles", () => {
    expect(deckJoinHref("ABC/23")).toBe("/deck/join/ABC%2F23");
    expect(userDecksHref("a b")).toBe("/u/a%20b?tab=decks");
  });
});
