import type { CardRequest } from "./card.ts";

const MAX_TOKENS = 20;

// Matches [[...]] anywhere in text.  The capture group is the inner content.
const CARD_PATTERN = /\[\[([^\]]+)\]\]/g;

// Strips fenced and inline code blocks before scanning for card tokens.
// We replace matches with spaces to preserve string length/positions (not strictly
// needed here, but makes it safe if callers check positions later).
const FENCED_CODE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`\n]+`/g;

/**
 * Parse up to MAX_TOKENS [[Card Name|SET-123]] tokens from arbitrary text.
 * - Ignores tokens inside code blocks.
 * - Handles | or \ as the set/collector separator.
 * - Supports SET, SET-123 and SET 123 (space) as collector formats.
 */
export function parseCardRequests(text: string): CardRequest[] {
  // Strip markdown backslash escapes on brackets (Reddit's editor produces \[\[ \]\])
  const unescaped = text.replace(/\\([[\]])/g, "$1");

  // Remove code blocks so we don't pick up [[...]] inside them
  const sanitised = unescaped
    .replace(FENCED_CODE, (m) => " ".repeat(m.length))
    .replace(INLINE_CODE, (m) => " ".repeat(m.length));

  const requests: CardRequest[] = [];
  let match: RegExpExecArray | null;

  CARD_PATTERN.lastIndex = 0; // reset in case the regex is reused
  while ((match = CARD_PATTERN.exec(sanitised)) !== null) {
    if (requests.length >= MAX_TOKENS) break;
    const inner = match[1].trim();
    if (inner.length === 0) continue;
    requests.push(parseToken(inner));
  }

  return requests;
}

/**
 * Parse the inner content of a [[...]] token into a CardRequest.
 *
 * Formats:
 *   Card Name              → { name: "Card Name" }
 *   Card Name|SET          → { name: "Card Name", set: "SET" }
 *   Card Name\SET          → { name: "Card Name", set: "SET" }
 *   Card Name|SET-123      → { name: "Card Name", set: "SET", collector: "123" }
 *   Card Name|SET 123      → { name: "Card Name", set: "SET", collector: "123" }
 */
function parseToken(inner: string): CardRequest {
  // The separator is the FIRST occurrence of | or \
  const sepIdx = inner.search(/[|\\]/);

  if (sepIdx === -1) {
    return { raw: inner, name: inner.trim() };
  }

  const name = inner.slice(0, sepIdx).trim();
  const rest = inner.slice(sepIdx + 1).trim();

  // Collector format: "SET-123" or "SET 123".
  //
  // The collector segment is NOT plain digits. Several numbering tracks print a
  // letter prefix — `T03` tokens, `SP3` special collections, `R01` runes — and
  // variants print a suffix (`42a` alternate art, `21*` signature). A `\d+`
  // pattern silently parsed `VEN-SP3` as a *set* named "VEN-SP3", which matched
  // nothing, so the request quietly fell back to the preferred printing instead
  // of the one that was asked for.
  //
  // Requiring at least one digit is what keeps this from swallowing a
  // hyphenated set code.
  const collectorMatch = rest.match(/^([A-Z0-9]+)[- ]([A-Z]*\d+[A-Za-z*★]*)$/i);
  if (collectorMatch) {
    return {
      raw: inner,
      name,
      set: collectorMatch[1].toUpperCase(),
      // Left as typed: `42a` and `42A` are different suffixes to uppercase
      // blindly. Both the SQL filter and pickRequestedPrinting compare
      // case-insensitively instead.
      collector: collectorMatch[2],
    };
  }

  return {
    raw: inner,
    name,
    set: rest.toUpperCase(),
  };
}

/**
 * Normalize a card name for consistent lookups.
 * Lowercases, removes apostrophes, replaces hyphens with spaces, strips non-word chars.
 */
export function normalizeCardName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['\u2019]/g, "") // apostrophes, right-single-quote
    .replace(/-/g, " ") // hyphens \u2192 spaces so "Thousand-Tailed" matches "Thousand Tailed"
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
