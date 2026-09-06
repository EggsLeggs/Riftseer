import {
  parseCardSearchQuery,
  type CardDataProvider,
  type CardLegality,
  type CardRequest,
  type CardRuling,
  type CardSearchAst,
  type CardSearchOptions,
  type Format,
  type Oracle,
  type OracleSearchResult,
  type Printing,
  type PrintingSearchResult,
  type ResolvedCard,
} from "@riftseer/core";

export const STUB_FORMAT: Format = {
  object: "format",
  id: "eeeeeeee-0000-0000-0000-000000000001",
  code: "standard",
  name: "Standard",
  sort_order: 0,
  active: true,
  zone_rules: [
    { zone: "legend", min_count: 1, max_count: 1, copy_limit: null },
    { zone: "main", min_count: 40, max_count: 40, copy_limit: 3 },
  ],
  severity_overrides: { restricted: "warning" },
};

export const STUB_RULING: CardRuling = {
  object: "card_ruling",
  id: "ffffffff-0000-0000-0000-000000000001",
  type: "ruling",
  text: "Sun Disc's ability resolves before the unit readies.",
  dated: "2026-03-14",
  source: "Rules team",
  scope: "oracle",
};

export const STUB_ORACLE_ID = "bf1bafdc-2739-469b-bde6-c24a868f4979";
export const STUB_PRINTING_ID = "aaaaaaaaaaaaaaaaaaaaaaa1";
export const STUB_ALT_PRINTING_ID = "aaaaaaaaaaaaaaaaaaaaaaa2";
export const STUB_TOKEN_ID = "cccccccc-0000-0000-0000-000000000001";
export const STUB_CHAMPION_ID = "aaaaaaaa-0000-0000-0000-000000000001";
export const STUB_SIGNATURE_ID = "dddddddd-0000-0000-0000-000000000001";

function printing(
  id: string,
  oracleId: string,
  overrides: Partial<Printing> = {},
): Printing {
  return {
    object: "printing",
    id,
    oracle_id: oracleId,
    set: {
      set_code: "OGN",
      set_name: "Origins",
      published_on: "2025-01-01",
    },
    collector_number: "21",
    collector_label: "21",
    rarity: "Uncommon",
    artist: "Envar Studio",
    finishes: ["Normal"],
    signature: false,
    alternate_art: false,
    overnumbered: false,
    special_collection: false,
    public_slug: "ogn/21/sun-disc",
    source: "riftcodex",
    ...overrides,
  };
}

export const STUB_PRINTING = printing(STUB_PRINTING_ID, STUB_ORACLE_ID, {
  image: { normal: "https://cdn.example.com/sun-disc.png" },
  prices: { tcgplayer: { normal: 1.25, foil: 4.5 } },
  purchase_uris: { tcgplayer: "https://www.tcgplayer.com/product/123456" },
  external_ids: { riftcodex_id: STUB_PRINTING_ID, tcgplayer_id: "123456" },
});

export const STUB_ALT_PRINTING = printing(STUB_ALT_PRINTING_ID, STUB_ORACLE_ID, {
  collector_number: "22",
  collector_label: "22a",
  alternate_art: true,
  public_slug: "ogn/22a/sun-disc",
  prices: { tcgplayer: { normal: 9.99 } },
});

function oracle(
  id: string,
  name: string,
  overrides: Partial<Oracle> = {},
): Oracle {
  return {
    object: "oracle",
    id,
    oracle_key: name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    name,
    name_normalized: name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    card_type: "Unit",
    supertype: null,
    is_token: false,
    keywords: [],
    tags: [],
    domains: [],
    meta_flags: [],
    source: "riftcodex",
    ...overrides,
  };
}

export const STUB_ORACLE = oracle(STUB_ORACLE_ID, "Sun Disc", {
  card_type: "Gear",
  energy: 2,
  power: 1,
  text: { plain: ":rb_exhaust:: Next unit ready. Create a Sprite Token." },
  domains: ["Fury"],
  preferred_printing: STUB_PRINTING,
});

/** Compatibility alias for the few route tests that use the old fixture name. */
export const STUB_CARD = STUB_ORACLE;

const TOKEN_PRINTING = printing("ccccccccccccccccccccccc1", STUB_TOKEN_ID, {
  collector_number: "T1",
  collector_label: "T1",
  rarity: "Common",
  public_slug: "ogn/t1/sprite",
});
const CHAMPION_PRINTING = printing("bbbbbbbbbbbbbbbbbbbbbbb1", STUB_CHAMPION_ID, {
  collector_number: "5",
  collector_label: "5",
  rarity: "Rare",
  public_slug: "ogn/5/sun-disc-champion",
});
const SIGNATURE_PRINTING = printing("ddddddddddddddddddddddd1", STUB_SIGNATURE_ID, {
  signature: true,
  rarity: "Rare",
  public_slug: "ogn/21/signature/sun-disc",
});

