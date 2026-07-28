// ─── Card rules-text layout ────────────────────────────────────────────────────
// Upstream rules text arrives compressed — sentences run together and reminder
// italics markers are sometimes misplaced. Every client (web, Discord, Reddit)
// needs the same paragraph splitting, so it lives here in the zero-dependency
// package.

import {
  TOKEN_REGEX,
  formatTokenDisplayList,
  tokenPlainLabel,
} from "./icons.ts";
import { KEYWORD_TAG_REGEX, isKeywordTag } from "./keywords.ts";

function buildParenDepthMap(text: string): Uint16Array {
  const depth = new Uint16Array(text.length + 1);
  let current = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") current += 1;
    else if (ch === ")" && current > 0) current -= 1;
    depth[i + 1] = current;
  }
  return depth;
}

function collapseNewlinesInsideParentheses(text: string): string {
  let result = "";
  let depth = 0;
  let pendingSpace = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") {
      if (pendingSpace && result.length > 0 && !result.endsWith(" ")) result += " ";
      pendingSpace = false;
      depth += 1;
      result += ch;
      continue;
    }
    if (ch === ")") {
      pendingSpace = false;
      if (depth > 0) depth -= 1;
      result += ch;
      continue;
    }
    if (depth > 0 && /\s/.test(ch)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && result.length > 0 && !result.endsWith(" ")) result += " ";
    pendingSpace = false;
    result += ch;
  }

  if (pendingSpace && result.length > 0 && !result.endsWith(" ")) result += " ";
  return result;
}

/**
 * Normalizes card rules text formatting for clients that render plain text.
 *
 * - fixes malformed reminder italics markers around parentheticals
 * - inserts paragraph breaks between sentences in compressed text
 * - never inserts breaks inside parenthetical reminder text
 */
export function normalizeCardTextLayout(
  text: string,
  paragraphBreak = "\n",
): string {
  let normalized = text
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  normalized = collapseNewlinesInsideParentheses(normalized)
    .replace(/_ \(/g, "_(")
    .replace(/\)_([^\s_\n])/g, `)_${paragraphBreak}$1`)
    .replace(/\]([A-Z])/g, `]${paragraphBreak}$1`);

  const depthMap = buildParenDepthMap(normalized);
  normalized = normalized.replace(
    /([.)—])(\s*)(?=(?:[A-Z[]|:rb_))/g,
    (match: string, punct: string, spacing: string, index: number) => {
      const depthAfterPunct =
        punct === ")" ? depthMap[index + 1] ?? 0 : depthMap[index] ?? 0;
      if (depthAfterPunct > 0) return match;
      if (spacing.length > 0) return match;
      return `${punct}${paragraphBreak}`;
    },
  );

  return normalized;
}

const KEYWORD_COST_RUN = /^(?:\s*)((?::rb_(?:energy_\d+|rune_\w+):)+)/;

function formatTokenRun(keys: string[], preferText: boolean): string {
  if (keys.length === 0) return "";
  if (preferText) return formatTokenDisplayList(keys);
  return keys.map(tokenPlainLabel).join("");
}

function formatLineForClipboard(line: string, preferText: boolean): string {
  // Drop reminder-italic markers without touching underscores inside `:rb_…:`.
  const tokens: string[] = [];
  const masked = line.replace(new RegExp(TOKEN_REGEX.source, "g"), (match) => {
    const index = tokens.length;
    tokens.push(match);
    return `\uE000${index}\uE001`;
  });
  const plain = masked
    .replace(/_/g, "")
    .replace(/\uE000(\d+)\uE001/g, (_, index: string) => tokens[Number(index)] ?? "");

  const regex = new RegExp(
    `${TOKEN_REGEX.source}|${KEYWORD_TAG_REGEX.source}`,
    "g",
  );
  let out = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(plain)) !== null) {
    out += plain.slice(lastIndex, match.index);
    const iconKey = match[1];
    const keywordLabel = match[2];
    const arrow = match[3] != null;

    if (iconKey) {
      const keys = [iconKey];
      let end = regex.lastIndex;
      const peek = new RegExp(TOKEN_REGEX.source, "g");
      while (true) {
        peek.lastIndex = end;
        const next = peek.exec(plain);
        if (!next || next.index !== end) break;
        keys.push(next[1]!);
        end = peek.lastIndex;
      }
      regex.lastIndex = end;
      out += formatTokenRun(keys, preferText);
      lastIndex = end;
      continue;
    }

    if (keywordLabel != null && isKeywordTag(keywordLabel)) {
      const costMatch = KEYWORD_COST_RUN.exec(plain.slice(regex.lastIndex));
      const costKeys = costMatch
        ? [...costMatch[1]!.matchAll(/:rb_(\w+):/g)].map((m) => m[1]!)
        : [];
      if (costMatch) regex.lastIndex += costMatch[0].length;
      const costs = formatTokenRun(costKeys, preferText);
      out += `[${keywordLabel.trim()}]${arrow ? ">" : ""}${costs ? ` ${costs}` : ""}`;
      lastIndex = regex.lastIndex;
      continue;
    }

    if (keywordLabel != null) {
      out += `[${keywordLabel}]`;
    }

    lastIndex = regex.lastIndex;
  }

  out += plain.slice(lastIndex);
  return out.replace(/[^\S\n]+/g, " ").trim();
}

/**
 * Plain-text rules for clipboard paste. Symbols become `{3}` / `{Power}`;
 * prefer-text mode uses `3 Energy and Power`. Paragraphs stay on separate lines.
 */
export function formatCardTextForClipboard(
  text: string,
  options?: { preferText?: boolean },
): string {
  const preferText = options?.preferText ?? false;
  return normalizeCardTextLayout(text)
    .split("\n")
    .map((line) => formatLineForClipboard(line, preferText))
    .filter((line) => line.length > 0)
    .join("\n");
}
