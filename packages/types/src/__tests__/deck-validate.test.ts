import { describe, expect, test } from "bun:test";
import type { DeckEntry, DeckState, FormatRules, LegalityMap } from "../deck.ts";
import { validateDeck } from "../deck-validate.ts";

// Fixtures use the catalogue's real vocabulary: zones are decided by
// `card_type` ("Legend", "Rune", "Battlefield"), never by `supertype`. The
// previous deck tests built `supertype: "Rune"` / `"Battleground"` fixtures,
// values no card carries, which is why the zone-routing bug stayed green.

function entry(over: Partial<DeckEntry> = {}): DeckEntry {
  return {
    zone: "main",
    oracle_id: "o-unit",
    printing_id: "p-unit",
    quantity: 1,
    name: "Yordle Scout",
    card_type: "Unit",
    domains: ["Fury"],
    ...over,
  };
}

const legend = (over: Partial<DeckEntry> = {}): DeckEntry =>
  entry({
    zone: "legend",
    oracle_id: "o-legend",
    printing_id: "p-legend",
    name: "Volibear",
    card_type: "Legend",
    domains: ["Fury", "Order"],
    ...over,
  });

const champion = (over: Partial<DeckEntry> = {}): DeckEntry =>
  entry({
    oracle_id: "o-vayne",
    printing_id: "p-vayne",
    name: "Vayne",
    card_type: "Unit",
    supertype: "Champion",
    is_champion: true,
    ...over,
  });

const rune = (over: Partial<DeckEntry> = {}): DeckEntry =>
  entry({
    zone: "runes",
    oracle_id: "o-rune",
    printing_id: "p-rune",
    name: "Fury Rune",
    card_type: "Rune",
    ...over,
  });

const battlefield = (over: Partial<DeckEntry> = {}): DeckEntry =>
  entry({
    zone: "battlefields",
    oracle_id: "o-bf",
    printing_id: "p-bf",
    name: "Baron Pit",
    card_type: "Battlefield",
    domains: [],
    ...over,
  });

const STANDARD: FormatRules = {
  zones: [
    { zone: "legend", min_count: 1, max_count: 1 },
    { zone: "main", min_count: 40, max_count: 40, copy_limit: 3 },
    { zone: "sideboard", max_count: 10, copy_limit: 3 },
    // Runes repeat freely; the zone size is the only constraint on copies.
    { zone: "runes", min_count: 12, max_count: 12 },
    { zone: "battlefields", min_count: 3, max_count: 3, copy_limit: 1 },
  ],
};

/** A format with no rows at all — the sandbox that enforces nothing. */
const SANDBOX: FormatRules = { zones: [] };

/** Legend + 40 main (one champion) + 12 runes + 3 battlefields. */
function completeDeck(extra: DeckEntry[] = []): DeckState {
  const main: DeckEntry[] = [champion({ quantity: 3 })];
  for (let i = 0; i < 12; i++) {
    main.push(entry({ oracle_id: `o-${i}`, printing_id: `p-${i}`, name: `Unit ${i}`, quantity: 3 }));
  }
  main.push(entry({ oracle_id: "o-last", printing_id: "p-last", name: "Last", quantity: 1 }));
  return {
    entries: [
      legend(),
      ...main,
      rune({ quantity: 12 }),
      battlefield({ oracle_id: "o-bf1", printing_id: "p-bf1" }),
      battlefield({ oracle_id: "o-bf2", printing_id: "p-bf2" }),
      battlefield({ oracle_id: "o-bf3", printing_id: "p-bf3" }),
      ...extra,
    ],
  };
}

const codes = (state: DeckState, rules?: FormatRules, legalities?: LegalityMap) =>
  validateDeck(state, rules, legalities).map((violation) => violation.code);

