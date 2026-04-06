---
title: Parser
sidebar_label: Parser
sidebar_position: 3
---

`src/parser.ts` exports two functions: `parseCardRequests()` for extracting `[[Card Name]]` tokens from free text, and `normalizeCardName()` for consistent name lookups.

Both are re-exported by `@riftseer/core` — import from either package.

---

## `parseCardRequests(text)`

```typescript
function parseCardRequests(text: string): CardRequest[]
```

Scans arbitrary text for `[[Card Name|SET-123]]` tokens and returns structured `CardRequest` objects ready to pass to `provider.resolveRequest()`.

### Token syntax

| Format | Parsed as |
| --- | --- |
| `[[Card Name]]` | Name-only — fuzzy search |
| `[[Card Name\|SET]]` | Name + set code |
| `[[Card Name\|SET-123]]` | Name + set code + collector number (preferred) |
| `[[Card Name\|SET 123]]` | Same — space separator also accepted |
| `[[Card Name\SET]]` | Backslash also accepted as separator |

### Behaviour

- Strips fenced (` ``` `) and inline (`` ` ``) code blocks before scanning — tokens inside code are never matched.
- Returns up to 20 `CardRequest` objects; tokens beyond the 20th are silently dropped.
- Returns an empty array if no tokens are found.
- Never throws.

### Example

```typescript
import { parseCardRequests } from "@riftseer/types";

const requests = parseCardRequests("Have you tried [[Sun Disc]] with [[Bard|OGN-001]]?");
// [
//   { raw: "Sun Disc", name: "Sun Disc" },
//   { raw: "Bard|OGN-001", name: "Bard", set: "OGN", collector: "001" }
// ]
```

### Limits

| Constraint | Value |
| --- | --- |
| Max tokens per call | 20 |
| Separator characters | Pipe (U+007C) and backslash |
| Collector format | Last segment must be digits; separated from set code by `-` or space |

---

## `normalizeCardName(name)`

```typescript
function normalizeCardName(name: string): string
```

Normalizes a card name for consistent in-memory index lookups. Used to populate `name_normalized` on ingest, and to normalize query strings before searching.

### Transformation

1. Lowercases the input
2. Removes apostrophes (`'`), right single quotes (`'`), and hyphens (`-`)
3. Strips any remaining non-word, non-space characters
4. Collapses consecutive whitespace to a single space
5. Trims leading/trailing whitespace

### Example

```typescript
import { normalizeCardName } from "@riftseer/types";

normalizeCardName("Sun-Disc");   // "sundisc"
normalizeCardName("Ryze's Rune") // "ryzes rune"
```
