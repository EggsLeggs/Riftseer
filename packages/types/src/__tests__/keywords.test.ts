import { describe, expect, it } from "bun:test";
import {
  isKeywordStackConnector,
  isKeywordTag,
  keywordAbsorbsTrailingCosts,
  keywordBaseKey,
  styleForKeyword,
  DEFAULT_KEYWORD_STYLE,
  KEYWORD_TAG_REGEX,
  takeKeywordBadgeCosts,
} from "../keywords.ts";

describe("keywordBaseKey", () => {
  it("lowercases and strips a trailing numeric rank", () => {
    expect(keywordBaseKey("Deflect 3")).toBe("deflect");
    expect(keywordBaseKey("Hunt 2")).toBe("hunt");
    expect(keywordBaseKey("Accelerate")).toBe("accelerate");
  });
});

describe("isKeywordTag", () => {
  it("accepts normal keywords and rejects placeholders", () => {
    expect(isKeywordTag("Accelerate")).toBe(true);
    expect(isKeywordTag("Deflect 3")).toBe(true);
    expect(isKeywordTag("NO TEXT")).toBe(false);
    expect(isKeywordTag("")).toBe(false);
  });
});

describe("isKeywordStackConnector", () => {
  it("recognises stack markers between keyword badges", () => {
    expect(isKeywordStackConnector(">>")).toBe(true);
    expect(isKeywordStackConnector("&gt;&gt;")).toBe(true);
    expect(isKeywordStackConnector("Reaction")).toBe(false);
  });
});

describe("keywordAbsorbsTrailingCosts", () => {
  it("keeps Add resources outside the badge", () => {
    expect(keywordAbsorbsTrailingCosts("Add")).toBe(false);
    expect(keywordAbsorbsTrailingCosts("Empower")).toBe(true);
    expect(keywordAbsorbsTrailingCosts("Equip")).toBe(true);
  });
});

describe("takeKeywordBadgeCosts", () => {
  it("absorbs empower costs but not activated-ability cost runs", () => {
    expect(takeKeywordBadgeCosts(" :rb_energy_3::rb_rune_rainbow: (", 0)).toEqual({
      keys: ["energy_3", "rune_rainbow"],
      end: 31,
    });
    expect(
      takeKeywordBadgeCosts(":rb_energy_2::rb_rune_fury:: Double", 0),
    ).toEqual({
      keys: [],
      end: 0,
    });
  });
});

describe("KEYWORD_TAG_REGEX", () => {
  it("optionally consumes a trailing arrow marker", () => {
    const re = new RegExp(KEYWORD_TAG_REGEX.source, "g");
    const plain =
      "[Action][&gt;] move.[Empowered][>] ready.[Accelerate] alone.";
    const hits: Array<{ label: string; arrow: boolean }> = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(plain)) !== null) {
      hits.push({ label: match[1]!, arrow: match[2] != null });
    }
    expect(hits).toEqual([
      { label: "Action", arrow: true },
      { label: "Empowered", arrow: true },
      { label: "Accelerate", arrow: false },
    ]);
  });
});

describe("styleForKeyword", () => {
  it("maps teal / magenta / olive families", () => {
    expect(styleForKeyword("Accelerate")).toEqual({
      background: "#1CA28A",
      color: "#FFFFFF",
    });
    expect(styleForKeyword("Reaction")).toEqual(styleForKeyword("Accelerate"));
    expect(styleForKeyword("Ambush")).toEqual(styleForKeyword("Accelerate"));
    expect(styleForKeyword("Assault 2")).toEqual({
      background: "#CA356D",
      color: "#FFFFFF",
    });
    expect(styleForKeyword("Tank")).toEqual(styleForKeyword("Assault"));
    expect(styleForKeyword("Backline")).toEqual(styleForKeyword("Assault"));
    expect(styleForKeyword("Temporary")).toEqual({
      background: "#9AB231",
      color: "#000000",
    });
    expect(styleForKeyword("Deflect 3")).toEqual(styleForKeyword("Temporary"));
    expect(styleForKeyword("Empowered")).toEqual(styleForKeyword("Temporary"));
  });

  it("falls back to the grey default for unflavoured keywords", () => {
    expect(styleForKeyword("Add")).toEqual(DEFAULT_KEYWORD_STYLE);
    expect(styleForKeyword("Stun")).toEqual(DEFAULT_KEYWORD_STYLE);
    expect(styleForKeyword("Buff")).toEqual(DEFAULT_KEYWORD_STYLE);
    expect(styleForKeyword("Empower")).toEqual(DEFAULT_KEYWORD_STYLE);
    expect(styleForKeyword("Unique")).toEqual(DEFAULT_KEYWORD_STYLE);
  });
});