describe("deck completeness", () => {
  test("a complete legal deck reports nothing", () => {
    expect(validateDeck(completeDeck(), STANDARD)).toEqual([]);
  });

  test("reports a missing legend", () => {
    const state = { entries: completeDeck().entries.filter((e) => e.zone !== "legend") };
    expect(codes(state, STANDARD)).toContain("no_legend");
  });

  test("reports a missing chosen champion", () => {
    const state = {
      entries: completeDeck().entries.map((e) => ({ ...e, is_champion: false })),
    };
    expect(codes(state, STANDARD)).toContain("no_champion");
  });

  test("a second legend is caught by the format's legend zone rule", () => {
    const state = completeDeck([legend({ oracle_id: "o-legend2", printing_id: "p-legend2" })]);
    const over = validateDeck(state, STANDARD).find((v) => v.code === "zone_over_max");
    expect(over).toMatchObject({ zone: "legend", count: 2, limit: 1 });
  });

  test("legend and champion requirements hold even for a format with no rules", () => {
    expect(codes({ entries: [] }, SANDBOX)).toEqual(["no_legend", "no_champion"]);
  });
});

describe("zone eligibility", () => {
  test("rejects a non-legend in the legend zone", () => {
    const state = completeDeck([entry({ zone: "legend", oracle_id: "o-x", printing_id: "p-x" })]);
    expect(validateDeck(state, STANDARD)).toContainEqual(
      expect.objectContaining({ code: "wrong_zone", zone: "legend", printing_id: "p-x" }),
    );
  });

  test("keeps legends, runes and battlefields out of the main deck", () => {
    for (const card of [legend({ zone: "main" }), rune({ zone: "main" }), battlefield({ zone: "main" })]) {
      const violations = validateDeck({ entries: [card] }, STANDARD);
      expect(violations).toContainEqual(
        expect.objectContaining({ code: "wrong_zone", zone: "main", oracle_id: card.oracle_id }),
      );
    }
  });

  test("routes runes and battlefields to their own zones without complaint", () => {
    expect(codes({ entries: [rune(), battlefield()] }, SANDBOX)).toEqual(["no_legend", "no_champion"]);
  });

  test("a main-deck card may sit in the sideboard or considering", () => {
    const state = completeDeck([
      entry({ zone: "sideboard", oracle_id: "o-side", printing_id: "p-side" }),
      entry({ zone: "considering", oracle_id: "o-maybe", printing_id: "p-maybe" }),
    ]);
    expect(codes(state, STANDARD)).toEqual([]);
  });

  test("anything may be considered, including a token", () => {
    const token = entry({
      zone: "considering",
      oracle_id: "o-token",
      printing_id: "p-token",
      name: "Poro",
      is_token: true,
    });
    expect(codes(completeDeck([token]), STANDARD)).toEqual([]);
  });

  test("a token is never a deck member", () => {
    const token = entry({ oracle_id: "o-token", printing_id: "p-token", is_token: true });
    expect(validateDeck({ entries: [token] }, SANDBOX)).toContainEqual(
      expect.objectContaining({ code: "wrong_zone", printing_id: "p-token" }),
    );
  });

  test("the champion flag only belongs on a main row", () => {
    const state = completeDeck([rune({ oracle_id: "o-r2", printing_id: "p-r2", is_champion: true })]);
    expect(validateDeck(state, STANDARD)).toContainEqual(
      expect.objectContaining({ code: "wrong_zone", zone: "runes", printing_id: "p-r2" }),
    );
  });
});

