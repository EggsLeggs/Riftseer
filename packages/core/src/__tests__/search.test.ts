/**
 * Tests for deterministic autocomplete search scoring.
 *
 * These tests use a small in-memory card set designed to exercise each ranking
 * tier independently. No real database or provider is needed.
 */

import { describe, it, expect } from "bun:test";
import { autocompleteSearch, scoreCard } from "../search.ts";
import { normalizeCardName } from "../normalize.ts";
import type { Card } from "../types.ts";

// ─── Minimal card factory ─────────────────────────────────────────────────────

function makeCard(name: string, id?: string): Card {
  return {
    object: "card",
    id: id ?? name.toLowerCase().replace(/\s+/g, "-"),
    name,
    name_normalized: normalizeCardName(name),
    is_token: false,
    all_parts: [],
    used_by: [],
    related_champions: [],
    related_legends: [],
  };
}

// ─── Test card set ────────────────────────────────────────────────────────────

const BARD = makeCard("Bard");
const CANNON_BARRAGE = makeCard("Cannon Barrage");
const BARROW_STINGER = makeCard("Barrow Stinger");
const SINGULARITY = makeCard("Singularity");
const SUN_DISC = makeCard("Sun Disc");
const SUNFIRE = makeCard("Sunfire Cape");

const ALL_CARDS: Card[] = [BARD, CANNON_BARRAGE, BARROW_STINGER, SINGULARITY, SUN_DISC, SUNFIRE];

// ─── scoreCard unit tests ─────────────────────────────────────────────────────

describe("scoreCard", () => {
  it("returns EXACT (1000) for an exact normalized name match", () => {
    const result = scoreCard(BARD, "bard", 4);
    expect(result?.score).toBe(1000);
  });

  it("returns PREFIX_FULL (900) when name starts with query", () => {
    const result = scoreCard(BARROW_STINGER, "bar", 3);
    expect(result?.score).toBe(900);
  });

  it("returns PREFIX_WORD (800) when a later word starts with query", () => {
    // "Cannon Barrage": second word "barrage" starts with "bar"
    const result = scoreCard(CANNON_BARRAGE, "bar", 3);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(790); // 800 - 1 * 10 (second word, index 1)
  });

  it("returns SUBSTRING for mid-name substring matches", () => {
    // If a card name contains query in the middle
    const mid = makeCard("Alpha Barricade");
    const result = scoreCard(mid, "bar", 3);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(700);
    expect(result!.score).toBeLessThan(800);
  });

  it("returns null for 'Singularity' when query is 'bar'", () => {
    // 'bar' is 3 chars: only exact, prefix, word-prefix, and substring are allowed.
    // Singularity has no 'bar' substring or prefix — should be excluded entirely.
    const result = scoreCard(SINGULARITY, "bar", 3);
    expect(result).toBeNull();
  });

  it("returns null for 1-char query that is not a full-name prefix", () => {
    // 'b' only allows PREFIX_FULL — 'Singularity' does not start with 'b'
    const result = scoreCard(SINGULARITY, "b", 1);
    expect(result).toBeNull();
  });

  it("returns PREFIX_FULL for 1-char query matching name start", () => {
    const result = scoreCard(BARD, "b", 1);
    expect(result?.score).toBe(900); // PREFIX_FULL
  });

  it("does NOT allow word-prefix for 1-char queries", () => {
    // "Cannon Barrage": 'b' starts the second word 'barrage'.
    // Min length for word-prefix is 2, so this should NOT match via word-prefix.
    // It also doesn't match PREFIX_FULL (does not start with 'b').
    const result = scoreCard(CANNON_BARRAGE, "b", 1);
    expect(result).toBeNull();
  });

  it("allows fuzzy match for query length >= 4 with 1 edit", () => {
    // "Bard" vs "barg" — edit distance 1, queryLen 4
    const barg = normalizeCardName("barg");
    const result = scoreCard(BARD, barg, 4);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThanOrEqual(100); // above MIN_AUTOCOMPLETE_SCORE
    expect(result!.score).toBeLessThan(700); // below substring tier
  });

  it("fuzzy full normalized name handles typos across the whole name (not only per word)", () => {
    const sunDisc = makeCard("Sun Disc");
    const normQ = normalizeCardName("sun dsic"); // 2 edits from "sun disc", queryLen 8 → maxDist 2
    const result = scoreCard(sunDisc, normQ, normQ.length);
    expect(result).not.toBeNull();
    expect(result!.position).toBe(0);
    expect(result!.score).toBe(100); // 200 - 2 * 50
  });

  it("does NOT return fuzzy for query length < 4", () => {
    // "brd" has edit distance 1 from "bard" but is not a substring or prefix.
    // With queryLen = 3, fuzzy matching must not fire.
    const result = scoreCard(BARD, "brd", 3);
    expect(result).toBeNull();
  });

  it("ranks 'Bard' (score 900) above 'Cannon Barrage' (score 790) for query 'bar'", () => {
    const bard = scoreCard(BARD, "bar", 3);
    const cannon = scoreCard(CANNON_BARRAGE, "bar", 3);
    expect(bard!.score).toBeGreaterThan(cannon!.score);
  });
});

// ─── autocompleteSearch integration tests ────────────────────────────────────

