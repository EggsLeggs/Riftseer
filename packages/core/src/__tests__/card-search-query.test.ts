import { describe, expect, it } from "bun:test";
import {
  BadCardSearchQueryError,
  CARD_SEARCH_LIMITS,
  andAst,
  exactNameLeaf,
  filterLeaf,
  findTextLeafValue,
  notAst,
  orAst,
  parseCardSearchQuery,
  textLeaf,
  validateCardSearchAst,
  type CardSearchAst,
} from "../card-search-query.ts";

const ast = (query: string) => parseCardSearchQuery(query).ast;

describe("card search grammar", () => {
  it("returns no AST for blank input", () => {
    expect(ast("")).toBeNull();
    expect(ast(" \n\t ")).toBeNull();
  });

  it("merges adjacent free text into one leaf", () => {
    expect(ast("bard fish")).toEqual({ op: "text", value: "bard fish" });
  });

  it("keeps quoted phrases and escaped quotes together", () => {
    expect(ast('"sun \\"disc\\""')).toEqual({ op: "text", value: 'sun "disc"' });
  });

  it("parses and normalizes exact names", () => {
    expect(ast('!"Kai’Sa - Survivor"')).toEqual({
      op: "exact_name",
      value: "kaisa survivor",
    });
  });

  it("parses every text-filter family", () => {
    const cases = [
      ["t:unit", "type"], ["st:champion", "supertype"],
      ["r:showcase", "rarity"], ["a:artist", "artist"],
      ["kw:deflect", "keyword"], ["d:fury", "domain"],
      ["tag:sentinel", "tag"], ["set:ogn", "set"],
      ["produces:sprite", "produces"], ["name:vayne", "name"],
    ] as const;
    for (const [query, field] of cases) expect(ast(query)).toMatchObject({ op: "filter", field });
  });

  it("accepts documented long-form aliases", () => {
    expect(ast("artist:foo type:unit rarity:rare")).toEqual({
      op: "and",
      children: [
        { op: "filter", field: "artist", value: "foo" },
        { op: "filter", field: "type", value: "unit" },
        { op: "filter", field: "rarity", value: "rare" },
      ],
    });
  });

  it("normalizes ranked keywords to their base key", () => {
    expect(ast('kw:"Deflect 3"')).toEqual({ op: "filter", field: "keyword", value: "deflect" });
  });

  it("expands unquoted array comma lists but preserves quoted commas", () => {
    expect(ast("d:fury,order")).toEqual({
      op: "or",
      children: [
        { op: "filter", field: "domain", value: "fury" },
        { op: "filter", field: "domain", value: "order" },
      ],
    });
    expect(ast('tag:"cat,dog"')).toEqual({ op: "filter", field: "tag", value: "cat,dog" });
  });

  it("uses adjacency as implicit AND", () => {
    expect(ast("vayne t:unit")).toEqual({
      op: "and",
      children: [
        { op: "text", value: "vayne" },
        { op: "filter", field: "type", value: "unit" },
      ],
    });
  });

  it("binds implicit AND more tightly than OR", () => {
    expect(ast("t:unit d:fury or t:gear")).toEqual({
      op: "or",
      children: [
        { op: "and", children: [
          { op: "filter", field: "type", value: "unit" },
          { op: "filter", field: "domain", value: "fury" },
        ] },
        { op: "filter", field: "type", value: "gear" },
      ],
    });
  });

  it("honours parenthesized groups", () => {
    expect(ast("t:unit (d:fury or d:order)")).toMatchObject({
      op: "and",
      children: [{ op: "filter" }, { op: "or" }],
    });
  });

  it("negates atoms and collapses double negation", () => {
    expect(ast("-t:unit")).toEqual({
      op: "not",
      child: { op: "filter", field: "type", value: "unit" },
    });
    expect(ast("--t:unit")).toEqual({ op: "filter", field: "type", value: "unit" });
  });

  it("keeps a hyphen inside free text", () => {
    expect(ast("sun-disc")).toEqual({ op: "text", value: "sun-disc" });
  });

  it("maps every numeric comparator", () => {
    const cases = [[":", "eq"], ["=", "eq"], ["!=", "ne"], [">", "gt"], [">=", "gte"], ["<", "lt"], ["<=", "lte"]] as const;
    for (const [operator, cmp] of cases) {
      expect(ast(`energy${operator}2`)).toEqual({ op: "numeric", field: "energy", cmp, value: 2 });
    }
  });

  it("disambiguates d:domain from d>=domain-count", () => {
    expect(ast("d:fury")).toMatchObject({ op: "filter", field: "domain" });
    expect(ast("d>=2")).toEqual({ op: "numeric", field: "domain_count", cmp: "gte", value: 2 });
  });

  it("rejects malformed and out-of-range numeric filters", () => {
    expect(() => ast("energy>many")).toThrow(BadCardSearchQueryError);
    expect(() => ast(`power>${CARD_SEARCH_LIMITS.maxNumericValue + 1}`)).toThrow("out of range");
  });

  it("parses default-legal and explicit non-legal statuses", () => {
    expect(ast("f:standard")).toEqual({ op: "legality", format: "standard", status: "legal" });
    expect(ast("banned:standard")).toEqual({ op: "legality", format: "standard", status: "banned" });
    expect(ast("notlegal:standard")).toEqual({ op: "legality", format: "standard", status: "not_legal" });
  });

  it("maps documented is: aliases", () => {
    const cases = [["token", "token"], ["sig", "signature"], ["alt", "alternate"], ["overnumbered", "overnumbered"], ["showcase", "special"], ["manual", "manual"], ["foil", "foil"]] as const;
    for (const [input, value] of cases) expect(ast(`is:${input}`)).toEqual({ op: "flag", value });
  });

  it("raises for an unknown field or field/operator combination", () => {
    expect(() => ast("unknown:value")).toThrow("Unknown filter field");
    expect(() => ast("rarity>=2")).toThrow("cannot be compared");
  });

  it("raises for an unknown is: operation", () => {
    expect(() => ast("is:future-flag")).toThrow("Unknown is: value");
  });

  it("raises on malformed boolean syntax", () => {
    for (const query of ["(t:unit", "t:unit)"]) {
      expect(() => ast(query)).toThrow(BadCardSearchQueryError);
    }
  });

  it("bounds raw input and leaf lengths", () => {
    expect(() => ast("x".repeat(CARD_SEARCH_LIMITS.maxInputLength + 1))).toThrow("maximum length");
    expect(() => validateCardSearchAst({ op: "text", value: "x".repeat(CARD_SEARCH_LIMITS.maxLeafValueLength + 1) })).toThrow("too long");
  });

  it("bounds AST node count and nesting depth", () => {
    const children = Array.from({ length: CARD_SEARCH_LIMITS.maxAstNodes }, () => ({ op: "text", value: "x" }) as const);
    expect(() => validateCardSearchAst({ op: "and", children })).toThrow("maximum complexity");
    let nested: CardSearchAst = { op: "text", value: "x" };
    for (let i = 0; i < CARD_SEARCH_LIMITS.maxAstDepth; i++) nested = { op: "not", child: nested };
    expect(() => validateCardSearchAst(nested)).toThrow("nesting depth");
  });

  it("raises for hand-built unknown fields, operators, flags, and statuses", () => {
    const invalid = [
      { op: "filter", field: "future", value: "x" },
      { op: "numeric", field: "energy", cmp: "future", value: 1 },
      { op: "flag", value: "future" },
      { op: "legality", format: "standard", status: "future" },
    ];
    for (const value of invalid) expect(() => validateCardSearchAst(value as CardSearchAst)).toThrow(BadCardSearchQueryError);
  });

  it("keeps AST builders flat and exposes only positive free text", () => {
    const tree = andAst(textLeaf("vayne"), andAst(filterLeaf("type", "unit"), exactNameLeaf("Vayne")))!;
    expect(tree.op).toBe("and");
    expect(tree.op === "and" ? tree.children : []).toHaveLength(3);
    expect(findTextLeafValue(tree)).toBe("vayne");
    expect(findTextLeafValue(notAst(textLeaf("hidden"))!)).toBeNull();
    expect(orAst(null, filterLeaf("type", "unit"))).toEqual(filterLeaf("type", "unit"));
  });
});
