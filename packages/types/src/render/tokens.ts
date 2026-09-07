/**
 * `:rb_<key>:` tokens — the icon vocabulary inside card rules text — and the
 * neutral token stream every surface renders from.
 *
 * Nothing here knows about React, Discord emoji or Markdown. A surface maps
 * each {@link CardTextToken} to whatever it draws with; the walk over icons,
 * keywords, stack connectors and reminder italics happens once, here.
 */

import {
  KEYWORD_TAG_REGEX,
  isKeywordStackConnector,
  isKeywordTag,
  keywordAbsorbsTrailingCosts,
  takeKeywordBadgeCosts,
} from "../keywords.ts";
import { domainDisplayName, domainKey } from "./domains.ts";

/** Matches `:rb_<key>:` tokens. The first capture group is the key. */
export const TOKEN_REGEX = /:rb_(\w+):/g;

/** Labels that are not simply the title-cased key. */
const TOKEN_PLAIN_LABELS: Record<string, string> = {
  exhaust: "Exhaust",
  energy: "Energy",
  might: "Might",
  power: "Power",
  rune_rainbow: "Power",
};

/**
 * Human name for a `:rb_<key>:` token without braces — for tooltips / aria /
 * prefer-text mode. Copy/paste stand-ins use {@link tokenPlainLabel} instead.
 */
export function tokenDisplayName(key: string): string {
  const energy = /^energy_(\d+)$/.exec(key);
  if (energy) return `${energy[1]} Energy`;

  // Own-property check so keys like `constructor` / `toString` don't resolve to
  // inherited Object.prototype members.
  const known = Object.prototype.hasOwnProperty.call(TOKEN_PLAIN_LABELS, key)
    ? TOKEN_PLAIN_LABELS[key]
    : undefined;
  if (known) return known;

  const domain = key.startsWith("rune_") ? domainKey(key.slice("rune_".length)) : null;
  if (domain) return domainDisplayName(domain);

  return key
    .replace(/^rune_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Join display names: `3 Energy`, `3 Energy and Power`, `1 Energy, Order, and Order`. */
export function formatTokenDisplayList(keys: string[]): string {
  const names = keys.map(tokenDisplayName);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * Plain-text stand-in for a `:rb_<key>:` token (e.g. `{Exhaust}`, `{3}`, `{Power}`).
 * Braces keep symbols distinct from surrounding words when pasting into chat/docs.
 */
export function tokenPlainLabel(key: string): string {
  const energy = /^energy_(\d+)$/.exec(key);
  if (energy) return `{${energy[1]}}`;

  return `{${tokenDisplayName(key)}}`;
}

/**
 * Substitute every `:rb_<key>:` in a string. For surfaces whose output is
 * itself text — Discord emoji references, Markdown images — and which leave
 * keywords and reminder italics as they are.
 */
export function replaceIconTokens(
  text: string,
  replace: (key: string, match: string) => string,
): string {
  return text.replace(new RegExp(TOKEN_REGEX.source, "g"), (match: string, key: string) =>
    replace(key, match),
  );
}

// ─── Token stream ──────────────────────────────────────────────────────────────

/** A run of one or more adjacent `:rb_…:` tokens, a keyword badge, or prose. */
export type InlineCardTextToken =
  | { kind: "text"; text: string }
  /** Adjacent tokens arrive together so `3 Energy and Power` can be one phrase. */
  | { kind: "icon"; keys: string[] }
  | {
      kind: "keyword";
      /** The raw label between the brackets, untrimmed. */
      label: string;
      /** Followed by `[>]` in the source. */
      arrow: boolean;
      /** Preceded by a `[>>]` stack connector, which is consumed. */
      stackLeft: boolean;
      /** Trailing `:rb_energy_*:` / `:rb_rune_*:` absorbed into the badge. */
      costs: string[];
    }
  /** A bracketed span that is not a keyword (`[NO TEXT]`, `[3 Might]`). */
  | { kind: "bracket"; label: string };

export type CardTextToken =
  | InlineCardTextToken
  /** Reminder text — `_…_` in the source. */
  | { kind: "italic"; tokens: InlineCardTextToken[] };

/**
 * Icon runs, keyword badges and literal brackets inside one stretch of text
 * that has already had its reminder-italic markers dealt with.
 */
export function tokenizeCardTextInline(text: string): InlineCardTextToken[] {
  const tokens: InlineCardTextToken[] = [];
  // Groups: 1 = icon key, 2 = keyword label, 3 = optional arrow marker.
  const regex = new RegExp(`${TOKEN_REGEX.source}|${KEYWORD_TAG_REGEX.source}`, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let pendingStackLeft = false;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: "text", text: text.slice(lastIndex, match.index) });
    }

    const iconKey = match[1];
    const keywordLabel = match[2];
    const arrow = match[3] != null;

    if (iconKey) {
      const keys = [iconKey];
      let end = regex.lastIndex;
      const peek = new RegExp(TOKEN_REGEX.source, "g");
      while (true) {
        peek.lastIndex = end;
        const next = peek.exec(text);
        if (!next || next.index !== end) break;
        keys.push(next[1]!);
        end = peek.lastIndex;
      }
      regex.lastIndex = end;
      tokens.push({ kind: "icon", keys });
      lastIndex = end;
      continue;
    }

    if (keywordLabel != null && isKeywordStackConnector(keywordLabel)) {
      pendingStackLeft = true;
      lastIndex = regex.lastIndex;
      continue;
    }

    if (keywordLabel != null && isKeywordTag(keywordLabel)) {
      const { keys: costs, end } = keywordAbsorbsTrailingCosts(keywordLabel)
        ? takeKeywordBadgeCosts(text, regex.lastIndex)
        : { keys: [], end: regex.lastIndex };
      regex.lastIndex = end;
      tokens.push({
        kind: "keyword",
        label: keywordLabel,
        arrow,
        stackLeft: pendingStackLeft,
        costs,
      });
      pendingStackLeft = false;
      lastIndex = end;
      continue;
    }

    if (keywordLabel != null) tokens.push({ kind: "bracket", label: keywordLabel });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ kind: "text", text: text.slice(lastIndex) });
  }
  return tokens;
}