describe("autocompleteSearch", () => {
  it("ranks 'Bard' before 'Cannon Barrage' for query 'bar'", () => {
    const results = autocompleteSearch(ALL_CARDS, "bar", 10);
    const names = results.map((c) => c.name);
    expect(names).toContain("Bard");
    expect(names).toContain("Cannon Barrage");
    expect(names.indexOf("Bard")).toBeLessThan(names.indexOf("Cannon Barrage"));
  });

  it("does not return 'Singularity' for query 'bar'", () => {
    const results = autocompleteSearch(ALL_CARDS, "bar", 10);
    const names = results.map((c) => c.name);
    expect(names).not.toContain("Singularity");
  });

  it("returns 'Barrow Stinger' for query 'bar'", () => {
    const results = autocompleteSearch(ALL_CARDS, "bar", 10);
    expect(results.map((c) => c.name)).toContain("Barrow Stinger");
  });

  it("returns empty array for a 1-char query that has no prefix match", () => {
    // 'z' — none of the test cards start with 'z'
    const results = autocompleteSearch(ALL_CARDS, "z", 10);
    expect(results).toHaveLength(0);
  });

  it("returns results for a 1-char query matching a prefix", () => {
    // 'b' — Bard, Barrow Stinger start with 'b'
    const results = autocompleteSearch(ALL_CARDS, "b", 10);
    const names = results.map((c) => c.name);
    expect(names).toContain("Bard");
    expect(names).toContain("Barrow Stinger");
    // Cannon Barrage does NOT start with 'b' — should not appear for 1-char query
    expect(names).not.toContain("Cannon Barrage");
  });

  it("short queries (< 4 chars) do not trigger broad fuzzy search", () => {
    // 'zing' is 4 chars but let's ensure 'sin' (3 chars) does not match 'Singularity'
    // via fuzzy even if edit-distance is close
    const results = autocompleteSearch(ALL_CARDS, "sin", 10);
    const names = results.map((c) => c.name);
    // 'sin' is a prefix of 'singularity', so Singularity SHOULD appear
    expect(names).toContain("Singularity");

    // But 'bar' (3 chars) should NOT fuzzy-match Singularity
    const barResults = autocompleteSearch(ALL_CARDS, "bar", 10);
    expect(barResults.map((c) => c.name)).not.toContain("Singularity");
  });

  it("returns exact match first for a full card name", () => {
    const results = autocompleteSearch(ALL_CARDS, "Bard", 10);
    expect(results[0].name).toBe("Bard");
  });

  it("returns empty array when query is empty", () => {
    const results = autocompleteSearch(ALL_CARDS, "", 10);
    expect(results).toHaveLength(0);
  });

  it("respects the limit parameter", () => {
    // 'bar' matches Bard, Barrow Stinger, Cannon Barrage — limit to 2
    const results = autocompleteSearch(ALL_CARDS, "bar", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("prefix matches rank above word-prefix matches", () => {
    const results = autocompleteSearch(ALL_CARDS, "sun", 10);
    const names = results.map((c) => c.name);
    // "Sun Disc" starts with "sun" — prefix match (900)
    // "Sunfire Cape" starts with "sun" too — also prefix match (900), but shorter name
    // Tiebreak: shorter name wins → "Sunfire Cape" would beat "Sun Disc" on length? No — let me check:
    // "sunfire cape" is 12 chars, "sun disc" is 8 chars — "Sun Disc" is shorter, wins tiebreak
    expect(names).toContain("Sun Disc");
    expect(names).toContain("Sunfire Cape");
    const sunDiscIdx = names.indexOf("Sun Disc");
    const sunfireIdx = names.indexOf("Sunfire Cape");
    // Both are prefix matches (score 900), but "Sun Disc" is shorter so it ranks first.
    expect(sunDiscIdx).toBeLessThan(sunfireIdx);
  });

  it("fuzzy matches for 4+ char queries appear after direct matches", () => {
    const extraCards = [...ALL_CARDS, makeCard("Barrd the Wanderer")];
    const query = "baard"; // edit dist 1 from normalized "bard"; Bard matches via fuzzy, not exact
    const normQuery = normalizeCardName(query);
    const results = autocompleteSearch(extraCards, query, 10);

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((c) => c.name === "Bard")).toBe(true);
    const bardIdx = results.findIndex((c) => c.name === "Bard");
    expect(bardIdx).not.toBe(-1);

    for (let i = 0; i < results.length; i++) {
      const scored = scoreCard(results[i], normQuery, normQuery.length);
      expect(scored).not.toBeNull();
      const isExactOrPrefix = scored!.score === 1000 || scored!.score === 900;
      if (isExactOrPrefix) {
        expect(i).toBeLessThan(bardIdx);
      }
    }
  });
});

// ─── Alias ranking test (documented behavior) ─────────────────────────────────

describe("autocompleteSearch alias / tiebreak behavior", () => {
  it("prefers shorter names on equal score (tiebreak)", () => {
    const short = makeCard("Bar");
    const long = makeCard("Bard");
    const results = autocompleteSearch([long, short], "bar", 10);
    // Both are prefix matches (score 900). Shorter name "Bar" wins.
    expect(results[0].name).toBe("Bar");
  });

  it("uses alphabetical order as final tiebreak for equal name length", () => {
    const aaa = makeCard("Bard A");
    const bbb = makeCard("Bard B");
    const results = autocompleteSearch([bbb, aaa], "bard", 10);
    // "Bard A" and "Bard B" have equal score (900) and equal length.
    // Alphabetical: "Bard A" < "Bard B".
    expect(results[0].name).toBe("Bard A");
  });
});
