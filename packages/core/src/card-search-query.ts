/**
 * Card search query language — Scryfall-inspired syntax parsed into an AST.
 *
 * Grammar (v1):
 *   expr     := orExpr
 *   orExpr   := andExpr ( "or" andExpr )*
 *   andExpr  := unaryExpr unaryExpr*           -- adjacency = AND
 *   unaryExpr:= "-" atom | atom
 *   atom     := "(" expr ")"
 *             | "!" value                       -- exact card name
 *             | field ":" value                 -- structured filter
 *             | value                           -- free text (FTS)
 *   value    := QUOTED_STRING | BARE_WORD
 *   field    := "a" | "artist" | "t" | "type" | "r" | "rarity"
 *
 * Implicit AND binds tighter than `or`. Use parentheses to disambiguate.
 *
 * The AST is the contract between the HTTP layer (which parses) and the
 * provider (which executes). Free-text leaves go through Postgres FTS;
 * exact-name leaves use the `name_normalized` index; filter leaves whitelist
 * a small set of jsonb / artist columns. See `requiresRpc` for the routing
 * gate that decides between PostgREST direct paths and the RPC.
 */

import { normalizeCardName } from "./normalize.ts";

// ─── AST types ───────────────────────────────────────────────────────────────

export type CardSearchField = "type" | "rarity" | "artist";

export type CardSearchAst =
  | { op: "and"; children: CardSearchAst[] }
  | { op: "or"; children: CardSearchAst[] }
  | { op: "not"; child: CardSearchAst }
  | { op: "text"; value: string }
  | { op: "exact_name"; value: string }
  | { op: "filter"; field: CardSearchField; value: string };

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
} as const;

const FIELD_ALIASES: Record<string, CardSearchField> = {
  a: "artist",
  artist: "artist",
  t: "type",
  type: "type",
  r: "rarity",
  rarity: "rarity",
};

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
  return v.length === 0 ? null : { op: "filter", field, value: v };
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
  | { kind: "field"; field: CardSearchField; value: string }
  | { kind: "text"; value: string };

const FIELD_NAME_RE = /^[a-zA-Z]+$/;

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

  function readValue(): string {
    if (input[i] === '"') return readQuoted();
    return readBareWord();
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
      const value = readValue();
      tokens.push({ kind: "exact", value });
      continue;
    }
    if (c === '"') {
      tokens.push({ kind: "text", value: readQuoted() });
      continue;
    }

    // Try `field:value`. Look ahead for a colon before whitespace/paren.
    let j = i;
    while (j < n) {
      const ch = input[j];
      if (isWhitespace(ch) || ch === "(" || ch === ")" || ch === ":") break;
      j += 1;
    }
    if (j < n && input[j] === ":") {
      const name = input.slice(i, j);
      if (FIELD_NAME_RE.test(name)) {
        const fieldKey = name.toLowerCase();
        const field = FIELD_ALIASES[fieldKey];
        if (!field) {
          throw new BadCardSearchQueryError(
            `Unknown filter field "${name}". Allowed: a, t, r (artist, type, rarity).`,
          );
        }
        i = j + 1;
        const value = readValue();
        tokens.push({ kind: "field", field, value });
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
        return filterLeaf(t.field, t.value);
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

const ALLOWED_FIELDS = new Set<CardSearchField>(["type", "rarity", "artist"]);

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

// ─── Routing helpers (used by the Supabase provider) ────────────────────────

/** True when the AST is a single `exact_name` leaf — eligible for the fast normalized-name lookup. */
export function isExactNameOnly(
  ast: CardSearchAst,
): ast is { op: "exact_name"; value: string } {
  return ast.op === "exact_name";
}

/** True when the AST is a single `text` leaf — eligible for the existing exact-then-FTS legacy path. */
export function isLegacyTextOnly(
  ast: CardSearchAst,
): ast is { op: "text"; value: string } {
  return ast.op === "text";
}

/**
 * True when the AST cannot be expressed with simple PostgREST filters and must
 * be evaluated by the RPC. Currently: any OR, any nested AND/OR/NOT inside a
 * NOT, or any non-leaf-or-NOT-leaf child of an AND.
 */
export function requiresRpc(ast: CardSearchAst): boolean {
  switch (ast.op) {
    case "or":
      return true;
    case "not": {
      const c = ast.child;
      return c.op === "and" || c.op === "or" || c.op === "not";
    }
    case "and":
      for (const c of ast.children) {
        if (c.op === "and" || c.op === "or") return true;
        if (c.op === "not") {
          const gc = c.child;
          if (gc.op === "and" || gc.op === "or" || gc.op === "not") return true;
        }
      }
      return false;
    default:
      return false;
  }
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