/**
 * Italic reminder spans are wrapped in `_…_`. Underscores inside `:rb_…:`
 * tokens must not count as delimiters, so tokens are masked before the split.
 */
const ITALIC_SEGMENT_PATTERN = /(_(?:[^_\n]|:[^:\n]+:)+_)/;

/**
 * One line of rules text as a token stream, reminder italics included. Lines
 * come from {@link normalizeCardTextLayout}; a surface renders each token.
 */
export function tokenizeCardTextLine(line: string): CardTextToken[] {
  const { masked, tokens: iconTokens } = maskIconTokens(line);
  const out: CardTextToken[] = [];

  for (const segment of masked.split(ITALIC_SEGMENT_PATTERN)) {
    if (segment.length === 0) continue;
    if (segment.startsWith("_") && segment.endsWith("_") && segment.length > 2) {
      out.push({
        kind: "italic",
        tokens: tokenizeCardTextInline(restoreIconTokens(segment.slice(1, -1), iconTokens)),
      });
      continue;
    }
    out.push(...tokenizeCardTextInline(restoreIconTokens(segment, iconTokens)));
  }
  return out;
}

// ─── Token masking ─────────────────────────────────────────────────────────────

/** Private-use bookends so restored text can't collide with card copy. */
const TOKEN_PLACEHOLDER = /\uE000(\d+)\uE001/g;
/** Escaped form of a pre-existing sentinel so restore won't treat it as ours. */
const ESCAPED_TOKEN_PLACEHOLDER = /\uE002(\d+)\uE003/g;

/** Mask `:rb_…:` tokens before italic/underscore splitting. */
export function maskIconTokens(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = [];
  // Escape literal sentinel-shaped runs so restore only replaces generated markers.
  const escaped = text.replace(TOKEN_PLACEHOLDER, (_, index: string) => `\uE002${index}\uE003`);
  const masked = escaped.replace(new RegExp(TOKEN_REGEX.source, "g"), (match) => {
    const index = tokens.length;
    tokens.push(match);
    return `\uE000${index}\uE001`;
  });
  return { masked, tokens };
}

export function restoreIconTokens(text: string, tokens: string[]): string {
  return text
    .replace(TOKEN_PLACEHOLDER, (_, index: string) => tokens[Number(index)] ?? "")
    .replace(ESCAPED_TOKEN_PLACEHOLDER, (_, index: string) => `\uE000${index}\uE001`);
}
