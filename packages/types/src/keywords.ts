// ─── Card keyword tags ─────────────────────────────────────────────────────────
// Rules text marks keywords as `[Accelerate]`, `[Reaction]`, `[Deflect 3]`, etc.
// On the physical cards these render as slanted rhombus badges; colours are
// cosmetic only (per Riftbound rules). Unknown keywords use the grey default.
//
// Colours are sampled from Rift Atlas keyword badge assets
// (`…/riftbound/static/icons/<name>.webp`) and cross-checked against printed
// card art. Several Unleashed/Vendetta icons 404 on their CDN — those were
// taken from card scans instead (noted below).

export interface KeywordStyle {
  /** Badge fill. */
  background: string;
  /** Label colour. */
  color: string;
}

/** Grey rhombus + white label — matches unflavoured keywords on card art. */
export const DEFAULT_KEYWORD_STYLE: KeywordStyle = {
  background: "#6D6D6D",
  color: "#FFFFFF",
};

/** Teal family — Accelerate / Reaction / Hidden / … (RA `accelerate.webp`). */
const TEAL: KeywordStyle = { background: "#1CA28A", color: "#FFFFFF" };

/** Magenta family — Assault / Tank / Shield / Backline (RA `assault.webp`). */
const MAGENTA: KeywordStyle = { background: "#CA356D", color: "#FFFFFF" };

/** Olive/lime family — Temporary / Deflect / Hunt / … (RA `temporary.webp`). Black label. */
const OLIVE: KeywordStyle = { background: "#9AB231", color: "#000000" };

/**
 * Per-keyword overrides, keyed by {@link keywordBaseKey}.
 * Grey keywords (Add, Stun, Buff, Equip, Mighty, Vision, Weaponmaster, Empower,
 * Burn, Unique, Predict, …) intentionally omit entries and use the default.
 */
export const KEYWORD_STYLES: Record<string, KeywordStyle> = {
  // Teal
  accelerate: TEAL,
  action: TEAL,
  reaction: TEAL,
  hidden: TEAL,
  repeat: TEAL,
  ambush: TEAL, // RA icon 404 — confirmed teal on UNL-178 / UNL-166
  legion: TEAL, // RA `legion.webp`
  "quick-draw": TEAL, // RA `quick-draw.webp`
  flow: TEAL, // RA icon 404 — confirmed teal on VEN-098

  // Magenta
  assault: MAGENTA,
  tank: MAGENTA,
  shield: MAGENTA, // confirmed magenta on VEN-117
  backline: MAGENTA, // RA icon 404 — confirmed magenta on UNL-145 / UNL-043

  // Olive + black text
  temporary: OLIVE,
  deflect: OLIVE,
  deathknell: OLIVE,
  ganking: OLIVE,
  empowered: OLIVE, // RA icon 404 — confirmed olive on VEN-093
  hunt: OLIVE, // RA icon 404 — confirmed olive on UNL-016
  level: OLIVE, // RA icon 404 — confirmed olive on UNL-016
};

/**
 * Matches `[Keyword]` / `[Deflect 3]` in rules text, optionally followed by
 * `[&gt;]` / `[>]` (printed as a right-pointing arrow tip on the badge).
 * Does not match nested brackets.
 * Capture group 1 = inner label; group 2 = arrow marker when present.
 */
export const KEYWORD_TAG_REGEX = /\[([^\[\]]+)\](?:\[(&gt;|>)\])?/g;

/** "Deflect 3" → "deflect"; "ADD" → "add"; "Weaponmaster" → "weaponmaster". */
export function keywordBaseKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+\d+$/u, "")
    .replace(/\s+/gu, " ");
}

/** True when a `[…]` span should render as a keyword badge (not data junk). */
export function isKeywordTag(label: string): boolean {
  const trimmed = label.trim();
  if (trimmed.length === 0 || trimmed.length > 40) return false;
  if (/^no text$/iu.test(trimmed)) return false;
  return /^[A-Za-z]/u.test(trimmed);
}

/**
 * `[>>]` / `[&gt;&gt;]` between keyword badges — the next keyword gets a left
 * chevron connecting to the previous keyword's right chevron.
 */
export function isKeywordStackConnector(label: string): boolean {
  const trimmed = label.trim();
  return trimmed === ">>" || trimmed === "&gt;&gt;";
}

/**
 * Trailing `:rb_energy_*:` / `:rb_rune_*:` nest inside the badge as costs
 * (Empower, Equip, Repeat, Flow, …). [Add] is the exception — added resources
 * are the effect result and render after the badge.
 */
export function keywordAbsorbsTrailingCosts(label: string): boolean {
  return keywordBaseKey(label) !== "add";
}

/**
 * Energy/rune costs absorbed into a keyword badge. Activated abilities end the
 * cost run with an extra `:` (`:rb_energy_2::rb_rune_fury:: Double…`) and must
 * not match.
 */
export const KEYWORD_BADGE_COST_RUN =
  /^(?:\s*)((?::rb_(?:energy_\d+|rune_\w+):)+)(?!:)/;

export function takeKeywordBadgeCosts(
  text: string,
  from: number,
): { keys: string[]; end: number } {
  const match = KEYWORD_BADGE_COST_RUN.exec(text.slice(from));
  if (!match) return { keys: [], end: from };
  const keys = [...match[1]!.matchAll(/:rb_(\w+):/g)].map((m) => m[1]!);
  return { keys, end: from + match[0].length };
}

export function styleForKeyword(label: string): KeywordStyle {
  return KEYWORD_STYLES[keywordBaseKey(label)] ?? DEFAULT_KEYWORD_STYLE;
}

// ─── Extraction (search + ruling rules) ────────────────────────────────────────

/**
 * Every `[Keyword]` a card's rules text carries, as {@link keywordBaseKey}
 * values — `"[Deflect 3]"` and `"[Deflect 1]"` both yield `"deflect"`, so
 * `kw:deflect` finds them regardless of the printed number.
 *
 * Deduplicated and sorted so the result is a stable value: ingest compares it
 * against the stored column, and an unstable order would rewrite every card on
 * every run. Connectors (`[>]`, `[>>]`) and data junk are filtered by
 * {@link isKeywordTag}.
 *
 * This is the sole TypeScript derivation. A SQL mirror
 * (`card_keywords_from_text()`) exists only to backfill the column for cards
 * ingested before it existed — keep the two in step.
 */
export function extractCardKeywords(
  text: string | null | undefined,
): string[] {
  if (!text) return [];
  const found = new Set<string>();
  // `matchAll` needs its own regex instance — KEYWORD_TAG_REGEX is a shared
  // global-flagged literal and would otherwise carry `lastIndex` between calls.
  const re = new RegExp(KEYWORD_TAG_REGEX.source, "g");
  for (const match of text.matchAll(re)) {
    const label = match[1];
    if (!label || !isKeywordTag(label)) continue;
    const key = keywordBaseKey(label);
    if (key.length > 0) found.add(key);
  }
  return [...found].sort();
}
