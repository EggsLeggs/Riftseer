import { describe, expect, test } from "bun:test";

import {
  cardTypeLineSearchQuery,
  domainSearchQuery,
  keywordSearchQuery,
  quoteSearchValue,
  searchHref,
  artistSearchQuery,
  tagSearchQuery,
} from "./search-links";

/** Minimal stand-in — only `classification` is read. */
function card(classification: {
  type?: string | null;
  supertype?: string | null;
}) {
  return { classification } as Parameters<typeof cardTypeLineSearchQuery>[0];
}

describe("quoteSearchValue", () => {
  test("leaves bare words alone", () => {
    expect(quoteSearchValue("poro")).toBe("poro");
    expect(quoteSearchValue("quick-draw")).toBe("quick-draw");
  });

  test("quotes anything the lexer would split", () => {
    expect(quoteSearchValue("sun disc")).toBe('"sun disc"');
    expect(quoteSearchValue("a(b)")).toBe('"a(b)"');
  });

  test("quotes a comma so the value is not read as a list", () => {
    // `kw:`, `tag:` and `d:` expand an unquoted comma list into an OR, so a
    // clicked badge whose text contains a comma must stay one value.
    expect(quoteSearchValue("Noxus, Fallen")).toBe('"Noxus, Fallen"');
    expect(tagSearchQuery("a,b")).toBe('tag:"a,b"');
  });

  test("escapes quotes and backslashes inside a quoted value", () => {
    expect(quoteSearchValue('say "hi"')).toBe('"say \\"hi\\""');
    expect(quoteSearchValue("back\\slash")).toBe('"back\\\\slash"');
  });

  test("trims surrounding whitespace rather than quoting because of it", () => {
    expect(quoteSearchValue("  poro  ")).toBe("poro");
  });
});

describe("tagSearchQuery", () => {
  test("uses the tag-only field, not the broad t:", () => {
    expect(tagSearchQuery("Poro")).toBe("tag:Poro");
    expect(tagSearchQuery("Freljord Beast")).toBe('tag:"Freljord Beast"');
  });
});

describe("artistSearchQuery", () => {
  test("uses the artist field and quotes multi-word names", () => {
    expect(artistSearchQuery("Kudos")).toBe("a:Kudos");
    expect(artistSearchQuery("Kudos Productions")).toBe(
      'a:"Kudos Productions"',
    );
  });
});

describe("domainSearchQuery", () => {
  test("uses the domain field", () => {
    expect(domainSearchQuery("Body")).toBe("d:Body");
    expect(domainSearchQuery("Fury")).toBe("d:Fury");
  });
});

describe("keywordSearchQuery", () => {
  test("folds to the base key so the printed number does not narrow the search", () => {
    expect(keywordSearchQuery("Deflect 3")).toBe("kw:deflect");
    expect(keywordSearchQuery("Deflect 1")).toBe("kw:deflect");
    expect(keywordSearchQuery("Deathknell")).toBe("kw:deathknell");
  });

  test("quotes multi-word keywords", () => {
    expect(keywordSearchQuery("Quick Draw")).toBe('kw:"quick draw"');
  });
});

describe("cardTypeLineSearchQuery", () => {
  test("splits a compound type line into two filters", () => {
    // The whole point: `t:"signature unit"` is not a type any card carries.
    expect(
      cardTypeLineSearchQuery(card({ type: "Unit", supertype: "Signature" })),
    ).toBe("st:Signature t:Unit");
    expect(
      cardTypeLineSearchQuery(card({ type: "Unit", supertype: "Champion" })),
    ).toBe("st:Champion t:Unit");
  });

  test("drops the supertype for legends, matching the printed label", () => {
    expect(
      cardTypeLineSearchQuery(card({ type: "Legend", supertype: "Champion" })),
    ).toBe("t:Legend");
  });

  test("maps a token to the flag its label means", () => {
    expect(cardTypeLineSearchQuery(card({ type: "Token" }))).toBe("is:token");
  });

  test("handles a lone type or supertype", () => {
    expect(cardTypeLineSearchQuery(card({ type: "Spell" }))).toBe("t:Spell");
    expect(cardTypeLineSearchQuery(card({ supertype: "Signature" }))).toBe(
      "st:Signature",
    );
  });

  test("returns null when there is nothing to link", () => {
    expect(cardTypeLineSearchQuery(card({}))).toBeNull();
    expect(cardTypeLineSearchQuery(card({ type: "  ", supertype: null }))).toBeNull();
  });
});

describe("searchHref", () => {
  test("encodes the query into the q param", () => {
    expect(searchHref("st:Signature t:Unit")).toBe(
      "/search?q=st%3ASignature%20t%3AUnit",
    );
  });
});