const STUB_TOKEN = oracle(STUB_TOKEN_ID, "Sprite", {
  is_token: true,
  preferred_printing: TOKEN_PRINTING,
});
const STUB_CHAMPION = oracle(STUB_CHAMPION_ID, "Sun Disc, Champion", {
  supertype: "Champion",
  domains: ["Fury"],
  preferred_printing: CHAMPION_PRINTING,
});
const STUB_SIGNATURE = oracle(STUB_SIGNATURE_ID, "Sun Disc, Signature", {
  card_type: "Spell",
  supertype: "Signature",
  preferred_printing: SIGNATURE_PRINTING,
});

const ORACLES = [STUB_ORACLE, STUB_TOKEN, STUB_CHAMPION, STUB_SIGNATURE];
const PRINTINGS = [
  STUB_PRINTING,
  STUB_ALT_PRINTING,
  TOKEN_PRINTING,
  CHAMPION_PRINTING,
  SIGNATURE_PRINTING,
];
const ORACLES_BY_ID = new Map(ORACLES.map((value) => [value.id, value]));
const PRINTINGS_BY_ID = new Map(PRINTINGS.map((value) => [value.id, value]));

export class StubProvider implements CardDataProvider {
  readonly sourceName = "stub";

  async warmup() {}
  async refresh() {}

  async getOracleById(id: string): Promise<Oracle | null> {
    return ORACLES_BY_ID.get(id) ?? null;
  }

  async getOracleByKey(key: string): Promise<Oracle | null> {
    return ORACLES.find((value) => value.oracle_key === key) ?? null;
  }

  async getOracleBySlug(slug: string): Promise<Oracle | null> {
    return ORACLES.find((value) => value.slug === slug) ?? null;
  }

  async getOraclesByIds(ids: string[]): Promise<Oracle[]> {
    return ids.flatMap((id) => ORACLES_BY_ID.get(id) ?? []);
  }

  async getPrintingsForOracle(oracleId: string): Promise<Printing[]> {
    return PRINTINGS.filter((value) => value.oracle_id === oracleId);
  }

  async getOracleRelationships(oracleId: string) {
    const empty = { makes_tokens: [], used_by: [], characters: [], signatures: [] };
    if (oracleId === STUB_ORACLE_ID) {
      return {
        makes_tokens: [STUB_TOKEN],
        used_by: [],
        characters: [STUB_CHAMPION],
        signatures: [STUB_SIGNATURE],
      };
    }
    if (oracleId === STUB_TOKEN_ID) return { ...empty, used_by: [STUB_ORACLE] };
    return empty;
  }

  async getPrintingById(id: string): Promise<Printing | null> {
    return PRINTINGS_BY_ID.get(id) ?? null;
  }

  async getPrintingBySlug(slug: string): Promise<Printing | null> {
    return PRINTINGS.find((value) => value.public_slug === slug) ?? null;
  }

  async getPrintingsByIds(ids: string[]): Promise<Printing[]> {
    return ids.flatMap((id) => PRINTINGS_BY_ID.get(id) ?? []);
  }

  async getPrintingsBySet(setCode: string, opts?: { limit?: number }): Promise<Printing[]> {
    const rows = PRINTINGS.filter(
      (value) => value.set?.set_code.toLowerCase() === setCode.toLowerCase(),
    );
    return rows.slice(0, opts?.limit ?? rows.length);
  }

  async searchOracles(q: string, opts?: CardSearchOptions): Promise<OracleSearchResult> {
    const parsed = parseCardSearchQuery(q).ast;
    return parsed ? this.searchOraclesByAst(parsed, opts) : { oracles: [], total: 0 };
  }

  async searchOraclesByAst(ast: CardSearchAst, opts?: CardSearchOptions): Promise<OracleSearchResult> {
    const matches = ORACLES.filter((value) =>
      matchAst(value, value.preferred_printing, ast),
    );
    const { offset, limit } = page(opts);
    return { oracles: matches.slice(offset, offset + limit), total: matches.length };
  }

  async searchPrintingsByAst(ast: CardSearchAst, opts?: CardSearchOptions): Promise<PrintingSearchResult> {
    const matches = PRINTINGS.filter((value) => {
      const owner = ORACLES_BY_ID.get(value.oracle_id);
      return owner ? matchAst(owner, value, ast) : false;
    });
    const { offset, limit } = page(opts);
    const printings = matches.slice(offset, offset + limit);
    const ownerIds = new Set(printings.map((value) => value.oracle_id));
    return {
      printings,
      oracles: ORACLES.filter((value) => ownerIds.has(value.id)),
      total: matches.length,
    };
  }

  async resolveRequest(request: CardRequest): Promise<ResolvedCard> {
    const oracle = ORACLES.find(
      (value) => value.name_normalized === request.name.toLowerCase(),
    );
    if (!oracle) {
      return { request, oracle: null, printing: null, matchType: "not-found" };
    }
    const candidates = PRINTINGS.filter((value) => value.oracle_id === oracle.id);
    const scoped = candidates.find((value) => {
      const setMatches = !request.set || value.set?.set_code.toLowerCase() === request.set.toLowerCase();
      const collectorMatches = !request.collector || value.collector_number?.toLowerCase() === request.collector.toLowerCase();
      return setMatches && collectorMatches;
    });
    return {
      request,
      oracle,
      printing: scoped ?? oracle.preferred_printing ?? null,
      matchType: "exact",
    };
  }