describe("domains", () => {
  test("requires every card domain to be covered by the legend", () => {
    const state = completeDeck([
      entry({ zone: "sideboard", oracle_id: "o-chaos", printing_id: "p-chaos", domains: ["Chaos"] }),
    ]);
    expect(validateDeck(state, STANDARD)).toContainEqual(
      expect.objectContaining({ code: "domain_not_covered", printing_id: "p-chaos" }),
    );
  });

  test("allows domainless cards", () => {
    const state = completeDeck([
      entry({ zone: "sideboard", oracle_id: "o-neutral", printing_id: "p-neutral", domains: [] }),
      entry({ zone: "sideboard", oracle_id: "o-undef", printing_id: "p-undef", domains: undefined }),
    ]);
    expect(codes(state, STANDARD)).toEqual([]);
  });

  test("checks rune domains too", () => {
    const state = completeDeck();
    state.entries = state.entries.map((e) => (e.zone === "runes" ? { ...e, quantity: 11 } : e));
    state.entries.push(rune({ oracle_id: "o-r2", printing_id: "p-r2", domains: ["Chaos"] }));
    expect(codes(state, STANDARD)).toEqual(["domain_not_covered"]);
  });

  test("considering counts toward nothing, domains included", () => {
    const state = completeDeck([
      entry({ zone: "considering", oracle_id: "o-chaos", printing_id: "p-chaos", domains: ["Chaos"] }),
    ]);
    expect(codes(state, STANDARD)).toEqual([]);
  });

  test("removing the legend produces violations, never a wiped deck", () => {
    const full = completeDeck();
    const state = { entries: full.entries.filter((e) => e.zone !== "legend") };
    const violations = validateDeck(state, STANDARD);
    // The old model cleared main, sideboard, runes and the champion slot here.
    expect(state.entries.length).toBe(full.entries.length - 1);
    expect(violations.map((v) => v.code)).toEqual(["no_legend", "zone_under_min"]);
    // With no legend there is no domain to check against, so nothing is
    // reported as out-of-domain until a new legend is chosen.
    expect(violations.some((v) => v.code === "domain_not_covered")).toBe(false);
  });

  test("swapping in a narrower legend only reports the newly uncovered cards", () => {
    const full = completeDeck([
      entry({ zone: "sideboard", oracle_id: "o-order", printing_id: "p-order", domains: ["Order"] }),
    ]);
    const swapped = {
      entries: full.entries.map((e) =>
        e.zone === "legend" ? legend({ oracle_id: "o-legend2", printing_id: "p-legend2", domains: ["Fury"] }) : e,
      ),
    };
    expect(validateDeck(swapped, STANDARD)).toEqual([
      expect.objectContaining({ code: "domain_not_covered", printing_id: "p-order" }),
    ]);
  });
});

describe("copy limits", () => {
  test("counts by oracle and displays by printing: three copies over two arts", () => {
    const state: DeckState = {
      entries: [
        legend(),
        champion({ printing_id: "p-vayne-a", quantity: 2 }),
        champion({ printing_id: "p-vayne-b", quantity: 1, is_champion: false }),
      ],
    };
    // Three copies, two rows — inside a 3-copy limit.
    expect(codes(state, { zones: [{ zone: "main", copy_limit: 3 }] })).toEqual([]);
  });

  test("a fourth copy across arts exceeds the limit once, keyed by oracle", () => {
    const state: DeckState = {
      entries: [
        legend(),
        champion({ printing_id: "p-vayne-a", quantity: 2 }),
        champion({ printing_id: "p-vayne-b", quantity: 2, is_champion: false }),
      ],
    };
    const violations = validateDeck(state, { zones: [{ zone: "main", copy_limit: 3 }] });
    expect(violations).toEqual([
      expect.objectContaining({
        code: "copy_limit_exceeded",
        oracle_id: "o-vayne",
        count: 4,
        limit: 3,
        severity: "error",
      }),
    ]);
    expect(violations[0]?.printing_id).toBeUndefined();
  });

  test("counts across the whole counting group, not one zone", () => {
    const state: DeckState = {
      entries: [
        legend(),
        champion({ quantity: 2 }),
        champion({ zone: "sideboard", printing_id: "p-vayne-b", quantity: 2, is_champion: false }),
      ],
    };
    expect(codes(state, { zones: [{ zone: "main", copy_limit: 3 }, { zone: "sideboard" }] })).toEqual([
      "copy_limit_exceeded",
    ]);
  });

  test("the group limit is the minimum of its members' limits", () => {
    const state: DeckState = {
      entries: [legend(), champion({ quantity: 2 })],
    };
    const rules: FormatRules = {
      zones: [
        { zone: "main", copy_limit: 3 },
        { zone: "sideboard", copy_limit: 1 },
      ],
    };
    expect(validateDeck(state, rules)).toContainEqual(
      expect.objectContaining({ code: "copy_limit_exceeded", limit: 1, count: 2 }),
    );
  });

  test("copies in considering count toward no limit", () => {
    const state: DeckState = {
      entries: [
        legend(),
        champion({ quantity: 3 }),
        champion({ zone: "considering", printing_id: "p-vayne-c", quantity: 5, is_champion: false }),
      ],
    };
    expect(codes(state, { zones: [{ zone: "main", copy_limit: 3 }] })).toEqual([]);
  });

  test("battlefields are unique through a copy limit of one", () => {
    const state = completeDeck([battlefield({ printing_id: "p-bf1-alt", oracle_id: "o-bf1" })]);
    const violations = validateDeck(state, STANDARD);
    expect(violations.map((v) => v.code)).toContain("copy_limit_exceeded");
    expect(violations.map((v) => v.code)).toContain("zone_over_max");
  });

  test("a format with no copy limit allows any number", () => {
    const state: DeckState = { entries: [legend(), champion({ quantity: 99 })] };
    expect(codes(state, SANDBOX)).toEqual([]);
  });
});

