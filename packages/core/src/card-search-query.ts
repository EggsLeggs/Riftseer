/**
 * Card search query language — field filters, numeric comparisons, legality
 * lookups, booleans and exact names — parsed into an AST.
 *
 * Grammar (v2):
 *   expr     := orExpr
 *   orExpr   := andExpr ( "or" andExpr )*
 *   andExpr  := unaryExpr unaryExpr*           -- adjacency = AND
 *   unaryExpr:= "-" atom | atom
 *   atom     := "(" expr ")"
 *             | "!" value                       -- exact card name
 *             | field ":" value                 -- structured filter
 *             | numField cmp NUMBER             -- numeric comparison
 *             | value                           -- free text (FTS)
 *   cmp      := ":" | "=" | "!=" | ">" | ">=" | "<" | "<="
 *   value    := QUOTED_STRING | BARE_WORD
 *
 * Implicit AND binds tighter than `or`. Use parentheses to disambiguate.
 *
 * Field families (see the alias tables below for the full list):
 *   - text filters   `t:` `st:` `r:` `a:` `kw:` `d:` `tag:` `set:` `produces:` `name:`
 *   - numeric        `energy` `might` `power` `d` (domain count) with a comparator
 *   - legality       `f:` / `legal:` / `banned:` / `notlegal:` + a format code
 *   - flags          `is:token` `is:signature` `is:alternate` `is:overnumbered`
 *                    `is:special` `is:manual` `is:foil`
 *
 * `d` is disambiguated by its operator: `d:fury` filters domains, `d>=2` counts
 * them. Comma-separated values on `kw` / `d` / `tag` expand to OR, so
 * `d:fury,order` is `(d:fury or d:order)` — quote the value to opt out.
 *
 * The AST is the contract between the HTTP layer (which parses) and the
 * provider (which executes). There is exactly ONE execution path: every leaf is
 * whitelisted and rendered to SQL by `card_search_ast_to_sql`, which runs
 * against the `resolved_printings` projection. The flat card model needed three
 * paths and a routing gate to choose between them; a single flat relation with
 * the delta layer already applied does not.
 *
 * The same parser backs **ruling rules**: an admin-authored query string is
 * parsed here, stored as its AST, and re-evaluated by the same RPC to decide
 * which printings a rule-scoped ruling attaches to. Anything added to this
 * grammar becomes available to rules automatically — and vice versa, so a leaf
 * that cannot be rendered to SQL must not parse.
 */

import { keywordBaseKey } from "@riftseer/types/keywords";
import { normalizeCardName } from "./normalize.ts";

// ─── AST types ───────────────────────────────────────────────────────────────

/**
 * Substring/equality filters over a single card attribute.
 *
 * Matching is substring + case-insensitive for the free-form fields, but
 * **exact** (case-insensitive) for `keyword` and `domain`: both are closed
 * vocabularies stored as normalized arrays, and substring matching there would
 * make `d:or` hit "Order" while `kw:de` hit half the keyword list.
 */
export type CardSearchField =
  | "type"
  | "supertype"
  | "rarity"
  | "artist"
  | "keyword"
  | "domain"
  | "tag"
  | "set"
  | "produces"
  | "name";

/** Numerically comparable card attributes. `domain_count` is `|domains|`. */
export type CardSearchNumericField =
  | "energy"
  | "might"
  | "power"
  | "domain_count";

export type CardSearchComparator = "eq" | "ne" | "gt" | "gte" | "lt" | "lte";

/** Boolean card flags reachable through `is:`. */
export type CardSearchFlag =
  | "token"
  | "signature"
  | "alternate"
  | "overnumbered"
  | "special"
  | "manual"
  | "foil";

/**
 * Legality statuses a query can ask for. Mirrors `CardLegalityStatus` in
 * `@riftseer/types`; `legal` means "resolves to legal", which includes the
 * default-legal case where no row is stored at all.
 */
export type CardSearchLegalityStatus = "legal" | "not_legal" | "banned";

