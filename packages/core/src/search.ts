/**
 * Deterministic autocomplete scoring for card name search.
 *
 * Ranking rules (score descending):
 *   1000  exact normalized name match
 *    900  full-name prefix (name starts with query)
 *    800  word-prefix: a word in the name starts with query — minus 10 per word position
 *    700  substring match — minus 2 per character of match offset
 *    200  fuzzy: full-name and per-word Levenshtein (max dist by query length), minus 50 per edit;
 *          optional Fuse.js merge when a configured Fuse instance is passed to autocompleteSearch
 *      0  no match
 *
 * Minimum query length per tier:
 *   1 char  → prefix-full only
 *   2 chars → + word-prefix
 *   3 chars → + substring
 *   4+      → + fuzzy (max edit-distance: 1 for len 4–5, 2 for len 6+)
 *
 * Tiebreak order: score DESC → match position ASC → name length ASC → name ASC
 *
 * Results with score < MIN_AUTOCOMPLETE_SCORE are excluded entirely.
 */

import type Fuse from "fuse.js";
import { normalizeCardName } from "./normalize.ts";
import type { Card } from "./types.ts";

// ─── Score constants ─────────────────────────────────────────────────────────

const SCORE_EXACT = 1000;
const SCORE_PREFIX_FULL = 900;
const SCORE_PREFIX_WORD_BASE = 800;
/** Subtract per word position so earlier words rank above later ones. */
const SCORE_PREFIX_WORD_POSITION_PENALTY = 10;
const SCORE_SUBSTRING_BASE = 700;
/** Subtract per character offset so earlier substrings rank above later ones. */
const SCORE_SUBSTRING_POSITION_PENALTY = 2;
const SCORE_FUZZY_BASE = 200;
/** Subtract per edit distance unit (substitution, insertion, deletion). */
const SCORE_FUZZY_DISTANCE_PENALTY = 50;

/** Any result below this score is excluded from autocomplete output. */
const MIN_AUTOCOMPLETE_SCORE = 100;

// ─── Minimum query lengths per tier ──────────────────────────────────────────

const MIN_LEN_PREFIX_FULL = 1;
const MIN_LEN_PREFIX_WORD = 2;
const MIN_LEN_SUBSTRING = 3;
const MIN_LEN_FUZZY = 4;

// ─── Levenshtein edit distance ────────────────────────────────────────────────

/**
 * Compute Levenshtein edit distance between two strings.
 * Returns 99 immediately when the length difference alone exceeds maxDist,
 * avoiding unnecessary work for clearly dissimilar strings.
 */
function levenshtein(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return 99;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Single-row DP to keep allocations small.
  const prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr: number[] = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j - 1] + cost, prev[j] + 1, curr[j - 1] + 1);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    // Prune: if the entire row is above maxDist there can be no match.
    if (rowMin > maxDist) return 99;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

/**
 * Map Fuse.js relevance score (0 = perfect, 1 = mismatch) into the autocomplete fuzzy band.
 * Fuse instances from the provider use FUZZY_THRESHOLD in their options; only hits returned
 * by fuse.search are merged.
 */
function scoreFromFuseResult(fuseScore: number | undefined): number {
  if (fuseScore === undefined) return 0;
  const s = Math.min(Math.max(fuseScore, 0), 1);
  return Math.round(SCORE_FUZZY_BASE - s * (SCORE_FUZZY_BASE - MIN_AUTOCOMPLETE_SCORE));
}

// ─── Card scorer ─────────────────────────────────────────────────────────────

interface ScoredCard {
  card: Card;
  score: number;
  /** Character offset of the match in the normalized name (for tiebreaking). */
  position: number;
}

/**
 * Score a single card against a pre-normalized query string.
 * Returns null when the card does not meet the minimum score threshold.
 */
