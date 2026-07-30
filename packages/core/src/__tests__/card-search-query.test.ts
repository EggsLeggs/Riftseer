import { describe, it, expect } from "bun:test";
import {
  BadCardSearchQueryError,
  CARD_SEARCH_LIMITS,
  andAst,
  exactNameLeaf,
  filterLeaf,
  findTextLeafValue,
  isExactNameOnly,
  isLegacyTextOnly,
  notAst,
  orAst,
  parseCardSearchQuery,
  requiresRpc,
  textLeaf,
  validateCardSearchAst,
  type CardSearchAst,
} from "../card-search-query.ts";

function ast(input: string): CardSearchAst | null {
  return parseCardSearchQuery(input).ast;
}

describe("parseCardSearchQuery", () => {
  // ── Empty / trivial ────────────────────────────────────────────────────────

  it("returns null AST for empty input", () => {
    expect(ast("")).toBeNull();
    expect(ast("   ")).toBeNull();
  });

  // ── Plain text ────────────────────────────────────────────────────────────

  it("parses a single bare word as a text leaf", () => {
    expect(ast("bard")).toEqual({ op: "text", value: "bard" });
  });

  it("merges adjacent text words into a single text leaf", () => {
    expect(ast("bard fish")).toEqual({ op: "text", value: "bard fish" });
  });

  it("parses a quoted phrase as a single text leaf", () => {
    expect(ast('"sun disc"')).toEqual({ op: "text", value: "sun disc" });
  });

  // ── Exact name (`!`) ──────────────────────────────────────────────────────

  it("parses ! as exact_name (normalized)", () => {
    expect(ast("!Sun")).toEqual({ op: "exact_name", value: "sun" });
  });

  it("parses !\"multi word\" as a normalized exact_name", () => {
    expect(ast('!"Sun Disc"')).toEqual({ op: "exact_name", value: "sun disc" });
  });

  // ── Filters ───────────────────────────────────────────────────────────────

  it("parses t:legend as a type filter", () => {
    expect(ast("t:legend")).toEqual({
      op: "filter",
      field: "type",
      value: "legend",
    });
  });

  it('parses t:"legend" the same as t:legend', () => {
    expect(ast('t:"legend"')).toEqual({
      op: "filter",
      field: "type",
      value: "legend",
    });
  });

  it("parses a:foo and r:rare as artist/rarity filters", () => {
    expect(ast("a:foo")).toEqual({ op: "filter", field: "artist", value: "foo" });
    expect(ast("r:rare")).toEqual({ op: "filter", field: "rarity", value: "rare" });
  });

  it("supports the long form field names artist/type/rarity", () => {
    expect(ast("artist:foo")).toEqual({
      op: "filter",
      field: "artist",
      value: "foo",
    });
    expect(ast("type:legend")).toEqual({
      op: "filter",
      field: "type",
      value: "legend",
    });
    expect(ast("rarity:rare")).toEqual({
      op: "filter",
      field: "rarity",
      value: "rare",
    });
  });

  it("supports quoted values with spaces", () => {
    expect(ast('a:"john avon"')).toEqual({
      op: "filter",
      field: "artist",
      value: "john avon",
    });
  });

  it("rejects unknown filter fields", () => {
    expect(() => ast("foo:bar")).toThrow(BadCardSearchQueryError);
  });

  // ── Mixing text + filters ─────────────────────────────────────────────────

  it("combines free text and a filter via implicit AND", () => {
    expect(ast('bard t:"legend"')).toEqual({
      op: "and",
      children: [
        { op: "text", value: "bard" },
        { op: "filter", field: "type", value: "legend" },
      ],
    });
  });

  // ── Negation (`-`) ────────────────────────────────────────────────────────

  it("parses -t:foo as NOT(filter)", () => {
    expect(ast("-t:foo")).toEqual({
      op: "not",
      child: { op: "filter", field: "type", value: "foo" },
    });
  });

  it("parses -(t:a or t:b) as NOT of an OR group", () => {
    expect(ast("-(t:a or t:b)")).toEqual({
      op: "not",
      child: {
        op: "or",
        children: [
          { op: "filter", field: "type", value: "a" },
          { op: "filter", field: "type", value: "b" },
        ],
      },
    });
  });

  it("collapses double negation", () => {
    expect(ast("--t:foo")).toEqual({
      op: "filter",
      field: "type",
      value: "foo",
    });
  });

  it("keeps hyphens inside a bare word as one text token (minus is only at token boundaries)", () => {
    expect(ast("sun-disc")).toEqual({ op: "text", value: "sun-disc" });
  });

  it("errors when '-' is not followed by an operand (e.g. before ')')", () => {
    expect(() => ast("-)")).toThrow(BadCardSearchQueryError);
  });

  // ── Boolean ops ───────────────────────────────────────────────────────────

  it("parses `t:a or t:b` as OR of two filters", () => {
    expect(ast("t:fish or t:bird")).toEqual({
      op: "or",
      children: [
        { op: "filter", field: "type", value: "fish" },
        { op: "filter", field: "type", value: "bird" },
      ],
    });
  });

  it("parses Scryfall-style grouped expression", () => {
    expect(ast("t:land (a:titus or a:avon)")).toEqual({
      op: "and",
      children: [
        { op: "filter", field: "type", value: "land" },
        {
          op: "or",
          children: [
            { op: "filter", field: "artist", value: "titus" },
            { op: "filter", field: "artist", value: "avon" },
          ],
        },
      ],
    });
  });

  it("respects implicit-AND-tighter-than-OR precedence", () => {
    // `a or b c` → OR(a, AND(b, c))
    expect(ast("t:a or t:b t:c")).toEqual({
      op: "or",
      children: [
        { op: "filter", field: "type", value: "a" },
        {
          op: "and",
          children: [
            { op: "filter", field: "type", value: "b" },
            { op: "filter", field: "type", value: "c" },
          ],
        },
      ],
    });
  });

  it("flattens nested ANDs and ORs", () => {
    const tree = ast("t:a t:b t:c");
    expect(tree).toEqual({
      op: "and",
      children: [
        { op: "filter", field: "type", value: "a" },
        { op: "filter", field: "type", value: "b" },
        { op: "filter", field: "type", value: "c" },
      ],
    });
  });

  // ── Errors ────────────────────────────────────────────────────────────────

  it("rejects unbalanced parentheses", () => {
    expect(() => ast("(t:a")).toThrow(BadCardSearchQueryError);
  });

  it("rejects oversized inputs", () => {
    const huge = "a:".padEnd(CARD_SEARCH_LIMITS.maxInputLength + 1, "x");
    expect(() => parseCardSearchQuery(huge)).toThrow(BadCardSearchQueryError);
  });

  it("rejects unterminated quoted strings", () => {
    expect(() => ast('!"unterminated')).toThrow(BadCardSearchQueryError);
  });
});