export type CardSearchAst =
  | { op: "and"; children: CardSearchAst[] }
  | { op: "or"; children: CardSearchAst[] }
  | { op: "not"; child: CardSearchAst }
  | { op: "text"; value: string }
  | { op: "exact_name"; value: string }
  | { op: "filter"; field: CardSearchField; value: string }
  | {
      op: "numeric";
      field: CardSearchNumericField;
      cmp: CardSearchComparator;
      value: number;
    }
  | { op: "legality"; format: string; status: CardSearchLegalityStatus }
  | { op: "flag"; value: CardSearchFlag };

export interface ParsedCardSearch {
  /** Root AST, or `null` when the query parses to nothing meaningful. */
  ast: CardSearchAst | null;
}

// ─── Errors and limits ──────────────────────────────────────────────────────

export class BadCardSearchQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadCardSearchQueryError";
  }
}

/**
 * Hard caps applied during parsing and validation.
 *
 * These bound parser work and the size of any SQL we generate downstream;
 * the values are deliberately generous for normal use but small enough that
 * an attacker cannot drive expensive query construction.
 */
export const CARD_SEARCH_LIMITS = {
  maxInputLength: 256,
  maxAstNodes: 64,
  maxAstDepth: 8,
  maxLeafValueLength: 64,
  /** Bound on `energy`/`might`/`power`/domain-count comparisons. */
  maxNumericValue: 1_000_000,
} as const;

const FIELD_ALIASES: Record<string, CardSearchField> = {
  a: "artist",
  artist: "artist",
  t: "type",
  type: "type",
  st: "supertype",
  supertype: "supertype",
  r: "rarity",
  rarity: "rarity",
  kw: "keyword",
  keyword: "keyword",
  keywords: "keyword",
  d: "domain",
  domain: "domain",
  domains: "domain",
  tag: "tag",
  tags: "tag",
  set: "set",
  s: "set",
  produces: "produces",
  makes: "produces",
  name: "name",
};

/**
 * Fields that accept a comparator. `d` / `domain` / `domains` appear here *and*
 * in {@link FIELD_ALIASES}: with `:` they filter which domains a card has, with
 * a comparator they count them.
 */
const NUMERIC_FIELD_ALIASES: Record<string, CardSearchNumericField> = {
  e: "energy",
  energy: "energy",
  cost: "energy",
  m: "might",
  might: "might",
  p: "power",
  power: "power",
  d: "domain_count",
  domain: "domain_count",
  domains: "domain_count",
};

/** `f:`/`legal:` ask for legal; the other spellings ask for a specific status. */
const LEGALITY_FIELD_ALIASES: Record<string, CardSearchLegalityStatus> = {
  f: "legal",
  format: "legal",
  legal: "legal",
  banned: "banned",
  notlegal: "not_legal",
  not_legal: "not_legal",
  illegal: "not_legal",
};

const FLAG_VALUES: Record<string, CardSearchFlag> = {
  token: "token",
  signature: "signature",
  sig: "signature",
  alternate: "alternate",
  alt: "alternate",
  alternate_art: "alternate",
  overnumbered: "overnumbered",
  special: "special",
  special_collection: "special",
  showcase: "special",
  manual: "manual",
  foil: "foil",
};

/** Fields whose unquoted values expand a comma list into an OR of leaves. */
const COMMA_LIST_FIELDS = new Set<CardSearchField>([
  "keyword",
  "domain",
  "tag",
]);

const COMPARATORS: Record<string, CardSearchComparator> = {
  "=": "eq",
  "!=": "ne",
  ">": "gt",
  ">=": "gte",
  "<": "lt",
  "<=": "lte",
};

/** Every field name the grammar accepts, for error messages. */
function knownFieldList(): string {
  return [
    ...new Set([
      ...Object.keys(FIELD_ALIASES),
      ...Object.keys(NUMERIC_FIELD_ALIASES),
      ...Object.keys(LEGALITY_FIELD_ALIASES),
      "is",
    ]),
  ]
    .sort()
    .join(", ");
}

// ─── Builders ───────────────────────────────────────────────────────────────

/** Combine children with AND, flattening nested ANDs and merging sibling text leaves. */
export function andAst(
  ...children: Array<CardSearchAst | null | undefined>
): CardSearchAst | null {
  const real = children.filter((c): c is CardSearchAst => c != null);
  if (real.length === 0) return null;
  const flat: CardSearchAst[] = [];
  for (const c of real) {
    if (c.op === "and") flat.push(...c.children);
    else flat.push(c);
  }
  if (flat.length === 1) return flat[0];
  return mergeSiblingTexts({ op: "and", children: flat });
}