export function scoreCard(card: Card, normQuery: string, queryLen: number): ScoredCard | null {
  const normName = card.name_normalized;

  // 1. Exact normalized name match.
  if (normName === normQuery) {
    return { card, score: SCORE_EXACT, position: 0 };
  }

  // 2. Full-name prefix: the normalized name begins with the full query.
  if (queryLen >= MIN_LEN_PREFIX_FULL && normName.startsWith(normQuery)) {
    return { card, score: SCORE_PREFIX_FULL, position: 0 };
  }

  // 3. Word-prefix: an individual word in the name begins with the query.
  if (queryLen >= MIN_LEN_PREFIX_WORD) {
    const words = normName.split(" ");
    let charOffset = 0;
    for (let i = 0; i < words.length; i++) {
      if (words[i].startsWith(normQuery)) {
        const score = SCORE_PREFIX_WORD_BASE - i * SCORE_PREFIX_WORD_POSITION_PENALTY;
        return { card, score, position: charOffset };
      }
      charOffset += words[i].length + 1; // +1 for the space
    }
  }

  // 4. Substring: query appears anywhere in the normalized name.
  if (queryLen >= MIN_LEN_SUBSTRING) {
    const idx = normName.indexOf(normQuery);
    if (idx !== -1) {
      const score = SCORE_SUBSTRING_BASE - idx * SCORE_SUBSTRING_POSITION_PENALTY;
      return { card, score, position: idx };
    }
  }

  // 5. Fuzzy (edit-distance): only for queries of length >= 4.
  if (queryLen >= MIN_LEN_FUZZY) {
    // Allow 1 edit for short queries, 2 for longer ones.
    const maxDist = queryLen <= 5 ? 1 : 2;

    let bestDist = 99;
    let bestPos = 0;

    const fullDist = levenshtein(normQuery, normName, maxDist);
    if (fullDist <= maxDist) {
      bestDist = fullDist;
      bestPos = 0;
    }

    const words = normName.split(" ");
    let charOffset = 0;
    for (const word of words) {
      const dist = levenshtein(normQuery, word, maxDist);
      if (dist <= maxDist && (dist < bestDist || (dist === bestDist && charOffset < bestPos))) {
        bestDist = dist;
        bestPos = charOffset;
      }
      charOffset += word.length + 1;
    }

    if (bestDist <= maxDist) {
      const score = SCORE_FUZZY_BASE - bestDist * SCORE_FUZZY_DISTANCE_PENALTY;
      if (score >= MIN_AUTOCOMPLETE_SCORE) {
        return { card, score, position: bestPos };
      }
    }
  }

  return null;
}

// ─── Comparator ──────────────────────────────────────────────────────────────

function compareScoredCards(a: ScoredCard, b: ScoredCard): number {
  // 1. Higher score is better.
  if (b.score !== a.score) return b.score - a.score;
  // 2. Earlier match position is better.
  if (a.position !== b.position) return a.position - b.position;
  // 3. Shorter name is better (more specific match).
  const lenDiff = a.card.name_normalized.length - b.card.name_normalized.length;
  if (lenDiff !== 0) return lenDiff;
  // 4. Alphabetical as a final stable tiebreak.
  return a.card.name.localeCompare(b.card.name);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type AutocompleteSearchOptions = {
  /**
   * When provided, fuse.search(normQuery) results are merged for query length >= MIN_LEN_FUZZY.
   * The instance should already use the app FUZZY_THRESHOLD.
   */
  fuse?: Fuse<Card> | null;
  /** Cap on Fuse result count (default {@code max(limit * 5, 80)}). */
  fuseHitLimit?: number;
};

/**
 * Autocomplete-style card search with deterministic, position-aware ranking.
 *
 * - Short queries (< 3 chars) only return prefix matches, never fuzzy guesses.
 * - Fuzzy matching is only applied when query length >= 4.
 * - Results below MIN_AUTOCOMPLETE_SCORE are excluded entirely.
 * - Results are ranked: exact > prefix > word-prefix > substring > fuzzy.
 *
 * @param cards   Full card list to search (e.g. provider index values).
 * @param query   Raw query string (will be normalized internally).
 * @param limit   Maximum results to return.
 * @param options Optional Fuse instance (provider index) to merge threshold-based fuzzy hits.
 */
export function autocompleteSearch(
  cards: Iterable<Card>,
  query: string,
  limit: number,
  options?: AutocompleteSearchOptions,
): Card[] {
  const normQuery = normalizeCardName(query);
  const queryLen = normQuery.length;

  if (queryLen === 0) return [];

  const cardList = Array.from(cards);
  const fuse = options?.fuse ?? null;
  const allowedIds = fuse ? new Set(cardList.map((c) => c.id)) : null;

  const bestById = new Map<string, ScoredCard>();

  for (const card of cardList) {
    const result = scoreCard(card, normQuery, queryLen);
    if (result !== null) {
      bestById.set(card.id, result);
    }
  }

  if (fuse && queryLen >= MIN_LEN_FUZZY) {
    const fuseLimit = options?.fuseHitLimit ?? Math.max(limit * 5, 80);
    const hits = fuse.search(normQuery, { limit: fuseLimit });
    for (const hit of hits) {
      if (allowedIds && !allowedIds.has(hit.item.id)) continue;
      const fuseScoreVal = scoreFromFuseResult(hit.score);
      if (fuseScoreVal < MIN_AUTOCOMPLETE_SCORE) continue;
      const existing = bestById.get(hit.item.id);
      if (existing !== undefined && existing.score > SCORE_FUZZY_BASE) continue;
      if (existing !== undefined && fuseScoreVal <= existing.score) continue;
      bestById.set(hit.item.id, { card: hit.item, score: fuseScoreVal, position: 0 });
    }
  }

  const scored = [...bestById.values()];
  scored.sort(compareScoredCards);

  return scored.slice(0, limit).map((s) => s.card);
}
