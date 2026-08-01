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
import {
  KEYWORD_TAG_REGEX,
  isKeywordStackConnector,
  isKeywordTag,
  keywordAbsorbsTrailingCosts,
  takeKeywordBadgeCosts,
} from "./keywords.ts";

/** True for scalar values `String.fromCodePoint` accepts (not surrogates / out of range). */
function isUnicodeScalarValue(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 0x10ffff &&
    !(value >= 0xd800 && value <= 0xdfff)
  );
}

/**
 * RiftCodex flavour text loses quote characters at the *edges* of the field.
 * Most often the opening quote of a line of dialogue:
 *   If you hit a wall, hit it hard!"\n- Vi   \u2192   "If you hit a wall\u2026!"\n- Vi
 * but the closer goes missing just as readily:
 *   He doesn't bother to shout "Freeze!      \u2192   \u2026to shout "Freeze!"
 * and occasionally both:
 *   Gentle" is not the same as "harmless.    \u2192   "Gentle" is not \u2026 "harmless."
 *
 * Also strips stray HTML tag debris sometimes left in the same field.
 *
 * The repair works on the quote *characters*, not on the attribution: each
 * quote is read as an opener or a closer from the text around it (see
 * {@link firstQuoteIsCloser}). A field whose first quote closes something must
 * have lost its opener, and a field left holding an open quote must have lost
 * its closer. That covers all 9 broken fields in the live corpus; an earlier
 * version keyed off a trailing "\u2014 Vi" attribution and silently skipped the 6
 * that have none, Monster Harpoon among them.
 *
 * Well-formed prose containing a quoted word (`A dragon's definition of "prey"
 * is all inclusive.`) opens with an opener and balances, so it is untouched.
 *
 * The attribution may sit on its own line ("...!"\n- Vi) or run on after the
 * closing quote ("...!" -Azir); both shapes occur upstream, roughly 27 and 82
 * times respectively across the 770 cards that carry flavour text. **Neither is
 * rewritten.** The printed cards disagree too — Glasc Mixologist runs its
 * attribution on, Lacerate breaks before it — and the field gives no way to
 * tell them apart, so a line break is only ever shown where upstream sent one.
 *
 * Idempotent: repaired text is balanced and opens with an opener, so running
 * this on both ingest and read never doubles a quote.
 */
export function repairFlavourText(flavour: string): string {
  let text = flavour
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Tidy the whitespace around every break upstream sent: a blank line before
    // the attribution (`Night approaches!"\n \n- Diana`), a space left at the
    // end of the quote (`everyone?" \n- Common last words`), or one indenting
    // the attribution (`your fear."\n - Jhin`). No card prints a blank line or
    // a hanging indent. Collapsing is not the same as inventing a break — the
    // newline upstream sent is kept, only the padding around it goes.
    .replace(/[^\S\n]*\n\s*/g, "\n");
  text = text
    .replace(HTML_TAG, "")
    .replace(HTML_DEBRIS_HEAD, "")
    .replace(HTML_DEBRIS_TAIL, "");

  const leadMatch = text.match(/^\s*/);
  const lead = leadMatch?.[0] ?? "";
  let body = text.slice(lead.length);
  if (body.length === 0 || countQuotes(body) === 0) return text;

  if (firstQuoteIsCloser(body)) body = `"${body}`;
  // Whatever the shape, an odd number of quotes means one edge is still open.
  // The prepend above fixed the leading edge, so the survivor is the trailing
  // one \u2014 and an attribution cannot be in the way, because the patterns that
  // recognise one require a closing quote directly before the dash.
  if (countQuotes(body) % 2 === 1) body = `${body.trimEnd()}"`;

  // Upstream's own line breaks are preserved, and none are invented. An
  // attribution runs on after the closing quote on some cards and starts its
  // own line on others \u2014 Glasc Mixologist prints `"\u2026dosage." \u2014Renata Glasc`
  // on one flowing line while Lacerate breaks before `\u2014Ambessa` \u2014 and RiftCodex
  // flattens both to the same run-on shape, so the field cannot tell us which
  // this is. Guessing got it wrong more often than leaving it alone; where the
  // break matters, an admin edit is the answer.
  return lead + body;
}