/** Combine children with OR, flattening nested ORs. Returns null on empty input. */
export function orAst(
  ...children: Array<CardSearchAst | null | undefined>
): CardSearchAst | null {
  const real = children.filter((c): c is CardSearchAst => c != null);
  if (real.length === 0) return null;
  const flat: CardSearchAst[] = [];
  for (const c of real) {
    if (c.op === "or") flat.push(...c.children);
    else flat.push(c);
  }
  if (flat.length === 1) return flat[0];
  return { op: "or", children: flat };
}

/** Wrap in NOT, collapsing double-negation. */
export function notAst(
  child: CardSearchAst | null | undefined,
): CardSearchAst | null {
  if (!child) return null;
  if (child.op === "not") return child.child;
  return { op: "not", child };
}

export function textLeaf(value: string): CardSearchAst | null {
  const v = value.trim();
  return v.length === 0 ? null : { op: "text", value: v };
}

export function exactNameLeaf(value: string): CardSearchAst | null {
  const norm = normalizeCardName(value);
  return norm.length === 0 ? null : { op: "exact_name", value: norm };
}

export function filterLeaf(
  field: CardSearchField,
  value: string,
): CardSearchAst | null {
  const v = value.trim();
  if (v.length === 0) return null;
  // Keywords are stored as base keys, so fold `Deflect 3` → `deflect` at parse
  // time; the executor can then use plain array containment against the index.
  if (field === "keyword") {
    const key = keywordBaseKey(v);
    return key.length === 0 ? null : { op: "filter", field, value: key };
  }
  return { op: "filter", field, value: v };
}

/**
 * A filter leaf, expanding an unquoted comma list into an OR for the fields
 * that support it (`kw:deflect,shield`). Quoted values never split, so a tag
 * that genuinely contains a comma stays intact.
 */
function filterLeafOrList(
  field: CardSearchField,
  value: string,
  quoted: boolean,
): CardSearchAst | null {
  if (quoted || !COMMA_LIST_FIELDS.has(field) || !value.includes(",")) {
    return filterLeaf(field, value);
  }
  return orAst(...value.split(",").map((part) => filterLeaf(field, part)));
}

export function numericLeaf(
  field: CardSearchNumericField,
  cmp: CardSearchComparator,
  value: string,
): CardSearchAst | null {
  const raw = value.trim();
  if (raw.length === 0) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) {
    throw new BadCardSearchQueryError(
      `"${field}" needs a number, got "${raw}".`,
    );
  }
  return { op: "numeric", field, cmp, value: Number(raw) };
}

export function legalityLeaf(
  status: CardSearchLegalityStatus,
  format: string,
): CardSearchAst | null {
  const code = format.trim().toLowerCase();
  return code.length === 0 ? null : { op: "legality", format: code, status };
}

export function flagLeaf(value: string): CardSearchAst | null {
  const key = value.trim().toLowerCase();
  if (key.length === 0) return null;
  const flag = FLAG_VALUES[key];
  if (!flag) {
    throw new BadCardSearchQueryError(
      `Unknown is: value "${value}". Allowed: ${[...new Set(Object.values(FLAG_VALUES))].sort().join(", ")}.`,
    );
  }
  return { op: "flag", value: flag };
}

function mergeSiblingTexts(ast: CardSearchAst): CardSearchAst {
  if (ast.op !== "and") return ast;
  const texts: string[] = [];
  const others: CardSearchAst[] = [];
  for (const c of ast.children) {
    if (c.op === "text") texts.push(c.value);
    else others.push(c);
  }
  if (texts.length <= 1) return ast;
  const merged: CardSearchAst = { op: "text", value: texts.join(" ") };
  if (others.length === 0) return merged;
  return { op: "and", children: [merged, ...others] };
}

// ─── Lexer ──────────────────────────────────────────────────────────────────