describe("AST builders", () => {
  it("andAst returns null for all-empty input", () => {
    expect(andAst()).toBeNull();
    expect(andAst(null, undefined)).toBeNull();
  });

  it("andAst flattens nested ANDs and merges sibling text leaves", () => {
    const a = andAst(textLeaf("foo"), textLeaf("bar"), filterLeaf("type", "x"));
    expect(a).toEqual({
      op: "and",
      children: [
        { op: "text", value: "foo bar" },
        { op: "filter", field: "type", value: "x" },
      ],
    });
  });

  it("orAst flattens nested ORs", () => {
    const o = orAst(filterLeaf("type", "a"), orAst(filterLeaf("type", "b"), filterLeaf("type", "c")));
    expect(o).toEqual({
      op: "or",
      children: [
        { op: "filter", field: "type", value: "a" },
        { op: "filter", field: "type", value: "b" },
        { op: "filter", field: "type", value: "c" },
      ],
    });
  });

  it("notAst collapses double negation", () => {
    const n = notAst(notAst(filterLeaf("type", "x")));
    expect(n).toEqual({ op: "filter", field: "type", value: "x" });
  });

  it("exactNameLeaf normalizes the value", () => {
    expect(exactNameLeaf("Sun-Disc")).toEqual({
      op: "exact_name",
      value: "sun disc",
    });
  });
});