function countQuotes(text: string): number {
  return text.match(/["\u201c\u201d]/g)?.length ?? 0;
}

/**
 * True when the first quote in `text` reads as closing a quotation rather than
 * opening one \u2014 the fingerprint of a dropped opening quote.
 *
 * Curly quotes say so directly. A straight `"` is judged by its neighbours: a
 * closer hugs the word it follows and is itself followed by a space, a
 * punctuation mark, a dash (`regret."- Mel`) or the end of the field. That
 * keeps a legitimate opener after an em dash or bracket (`\u2014"Hello"`) from being
 * misread, since a real opener always runs straight into the word it
 * introduces.
 */
function firstQuoteIsCloser(text: string): boolean {
  const index = text.search(/["\u201c\u201d]/);
  if (index < 0) return false;
  if (text[index] === "\u201c") return false;
  if (text[index] === "\u201d") return true;
  if (index === 0) return false;

  const previous = text[index - 1]!;
  const next = text[index + 1];
  const followsWord = !/\s/.test(previous);
  const introducesWord =
    next !== undefined && !/[\s.,;:!?)\]\-\u2013\u2014]/.test(next);
  return followsWord && !introducesWord;
}

/**
 * Well-formed tags, which must close. Upstream ships `</e>` among others.
 * Requiring the `>` keeps `[^>]*` from running to the end of the string.
 */
const HTML_TAG = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?>/g;

/**
 * Truncated debris, which upstream leaves only at the very start or end of the
 * field (`<em?"I will light our path.`, `...last words</em`). Anchoring is what
 * stops a bare `<` mid-sentence from eating the rest of the text.
 */
const HTML_DEBRIS_HEAD = /^<\/?[a-zA-Z][a-zA-Z0-9]*[?!]?/;
const HTML_DEBRIS_TAIL = /<\/?[a-zA-Z][a-zA-Z0-9]*$/;

/** Upstream rules text sometimes ships HTML entities (`&quot;`, `&gt;`, …). */
export function decodeCardTextEntities(text: string): string {
  let prev = "";
  let current = text;
  while (current !== prev) {
    prev = current;
    current = current
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#(\d+);/g, (_, code: string) => {
        const value = Number(code);
        return isUnicodeScalarValue(value) ? String.fromCodePoint(value) : "";
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
        const value = Number.parseInt(hex, 16);
        return isUnicodeScalarValue(value) ? String.fromCodePoint(value) : "";
      })
      .replace(/&amp;/gi, "&");
  }
  return current;
}

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
  let normalized = decodeCardTextEntities(text)
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  normalized = collapseNewlinesInsideParentheses(normalized)
    .replace(/_ \(/g, "_(")
    .replace(/\)_([^\s_\n])/g, `)_${paragraphBreak}$1`)
    // Standalone keyword chains (e.g. [Accelerate][Assault 2][Deflect]).
    .replace(
      /(\[[A-Za-z][^\]]*\])(?=\[(?!&gt;|>|&gt;&gt;|>>)[A-Za-z])/g,
      `$1${paragraphBreak}`,
    )
    // Activated ability costs glued to a keyword (e.g. [Deflect]:rb_energy_2::…).
    .replace(
      /\](?=:rb_(?:energy_\d+|rune_\w+|exhaust|might|power):)/g,
      `]${paragraphBreak}`,
    )
    // The mirror image: a keyword line that *ends* in its cost, with the next
    // ability's keyword glued straight on — `[Empower] :rb_rune_body:[Empowered]`.
    // `[>]` is excluded because it continues the keyword it follows rather than
    // starting a line ("[Empowered][>] I have +3 …").
    .replace(
      /(:rb_\w+:)(?=\[(?!&gt;|>)[A-Za-z])/g,
      `$1${paragraphBreak}`,
    )
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

/** One paragraph (`<p>`) or bullet list (`<ul>`) from upstream `text.rich`. */
export type CardTextBlock =
  | { type: "paragraph"; lines: string[] }
  | { type: "list"; items: string[] };

/** Strip RiftCodex rich fragments to plain tokens/keywords for rendering. */
export function richFragmentToPlain(fragment: string): string {
  let text = fragment.trim();
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<em>([\s\S]*?)<\/em>/gi, "_$1_")
    .replace(/<i>([\s\S]*?)<\/i>/gi, "_$1_")
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, "$1")
    .replace(/<b>([\s\S]*?)<\/b>/gi, "$1")
    .replace(/<[^>]+>/g, "");
  return decodeCardTextEntities(text);
}