type Token =
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "minus" }
  | { kind: "or" }
  | { kind: "exact"; value: string }
  /** Field name and operator as written; the parser resolves them to a leaf. */
  | {
      kind: "field";
      name: string;
      op: ":" | "=" | "!=" | ">" | ">=" | "<" | "<=";
      value: string;
      quoted: boolean;
    }
  | { kind: "text"; value: string };

const FIELD_NAME_RE = /^[a-zA-Z_]+$/;

/** Characters that can end a field name and begin an operator. */
function isOperatorStart(c: string | undefined): boolean {
  return c === ":" || c === ">" || c === "<" || c === "=" || c === "!";
}

function isWhitespace(c: string | undefined): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r";
}

function lex(input: string): Token[] {
  const tokens: Token[] = [];
  const n = input.length;
  let i = 0;

  function readQuoted(): string {
    // assumes input[i] === '"'
    i += 1;
    let out = "";
    while (i < n) {
      const c = input[i];
      if (c === '"') {
        i += 1;
        return out;
      }
      if (c === "\\" && i + 1 < n) {
        out += input[i + 1];
        i += 2;
        continue;
      }
      out += c;
      i += 1;
    }
    throw new BadCardSearchQueryError("Unterminated quoted string.");
  }

  function readBareWord(): string {
    let out = "";
    while (i < n) {
      const c = input[i];
      if (isWhitespace(c) || c === "(" || c === ")") break;
      out += c;
      i += 1;
    }
    return out;
  }

  function readValue(): { value: string; quoted: boolean } {
    if (input[i] === '"') return { value: readQuoted(), quoted: true };
    return { value: readBareWord(), quoted: false };
  }

  while (i < n) {
    const c = input[i];

    if (isWhitespace(c)) {
      i += 1;
      continue;
    }
    if (c === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
      continue;
    }
    if (c === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
      continue;
    }
    // Always emit minus — hyphens inside a bare word never reach here because
    // readBareWord consumes them in one token from the word's first character.
    if (c === "-") {
      tokens.push({ kind: "minus" });
      i += 1;
      continue;
    }
    if (c === "!") {
      i += 1;
      tokens.push({ kind: "exact", value: readValue().value });
      continue;
    }
    if (c === '"') {
      tokens.push({ kind: "text", value: readQuoted() });
      continue;
    }

    // Try `field<op>value`. Look ahead for an operator before whitespace/paren.
    let j = i;
    while (j < n) {
      const ch = input[j];
      if (isWhitespace(ch) || ch === "(" || ch === ")") break;
      if (isOperatorStart(ch)) break;
      j += 1;
    }
    if (j > i && j < n && isOperatorStart(input[j])) {
      const name = input.slice(i, j);
      // Two-character operators first, so `>=` never lexes as `>` then `=`.
      const two = input.slice(j, j + 2);
      const op =
        two === ">=" || two === "<=" || two === "!="
          ? two
          : input[j] === ":" || input[j] === ">" || input[j] === "<" || input[j] === "="
            ? input[j]!
            : null;
      if (op && FIELD_NAME_RE.test(name)) {
        i = j + op.length;
        const { value, quoted } = readValue();
        tokens.push({
          kind: "field",
          name: name.toLowerCase(),
          op: op as ":" | "=" | "!=" | ">" | ">=" | "<" | "<=",
          value,
          quoted,
        });
        continue;
      }
    }

    // Bare word (or the reserved `or` keyword).
    const word = readBareWord();
    if (word.length === 0) {
      // shouldn't happen — the loop ends on whitespace/parens, both already handled
      i += 1;
      continue;
    }
    if (word.toLowerCase() === "or") {
      tokens.push({ kind: "or" });
    } else {
      tokens.push({ kind: "text", value: word });
    }
  }

  return tokens;
}

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Resolve a lexed `field<op>value` token to a leaf.
 *
 * `:` dispatches on the field family — flags, legality, text filter, or a
 * numeric field used with implicit equality (`energy:2` ≡ `energy=2`). Any
 * other operator is numeric-only.
 */