  async browseOracles(opts: { limit: number; offset: number }): Promise<OracleSearchResult> {
    return {
      oracles: ORACLES.slice(opts.offset, opts.offset + opts.limit),
      total: ORACLES.length,
    };
  }

  async getRandomOracle(): Promise<Oracle | null> {
    return STUB_ORACLE;
  }

  async getSets() {
    return [{
      setCode: "OGN",
      setName: "Origins",
      cardCount: PRINTINGS.length,
      isPromo: false,
      publishedOn: "2025-01-01",
    }];
  }

  async getFormats(opts?: { includeInactive?: boolean }): Promise<Format[]> {
    const retired: Format = {
      ...STUB_FORMAT,
      id: "eeeeeeee-0000-0000-0000-000000000002",
      code: "retired",
      name: "Retired",
      sort_order: 1,
      active: false,
    };
    return opts?.includeInactive ? [STUB_FORMAT, retired] : [STUB_FORMAT];
  }

  async getLegalities(printingId: string): Promise<CardLegality[]> {
    const base = printingId === STUB_PRINTING_ID;
    return [{
      object: "card_legality",
      format_id: STUB_FORMAT.id,
      format_code: STUB_FORMAT.code,
      format_name: STUB_FORMAT.name,
      status: base ? "banned" : "legal",
      scope: base ? "oracle" : "printing",
    }];
  }

  async getRulings(printingId: string): Promise<CardRuling[]> {
    return printingId === STUB_PRINTING_ID ? [STUB_RULING] : [];
  }

  getStats() {
    return { lastRefresh: 0, oracleCount: ORACLES.length, printingCount: PRINTINGS.length };
  }
}

function page(opts?: CardSearchOptions) {
  return {
    offset: Math.max(0, Math.floor(opts?.offset ?? 0)),
    limit: Math.min(Math.max(Math.floor(Number(opts?.limit ?? 10)), 1), 100),
  };
}

function matchAst(oracle: Oracle, printing: Printing | undefined, ast: CardSearchAst): boolean {
  const includes = (value: string | null | undefined, needle: string) =>
    (value ?? "").toLowerCase().includes(needle);
  const equalsAny = (values: string[], needle: string) =>
    values.some((value) => value.toLowerCase() === needle);

  switch (ast.op) {
    case "and": return ast.children.every((child) => matchAst(oracle, printing, child));
    case "or": return ast.children.some((child) => matchAst(oracle, printing, child));
    case "not": return !matchAst(oracle, printing, ast.child);
    case "text": return includes(oracle.name, ast.value.toLowerCase());
    case "exact_name": return oracle.name_normalized === ast.value;
    case "filter": {
      const needle = ast.value.toLowerCase();
      switch (ast.field) {
        case "type": return [oracle.card_type, oracle.supertype, ...oracle.tags].some((v) => includes(v, needle));
        case "supertype": return includes(oracle.supertype, needle);
        case "rarity": return includes(printing?.rarity, needle);
        case "artist": return includes(printing?.artist, needle);
        case "keyword": return equalsAny(oracle.keywords, needle);
        case "domain": return equalsAny(oracle.domains, needle);
        case "tag": return oracle.tags.some((value) => includes(value, needle));
        case "set": return printing?.set?.set_code.toLowerCase() === needle;
        case "produces": return oracle.id === STUB_ORACLE_ID && includes(STUB_TOKEN.name, needle);
        case "name": return includes(oracle.name, needle);
      }
    }
    case "numeric": {
      const actual = ast.field === "domain_count" ? oracle.domains.length : oracle[ast.field];
      if (actual == null) return false;
      if (ast.cmp === "eq") return actual === ast.value;
      if (ast.cmp === "ne") return actual !== ast.value;
      if (ast.cmp === "gt") return actual > ast.value;
      if (ast.cmp === "gte") return actual >= ast.value;
      if (ast.cmp === "lt") return actual < ast.value;
      return actual <= ast.value;
    }
    case "legality": {
      const status = printing?.id === STUB_PRINTING_ID && ast.format === STUB_FORMAT.code
        ? "banned"
        : "legal";
      return status === ast.status;
    }
    case "flag": {
      if (ast.value === "token") return oracle.is_token;
      if (ast.value === "signature") return printing?.signature === true;
      if (ast.value === "alternate") return printing?.alternate_art === true;
      if (ast.value === "overnumbered") return printing?.overnumbered === true;
      if (ast.value === "special") return printing?.special_collection === true;
      if (ast.value === "manual") return oracle.source === "manual" || printing?.source === "manual";
      return printing?.finishes.some((value) => value.toLowerCase() === "foil") === true;
    }
  }
}