describe("zone sizes", () => {
  test("reports a zone under its minimum", () => {
    const state = completeDeck();
    state.entries = state.entries.filter((e) => e.oracle_id !== "o-last");
    expect(validateDeck(state, STANDARD)).toEqual([
      expect.objectContaining({ code: "zone_under_min", zone: "main", count: 39, limit: 40 }),
    ]);
  });

  test("reports a zone over its maximum instead of silently relocating", () => {
    // The old addCard() spilled main-deck overflow into the sideboard.
    const state = completeDeck([
      entry({ oracle_id: "o-extra", printing_id: "p-extra", quantity: 1 }),
    ]);
    expect(validateDeck(state, STANDARD)).toEqual([
      expect.objectContaining({ code: "zone_over_max", zone: "main", count: 41, limit: 40 }),
    ]);
    expect(state.entries.some((e) => e.zone === "sideboard")).toBe(false);
  });

  test("caps runes and battlefields the same way", () => {
    const overRunes = completeDeck();
    overRunes.entries = overRunes.entries.map((e) => (e.zone === "runes" ? { ...e, quantity: 13 } : e));
    expect(codes(overRunes, STANDARD)).toEqual(["zone_over_max"]);

    const underBattlefields = completeDeck();
    underBattlefields.entries = underBattlefields.entries.filter((e) => e.printing_id !== "p-bf3");
    expect(codes(underBattlefields, STANDARD)).toEqual(["zone_under_min"]);
  });

  test("considering has no size", () => {
    const extras = Array.from({ length: 30 }, (_, i) =>
      entry({ zone: "considering", oracle_id: `o-maybe-${i}`, printing_id: `p-maybe-${i}`, quantity: 4 }),
    );
    expect(codes(completeDeck(extras), STANDARD)).toEqual([]);
  });
});