/**
 * Parses the small HTML subset used in `text.rich` (`<p>`, `<br>`, `<ul>`,
 * `<li>`). Returns null when there is no bullet list — callers should fall
 * back to `text.plain` + {@link normalizeCardTextLayout}.
 */
export function parseCardTextRich(rich: string): CardTextBlock[] | null {
  const trimmed = rich.trim();
  if (!/<ul\b/i.test(trimmed)) return null;

  const blocks: CardTextBlock[] = [];
  const blockRe = /<(p|ul)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(trimmed)) !== null) {
    const tag = match[1]!.toLowerCase();
    const inner = match[2]!;

    if (tag === "p") {
      const lines = normalizeCardTextLayout(richFragmentToPlain(inner))
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length > 0) blocks.push({ type: "paragraph", lines });
      continue;
    }

    const items: string[] = [];
    const itemRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRe.exec(inner)) !== null) {
      const plain = richFragmentToPlain(itemMatch[1]!);
      // Keep break-only items (`<li><br /></li>`) as an explicit `\n` for renderers.
      if (plain.length === 0) continue;
      const item = normalizeCardTextLayout(plain);
      items.push(item.length > 0 ? item : "\n");
    }
    if (items.length > 0) blocks.push({ type: "list", items });
  }

  return blocks.some((block) => block.type === "list") ? blocks : null;
}

/** Private-use bookends so restored text can't collide with card copy. */
const TOKEN_PLACEHOLDER = /\uE000(\d+)\uE001/g;
/** Escaped form of a pre-existing sentinel so restore won't treat it as ours. */
const ESCAPED_TOKEN_PLACEHOLDER = /\uE002(\d+)\uE003/g;

/** Mask `:rb_…:` tokens before italic/underscore splitting. */
export function maskIconTokens(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = [];
  // Escape literal sentinel-shaped runs so restore only replaces generated markers.
  const escaped = text.replace(
    TOKEN_PLACEHOLDER,
    (_, index: string) => `\uE002${index}\uE003`,
  );
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

function formatTokenRun(keys: string[], preferText: boolean): string {
  if (keys.length === 0) return "";
  if (preferText) return formatTokenDisplayList(keys);
  return keys.map(tokenPlainLabel).join("");
}

function formatLineForClipboard(line: string, preferText: boolean): string {
  // Drop reminder-italic markers without touching underscores inside `:rb_…:`.
  const { masked, tokens } = maskIconTokens(line);
  const plain = restoreIconTokens(masked.replace(/_/g, ""), tokens);

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

    if (keywordLabel != null && isKeywordStackConnector(keywordLabel)) {
      lastIndex = regex.lastIndex;
      continue;
    }

    if (keywordLabel != null && isKeywordTag(keywordLabel)) {
      let costKeys: string[] = [];
      let costEnd = regex.lastIndex;
      if (keywordAbsorbsTrailingCosts(keywordLabel)) {
        const costs = takeKeywordBadgeCosts(plain, regex.lastIndex);
        costKeys = costs.keys;
        costEnd = costs.end;
      }
      if (costKeys.length > 0) regex.lastIndex = costEnd;
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
