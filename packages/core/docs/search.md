---
title: Autocomplete Search
sidebar_label: Search
sidebar_position: 5
---

`src/search.ts` implements the deterministic autocomplete ranking used by `searchByName()`. It is a pure function — no I/O, no external state. It can be tested and benchmarked in isolation.

---

## Score tiers

Results are ranked by score descending. Each query character length unlocks additional tiers:

| Score | Tier | Min query length |
|---|---|---|
| 1000 | Exact normalized name match | 1 |
| 900 | Full-name prefix (name starts with query) | 1 |
| 800 − n | Word-prefix (a word in the name starts with query, minus 10 per word position) | 2 |
| 700 − n | Substring (query appears anywhere, minus 2 per character offset) | 3 |
| 200 − n | Fuzzy — Levenshtein edit distance + optional Fuse.js merge (minus 50 per edit) | 4 |
| < 100 | Excluded from results entirely | — |

Tiebreak order within a score: match position (earlier is better) → name length (shorter is better) → alphabetical.

**Example — query `bar`:**

| Card | Tier | Score |
|---|---|---|
| Bard | Full-name prefix (`bard` starts with `bar`) | 900 |
| Barrow Stinger | Full-name prefix (`barrow stinger` starts with `bar`) | 900 → tiebreak: shorter name wins |
| Cannon Barrage | Word-prefix (`barrage` is word 2, starts with `bar`) | 790 |
| Singularity | No match | excluded |

---

## `autocompleteSearch(cards, query, limit, options?)`

```typescript
function autocompleteSearch(
  cards: Iterable<Card>,
  query: string,
  limit: number,
  options?: AutocompleteSearchOptions,
): Card[]
```

**Parameters**

| Parameter | Type | Description |
|---|---|---|
| `cards` | `Iterable<Card>` | Full card list to search against (e.g. provider index values) |
| `query` | `string` | Raw query string — normalized internally via `normalizeCardName` |
| `limit` | `number` | Max results to return |
| `options.fuse` | `Fuse<Card> \| null` | Optional Fuse instance for threshold-based fuzzy merging |
| `options.fuseHitLimit` | `number` | Cap on Fuse result count (default `max(limit * 5, 80)`) |

**Returns** up to `limit` cards, ranked by score descending.

**Behaviour**

- Queries shorter than 3 characters only return prefix matches — fuzzy is never applied at that length.
- When a Fuse instance is provided, Fuse hits are merged into the scoring pass for queries ≥ 4 characters. Fuse results are only used if their mapped score exceeds the minimum threshold and does not displace a higher-ranked non-fuzzy match.
- Returns `[]` when the normalized query is empty.

---

## `scoreCard(card, normQuery, queryLen)`

Exported for testing. Scores a single card against a pre-normalized query string.

```typescript
function scoreCard(card: Card, normQuery: string, queryLen: number): ScoredCard | null
```

Returns `null` when the card does not meet the minimum score threshold. The `ScoredCard` result carries `{ card, score, position }` where `position` is the character offset of the match in the normalized name (used for tiebreaking).

---

## Fuzzy edit distance

The fuzzy tier uses a single-row Levenshtein DP implementation. Maximum edit distance is:
- 1 edit for queries of length 4–5
- 2 edits for queries of length 6+

The algorithm short-circuits early when the length difference alone exceeds `maxDist`, and prunes rows where the entire row exceeds `maxDist`, keeping allocations small.

---

## Name normalization

All comparisons use normalized names produced by `normalizeCardName()`:

```typescript
// src/normalize.ts
export function normalizeCardName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['\u2019-]/g, "") // apostrophes, right-single-quote, hyphens
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
```

Cards are stored with a pre-computed `name_normalized` field. The query is normalized at search time using the same function so comparisons are always apples-to-apples.

---

## Fuse.js integration

The `SupabaseCardProvider` builds a [Fuse.js](https://www.fusejs.io) index over `name` (weight 0.7) and `name_normalized` (weight 0.3). The provider passes this instance into `autocompleteSearch` as `options.fuse`. The threshold is configurable via the `FUZZY_THRESHOLD` env var (default `0.4`).

Fuse results are mapped from Fuse's 0–1 score (0 = perfect) into the autocomplete fuzzy band (100–200) and merged only when they improve on the Levenshtein-based result for the same card.