describe("legality", () => {
  const banned: LegalityMap = { oracles: { "o-vayne": { status: "banned" } } };

  test("names the oracle rung when the card itself is banned", () => {
    const state = completeDeck();
    const violations = validateDeck(state, STANDARD, banned);
    expect(violations).toEqual([
      expect.objectContaining({
        code: "legality",
        severity: "error",
        scope: "oracle",
        status: "banned",
        oracle_id: "o-vayne",
        printing_id: "p-vayne",
      }),
    ]);
    expect(violations[0]?.message).toContain("Vayne");
  });

  test("names the printing rung, because the fix is swapping the art", () => {
    const legalities: LegalityMap = {
      oracles: { "o-vayne": { status: "legal" } },
      printings: { "p-vayne": { status: "banned", note: "misprint" } },
    };
    const violation = validateDeck(completeDeck(), STANDARD, legalities)[0];
    expect(violation).toMatchObject({ code: "legality", scope: "printing", status: "banned" });
    expect(violation?.message).toContain("printing");
  });

  test("a legal oracle row does not rescue a banned printing", () => {
    const legalities: LegalityMap = {
      oracles: { "o-vayne": { status: "legal" } },
      printings: { "p-vayne": { status: "not_legal" } },
    };
    expect(codes(completeDeck(), STANDARD, legalities)).toEqual(["legality"]);
  });

  test("a legal printing row overrides a banned oracle", () => {
    const legalities: LegalityMap = {
      oracles: { "o-vayne": { status: "banned" } },
      printings: { "p-vayne": { status: "legal" } },
    };
    expect(codes(completeDeck(), STANDARD, legalities)).toEqual([]);
  });

  test("restricted lowers that oracle's effective copy limit to one", () => {
    const legalities: LegalityMap = { oracles: { "o-vayne": { status: "restricted" } } };
    const violations = validateDeck(completeDeck(), STANDARD, legalities);
    expect(violations).toEqual([
      expect.objectContaining({ code: "legality", severity: "warning", status: "restricted" }),
      expect.objectContaining({
        code: "copy_limit_exceeded",
        severity: "warning",
        oracle_id: "o-vayne",
        count: 3,
        limit: 1,
      }),
    ]);
  });

  test("a single copy of a restricted card warns but breaks no limit", () => {
    const state = completeDeck();
    state.entries = state.entries.map((e) => (e.oracle_id === "o-vayne" ? { ...e, quantity: 1 } : e));
    state.entries.push(entry({ oracle_id: "o-filler", printing_id: "p-filler", quantity: 2 }));
    const legalities: LegalityMap = { oracles: { "o-vayne": { status: "restricted" } } };
    expect(codes(state, STANDARD, legalities)).toEqual(["legality"]);
  });

  test("a hard copy limit still errors even when the card is restricted", () => {
    const state = completeDeck();
    state.entries = state.entries.map((e) => (e.oracle_id === "o-vayne" ? { ...e, quantity: 4 } : e));
    const legalities: LegalityMap = { oracles: { "o-vayne": { status: "restricted" } } };
    const copy = validateDeck(state, STANDARD, legalities).find(
      (v) => v.code === "copy_limit_exceeded",
    );
    expect(copy).toMatchObject({ severity: "error", limit: 3, count: 4 });
  });

  test("a per-format severity override beats the default mapping", () => {
    const rules: FormatRules = { ...STANDARD, severity_overrides: { banned: "warning" } };
    expect(validateDeck(completeDeck(), rules, banned)).toEqual([
      expect.objectContaining({ code: "legality", severity: "warning", status: "banned" }),
    ]);
  });

  test("an override of none suppresses the violation entirely", () => {
    const rules: FormatRules = { ...STANDARD, severity_overrides: { restricted: "none" } };
    const legalities: LegalityMap = { oracles: { "o-vayne": { status: "restricted" } } };
    expect(validateDeck(completeDeck(), rules, legalities)).toEqual([]);
  });

  test("legality is not checked in considering", () => {
    const state = completeDeck([
      entry({ zone: "considering", oracle_id: "o-nope", printing_id: "p-nope" }),
    ]);
    const legalities: LegalityMap = { oracles: { "o-nope": { status: "banned" } } };
    expect(codes(state, STANDARD, legalities)).toEqual([]);
  });
});

describe("shape", () => {
  test("never throws, whatever it is handed", () => {
    expect(() => validateDeck({ entries: [] })).not.toThrow();
    expect(validateDeck({ entries: [entry({ card_type: undefined, domains: undefined })] })).toEqual([
      expect.objectContaining({ code: "no_legend" }),
      expect.objectContaining({ code: "no_champion" }),
    ]);
  });

  test("three copies of a champion stay three copies, one of them flagged", () => {
    // deck.ts:97-114 stole the first Champion into a separate slot and
    // decremented the quantity, leaving 1 champion + 2 main.
    const state: DeckState = { entries: [legend(), champion({ quantity: 3 })] };
    expect(validateDeck(state, { zones: [{ zone: "main", copy_limit: 3 }] })).toEqual([]);
    expect(state.entries[1]).toMatchObject({ zone: "main", quantity: 3, is_champion: true });
    expect(state.entries).toHaveLength(2);
  });
});