describe("validateCardSearchAst", () => {
  it("accepts a small AST", () => {
    expect(() =>
      validateCardSearchAst({ op: "filter", field: "type", value: "legend" }),
    ).not.toThrow();
  });

  it("rejects unsupported filter fields", () => {
    expect(() =>
      validateCardSearchAst({
        op: "filter",
        // @ts-expect-error - intentional bad field
        field: "flavour",
        value: "x",
      }),
    ).toThrow(BadCardSearchQueryError);
  });

  it("rejects oversized leaf values", () => {
    const big = "x".repeat(CARD_SEARCH_LIMITS.maxLeafValueLength + 1);
    expect(() =>
      validateCardSearchAst({ op: "text", value: big }),
    ).toThrow(BadCardSearchQueryError);
  });

  it("rejects too-deep ASTs", () => {
    let inner: CardSearchAst = { op: "text", value: "x" };
    for (let i = 0; i < CARD_SEARCH_LIMITS.maxAstDepth + 2; i++) {
      inner = { op: "not", child: inner };
    }
    expect(() => validateCardSearchAst(inner)).toThrow(BadCardSearchQueryError);
  });
});

describe("routing predicates", () => {
  it("isExactNameOnly only true for a lone exact_name leaf", () => {
    expect(isExactNameOnly({ op: "exact_name", value: "x" })).toBe(true);
    expect(isExactNameOnly({ op: "text", value: "x" })).toBe(false);
    expect(
      isExactNameOnly({
        op: "and",
        children: [
          { op: "exact_name", value: "x" },
          { op: "filter", field: "type", value: "y" },
        ],
      }),
    ).toBe(false);
  });

  it("isLegacyTextOnly is true only for a lone text leaf", () => {
    expect(isLegacyTextOnly({ op: "text", value: "x" })).toBe(true);
    expect(isLegacyTextOnly({ op: "exact_name", value: "x" })).toBe(false);
  });

  it("requiresRpc is false for a leaf or simple AND of leaves and NOT-leaves", () => {
    expect(requiresRpc({ op: "filter", field: "type", value: "a" })).toBe(false);
    expect(
      requiresRpc({
        op: "and",
        children: [
          { op: "filter", field: "type", value: "a" },
          { op: "not", child: { op: "filter", field: "rarity", value: "rare" } },
        ],
      }),
    ).toBe(false);
  });

  it("requiresRpc is true for any OR or grouped NOT", () => {
    expect(
      requiresRpc({
        op: "or",
        children: [
          { op: "filter", field: "type", value: "a" },
          { op: "filter", field: "type", value: "b" },
        ],
      }),
    ).toBe(true);
    expect(
      requiresRpc({
        op: "not",
        child: {
          op: "or",
          children: [
            { op: "filter", field: "type", value: "a" },
            { op: "filter", field: "type", value: "b" },
          ],
        },
      }),
    ).toBe(true);
  });
});

describe("findTextLeafValue", () => {
  it("returns the text value when present in an AND", () => {
    const tree = ast('bard t:"legend"');
    expect(findTextLeafValue(tree!)).toBe("bard");
  });

  it("returns null when no text leaf is present", () => {
    const tree = ast("t:legend a:foo");
    expect(findTextLeafValue(tree!)).toBeNull();
  });
});

// ─── v2 grammar: keywords, domains, numerics, legality, flags ────────────────

describe("keyword, domain and tag filters", () => {
  it("folds keyword values to their base key", () => {
    expect(ast("kw:Deflect")).toEqual({
      op: "filter",
      field: "keyword",
      value: "deflect",
    });
    // The printed number is part of the badge, not the keyword identity.
    expect(ast('kw:"Deflect 3"')).toEqual(ast("kw:deflect"));
    expect(ast("keyword:deathknell")).toEqual(ast("kw:deathknell"));
  });

  it("filters domains and tags", () => {
    expect(ast("d:fury")).toEqual({
      op: "filter",
      field: "domain",
      value: "fury",
    });
    expect(ast("domain:Order")).toEqual({
      op: "filter",
      field: "domain",
      value: "Order",
    });
    expect(ast("tag:poro")).toEqual({
      op: "filter",
      field: "tag",
      value: "poro",
    });
  });

  it("expands unquoted comma lists to OR", () => {
    expect(ast("d:fury,order")).toEqual({
      op: "or",
      children: [
        { op: "filter", field: "domain", value: "fury" },
        { op: "filter", field: "domain", value: "order" },
      ],
    });
  });

  it("keeps quoted commas literal", () => {
    expect(ast('tag:"a,b"')).toEqual({
      op: "filter",
      field: "tag",
      value: "a,b",
    });
  });

  it("does not comma-split fields that are not list fields", () => {
    expect(ast("a:smith,jones")).toEqual({
      op: "filter",
      field: "artist",
      value: "smith,jones",
    });
  });
});