function fieldTokenToLeaf(
  t: Extract<Token, { kind: "field" }>,
): CardSearchAst | null {
  const { name, op, value, quoted } = t;

  if (op === ":") {
    if (name === "is") return flagLeaf(value);

    const legalityStatus = LEGALITY_FIELD_ALIASES[name];
    if (legalityStatus) return legalityLeaf(legalityStatus, value);

    const field = FIELD_ALIASES[name];
    if (field) return filterLeafOrList(field, value, quoted);

    const numeric = NUMERIC_FIELD_ALIASES[name];
    if (numeric) return numericLeaf(numeric, "eq", value);

    throw new BadCardSearchQueryError(
      `Unknown filter field "${name}". Allowed: ${knownFieldList()}.`,
    );
  }

  const numeric = NUMERIC_FIELD_ALIASES[name];
  if (!numeric) {
    throw new BadCardSearchQueryError(
      `"${name}" cannot be compared with "${op}". Comparable fields: ${[
        ...new Set(Object.keys(NUMERIC_FIELD_ALIASES)),
      ]
        .sort()
        .join(", ")}.`,
    );
  }
  return numericLeaf(numeric, COMPARATORS[op]!, value);
}

function parseTokens(tokens: Token[]): CardSearchAst | null {
  let pos = 0;
  function peek(): Token | undefined {
    return tokens[pos];
  }
  function consume(): Token | undefined {
    return tokens[pos++];
  }

  function parseExpr(): CardSearchAst | null {
    return parseOr();
  }

  function parseOr(): CardSearchAst | null {
    let left = parseAnd();
    while (peek()?.kind === "or") {
      consume();
      const right = parseAnd();
      left = orAst(left, right);
    }
    return left;
  }

  function parseAnd(): CardSearchAst | null {
    const parts: CardSearchAst[] = [];
    while (true) {
      const t = peek();
      if (!t) break;
      if (t.kind === "or" || t.kind === "rparen") break;
      const u = parseUnary();
      if (u) parts.push(u);
    }
    return andAst(...parts);
  }

  function parseUnary(): CardSearchAst | null {
    if (peek()?.kind === "minus") {
      consume();
      // Recurse so `--x` parses as NOT(NOT(x)) and collapses via notAst.
      const child = parseUnary();
      return notAst(child);
    }
    return parseAtom();
  }

  function parseAtom(): CardSearchAst | null {
    const t = consume();
    if (!t) return null;
    switch (t.kind) {
      case "lparen": {
        const e = parseExpr();
        const close = consume();
        if (!close || close.kind !== "rparen") {
          throw new BadCardSearchQueryError("Missing closing parenthesis.");
        }
        return e;
      }
      case "exact":
        return exactNameLeaf(t.value);
      case "field":
        return fieldTokenToLeaf(t);
      case "text":
        return textLeaf(t.value);
      case "rparen":
        throw new BadCardSearchQueryError("Unexpected ')' .");
      case "or":
        throw new BadCardSearchQueryError("Unexpected 'or' .");
      case "minus":
        throw new BadCardSearchQueryError("Unexpected '-' .");
    }
  }

  const ast = parseExpr();
  if (peek()) {
    throw new BadCardSearchQueryError("Unexpected trailing input.");
  }
  return ast;
}

// ─── Validation ─────────────────────────────────────────────────────────────

const ALLOWED_FIELDS = new Set<CardSearchField>(
  Object.values(FIELD_ALIASES),
);
const ALLOWED_NUMERIC_FIELDS = new Set<CardSearchNumericField>(
  Object.values(NUMERIC_FIELD_ALIASES),
);
const ALLOWED_COMPARATORS = new Set<CardSearchComparator>(
  Object.values(COMPARATORS),
);
const ALLOWED_FLAGS = new Set<CardSearchFlag>(Object.values(FLAG_VALUES));
const ALLOWED_LEGALITY_STATUSES = new Set<CardSearchLegalityStatus>([
  "legal",
  "not_legal",
  "banned",
]);

/**
 * Format codes reach SQL as an identifier-ish literal. Keep them to the shape
 * `formats.code` actually uses so a hand-built AST cannot smuggle anything odd
 * through the RPC.
 */
const FORMAT_CODE_RE = /^[a-z0-9][a-z0-9_-]*$/;

