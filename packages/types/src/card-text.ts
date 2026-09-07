// ─── Flavour text repair ───────────────────────────────────────────────────────
// Ingest and the provider both run this on the way in, so a repaired field is
// what every surface reads. Rules-text layout lives in `render/`.

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