describe("numeric comparisons", () => {
  it("parses every comparator", () => {
    expect(ast("might>=4")).toEqual({
      op: "numeric",
      field: "might",
      cmp: "gte",
      value: 4,
    });
    expect(ast("might>4")).toEqual({ op: "numeric", field: "might", cmp: "gt", value: 4 });
    expect(ast("power<3")).toEqual({ op: "numeric", field: "power", cmp: "lt", value: 3 });
    expect(ast("power<=3")).toEqual({ op: "numeric", field: "power", cmp: "lte", value: 3 });
    expect(ast("energy=2")).toEqual({ op: "numeric", field: "energy", cmp: "eq", value: 2 });
    expect(ast("energy!=2")).toEqual({ op: "numeric", field: "energy", cmp: "ne", value: 2 });
  });

  it("treats `:` on a numeric field as equality", () => {
    expect(ast("energy:2")).toEqual(ast("energy=2"));
    expect(ast("cost:2")).toEqual(ast("energy=2"));
  });

  it("disambiguates `d` by operator", () => {
    expect(ast("d:fury")).toEqual({ op: "filter", field: "domain", value: "fury" });
    expect(ast("d>=2")).toEqual({
      op: "numeric",
      field: "domain_count",
      cmp: "gte",
      value: 2,
    });
  });

  it("rejects non-numeric values and non-numeric fields", () => {
    expect(() => ast("might>=big")).toThrow(BadCardSearchQueryError);
    expect(() => ast("t>=2")).toThrow(BadCardSearchQueryError);
  });

  it("combines with other terms", () => {
    expect(ast("t:unit might>=4 kw:deathknell")).toEqual({
      op: "and",
      children: [
        { op: "filter", field: "type", value: "unit" },
        { op: "numeric", field: "might", cmp: "gte", value: 4 },
        { op: "filter", field: "keyword", value: "deathknell" },
      ],
    });
  });
});

describe("legality filters", () => {
  it("maps each spelling to a status", () => {
    expect(ast("f:standard")).toEqual({
      op: "legality",
      format: "standard",
      status: "legal",
    });
    expect(ast("legal:standard")).toEqual(ast("f:standard"));
    expect(ast("banned:standard")).toEqual({
      op: "legality",
      format: "standard",
      status: "banned",
    });
    expect(ast("notlegal:standard")).toEqual({
      op: "legality",
      format: "standard",
      status: "not_legal",
    });
  });

  it("lowercases the format code", () => {
    expect(ast("f:STANDARD")).toEqual(ast("f:standard"));
  });

  it("rejects format codes outside the allowed shape", () => {
    expect(() =>
      validateCardSearchAst({ op: "legality", format: "bad code", status: "legal" }),
    ).toThrow(BadCardSearchQueryError);
  });
});

describe("is: flags", () => {
  it("parses known flags and their aliases", () => {
    expect(ast("is:token")).toEqual({ op: "flag", value: "token" });
    expect(ast("is:sig")).toEqual({ op: "flag", value: "signature" });
    expect(ast("is:alt")).toEqual({ op: "flag", value: "alternate" });
  });

  it("negates", () => {
    expect(ast("-is:token")).toEqual({
      op: "not",
      child: { op: "flag", value: "token" },
    });
  });

  it("rejects unknown flags", () => {
    expect(() => ast("is:sparkly")).toThrow(BadCardSearchQueryError);
  });
});

describe("requiresRpc with v2 leaves", () => {
  it("is true for any RPC-only leaf, alone or nested", () => {
    expect(requiresRpc(ast("might>=4")!)).toBe(true);
    expect(requiresRpc(ast("f:standard")!)).toBe(true);
    expect(requiresRpc(ast("is:token")!)).toBe(true);
    expect(requiresRpc(ast("t:unit might>=4")!)).toBe(true);
    expect(requiresRpc(ast("-is:token")!)).toBe(true);
    expect(requiresRpc(ast("t:unit -might>=4")!)).toBe(true);
  });

  it("is still false for plain filter ANDs", () => {
    expect(requiresRpc(ast("t:unit r:rare")!)).toBe(false);
  });
});

describe("unknown fields", () => {
  it("names the field and lists the allowed ones", () => {
    expect(() => ast("nope:x")).toThrow(/Unknown filter field "nope"/);
  });
});