/** Walk the AST enforcing node count, depth and leaf-value caps. */
export function validateCardSearchAst(ast: CardSearchAst): void {
  let nodes = 0;
  function walk(n: CardSearchAst, depth: number): void {
    nodes += 1;
    if (nodes > CARD_SEARCH_LIMITS.maxAstNodes) {
      throw new BadCardSearchQueryError(
        `Search query exceeds maximum complexity (${CARD_SEARCH_LIMITS.maxAstNodes} nodes).`,
      );
    }
    if (depth > CARD_SEARCH_LIMITS.maxAstDepth) {
      throw new BadCardSearchQueryError(
        `Search query exceeds maximum nesting depth (${CARD_SEARCH_LIMITS.maxAstDepth}).`,
      );
    }
    switch (n.op) {
      case "and":
      case "or":
        for (const c of n.children) walk(c, depth + 1);
        return;
      case "not":
        walk(n.child, depth + 1);
        return;
      case "text":
      case "exact_name":
        if (n.value.length > CARD_SEARCH_LIMITS.maxLeafValueLength) {
          throw new BadCardSearchQueryError("Search value too long.");
        }
        return;
      case "filter":
        if (!ALLOWED_FIELDS.has(n.field)) {
          throw new BadCardSearchQueryError(
            `Unsupported filter field: ${n.field}`,
          );
        }
        if (n.value.length > CARD_SEARCH_LIMITS.maxLeafValueLength) {
          throw new BadCardSearchQueryError("Filter value too long.");
        }
        return;
      case "numeric":
        if (!ALLOWED_NUMERIC_FIELDS.has(n.field)) {
          throw new BadCardSearchQueryError(
            `Unsupported numeric field: ${n.field}`,
          );
        }
        if (!ALLOWED_COMPARATORS.has(n.cmp)) {
          throw new BadCardSearchQueryError(`Unsupported comparator: ${n.cmp}`);
        }
        if (!Number.isFinite(n.value)) {
          throw new BadCardSearchQueryError("Numeric filter needs a number.");
        }
        if (Math.abs(n.value) > CARD_SEARCH_LIMITS.maxNumericValue) {
          throw new BadCardSearchQueryError("Numeric filter value out of range.");
        }
        return;
      case "legality":
        if (!ALLOWED_LEGALITY_STATUSES.has(n.status)) {
          throw new BadCardSearchQueryError(
            `Unsupported legality status: ${n.status}`,
          );
        }
        if (!FORMAT_CODE_RE.test(n.format)) {
          throw new BadCardSearchQueryError(
            `Invalid format code: "${n.format}".`,
          );
        }
        if (n.format.length > CARD_SEARCH_LIMITS.maxLeafValueLength) {
          throw new BadCardSearchQueryError("Format code too long.");
        }
        return;
      case "flag":
        if (!ALLOWED_FLAGS.has(n.value)) {
          throw new BadCardSearchQueryError(`Unsupported is: value: ${n.value}`);
        }
        return;
    }
  }
  walk(ast, 1);
}

// ─── Public parser entry point ──────────────────────────────────────────────

/**
 * Parse a raw user-supplied query into an AST plus diagnostics.
 *
 * Throws `BadCardSearchQueryError` on syntax errors (caller should map to 400).
 * Returns `{ ast: null }` for whitespace-only input.
 */
export function parseCardSearchQuery(raw: string): ParsedCardSearch {
  if (raw == null) return { ast: null };
  if (raw.length > CARD_SEARCH_LIMITS.maxInputLength) {
    throw new BadCardSearchQueryError(
      `Search query exceeds maximum length (${CARD_SEARCH_LIMITS.maxInputLength}).`,
    );
  }
  const tokens = lex(raw);
  const ast = parseTokens(tokens);
  if (ast) validateCardSearchAst(ast);
  return { ast };
}

/**
 * Find the first `text` leaf in the AST (if any).
 *
 * Used by the RPC path so we can apply the autocomplete-style ranker to results
 * when the user did include a free-text term, the same way the legacy text
 * path does.
 */
export function findTextLeafValue(ast: CardSearchAst): string | null {
  switch (ast.op) {
    case "text":
      return ast.value;
    case "and":
    case "or":
      for (const c of ast.children) {
        const v = findTextLeafValue(c);
        if (v) return v;
      }
      return null;
    case "not":
      return null;
    default:
      return null;
  }
}
