import { describe, expect, test } from "bun:test";
import {
  COUNTING_GROUPS,
  DECK_ZONES,
  DEFAULT_LEGALITY_SEVERITY,
  groupCopyLimit,
  legalitySeverity,
  resolveLegality,
  zoneForCard,
  zoneRuleFor,
  type FormatRules,
} from "../deck.ts";

describe("deck zones", () => {
  test("considering belongs to no counting group", () => {
    const grouped = COUNTING_GROUPS.flat();
    expect(grouped).not.toContain("considering");
    for (const zone of DECK_ZONES) {
      if (zone === "considering") continue;
      expect(grouped).toContain(zone);
    }
  });

  test("each zone is counted by at most one group", () => {
    const grouped = COUNTING_GROUPS.flat();
    expect(new Set(grouped).size).toBe(grouped.length);
  });
});

describe("zoneForCard", () => {
  test("routes runes and battlefields on card_type, the real catalogue vocabulary", () => {
    expect(zoneForCard("Rune")).toEqual(["runes", "considering"]);
    expect(zoneForCard("Battlefield")).toEqual(["battlefields", "considering"]);
  });

  test("ignores supertype, which the previous model routed on", () => {
    // `supertype: "Rune"` / `"Battleground"` are values the catalogue does not
    // contain; a card carrying them is still routed by its card_type.
    expect(zoneForCard("Unit", "Rune")).toEqual(["main", "sideboard", "considering"]);
    expect(zoneForCard("Unit", "Battleground")).toEqual(["main", "sideboard", "considering"]);
    expect(zoneForCard("Rune", "Champion")).toEqual(["runes", "considering"]);
  });

  test("trims and lowercases the type", () => {
    expect(zoneForCard("  bAttleField ")).toEqual(["battlefields", "considering"]);
    expect(zoneForCard("LEGEND")).toEqual(["legend"]);
  });

  test("a legend is eligible for the legend zone only", () => {
    expect(zoneForCard("Legend")).toEqual(["legend"]);
  });

  test("tokens are eligible for considering only, however they are marked", () => {
    expect(zoneForCard("Unit", null, true)).toEqual(["considering"]);
    expect(zoneForCard("Token")).toEqual(["considering"]);
    expect(zoneForCard("Unit", "Token")).toEqual(["considering"]);
    expect(zoneForCard("Battlefield", null, true)).toEqual(["considering"]);
  });

  test("anything else is a main-deck card", () => {
    expect(zoneForCard("Unit")).toEqual(["main", "sideboard", "considering"]);
    expect(zoneForCard("Spell")).toEqual(["main", "sideboard", "considering"]);
    expect(zoneForCard(undefined)).toEqual(["main", "sideboard", "considering"]);
  });
});

describe("legality", () => {
  test("the default severity mapping is the single definition", () => {
    expect(DEFAULT_LEGALITY_SEVERITY).toEqual({
      legal: "none",
      restricted: "warning",
      not_legal: "error",
      banned: "error",
    });
  });

  test("resolves printing row, then oracle row, then default legal", () => {
    const legalities = {
      printings: { "p-banned": { status: "banned" as const } },
      oracles: { "o-vayne": { status: "not_legal" as const, note: "out of pool" } },
    };
    expect(resolveLegality(legalities, "o-vayne", "p-banned")).toEqual({
      status: "banned",
      scope: "printing",
      note: undefined,
    });
    expect(resolveLegality(legalities, "o-vayne", "p-other")).toEqual({
      status: "not_legal",
      scope: "oracle",
      note: "out of pool",
    });
    expect(resolveLegality(legalities, "o-other", "p-other")).toEqual({
      status: "legal",
      scope: "default",
    });
    expect(resolveLegality(undefined, "o", "p").scope).toBe("default");
  });

  test("per-format overrides beat the default mapping", () => {
    expect(legalitySeverity("not_legal")).toBe("error");
    expect(legalitySeverity("not_legal", { not_legal: "warning" })).toBe("warning");
    expect(legalitySeverity("banned", { not_legal: "warning" })).toBe("error");
  });
});

describe("format rules", () => {
  const rules: FormatRules = {
    zones: [
      { zone: "main", copy_limit: 3, max_count: 40 },
      { zone: "sideboard", copy_limit: 2 },
      { zone: "runes", min_count: 12 },
    ],
  };

  test("a group's copy limit is the minimum of its members' non-null limits", () => {
    expect(groupCopyLimit(rules, ["legend", "main", "sideboard"])).toBe(2);
    expect(groupCopyLimit(rules, ["runes"])).toBeNull();
    expect(groupCopyLimit(rules, ["battlefields"])).toBeNull();
    expect(groupCopyLimit({ zones: [] }, ["main"])).toBeNull();
  });

  test("a zone with no rule is unconstrained", () => {
    expect(zoneRuleFor(rules, "battlefields")).toBeUndefined();
    expect(zoneRuleFor(rules, "main")?.max_count).toBe(40);
  });
});
