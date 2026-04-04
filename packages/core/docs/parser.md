---
title: Card Token Parser
sidebar_label: Parser
sidebar_position: 4
---

`src/parser.ts` exports `parseCardRequests()`, which scans arbitrary text for `[[Card Name]]` tokens and returns structured `CardRequest` objects ready to pass to `provider.resolveRequest()`.

This is the entry point for all bot-driven card lookups — the Discord bot and Reddit bot both call the `/api/v1/cards/resolve` endpoint, which uses `parseCardRequests` internally when receiving raw text.

---

## Token syntax

| Format | Parsed as |
|---|---|
| `[[Card Name]]` | Name-only — fuzzy search |
| `[[Card Name\|SET]]` | Name + set code |
| `[[Card Name\|SET-123]]` | Name + set code + collector number (preferred) |
| `[[Card Name\|SET 123]]` | Same — space separator also accepted |
| `[[Card Name\SET]]` | Backslash also accepted as separator |

The `|SET-123` form resolves to an exact printing. Without a collector number, the first card matching the set code is returned.

---

## `parseCardRequests(text)`

```typescript
function parseCardRequests(text: string): CardRequest[]
```

**Parameters**

- `text` — arbitrary string, e.g. a Discord message body or Reddit comment

**Returns** up to 20 `CardRequest` objects. Tokens beyond the 20th are silently dropped.

**Behaviour**

- Strips fenced (` ``` `) and inline (`` ` ``) code blocks before scanning, so tokens inside code are never matched.
- Returns an empty array if no tokens are found.
- Never throws.

**Example**

```typescript
import { parseCardRequests } from "@riftseer/core";

const requests = parseCardRequests("Have you tried [[Sun Disc]] with [[Bard|OGN-001]]?");
// [
//   { raw: "Sun Disc", name: "Sun Disc" },
//   { raw: "Bard|OGN-001", name: "Bard", set: "OGN", collector: "001" }
// ]
```

---

## `CardRequest` shape

```typescript
interface CardRequest {
  raw: string;        // Original text inside [[ ]], e.g. "Bard|OGN-001"
  name: string;       // Parsed card name, e.g. "Bard"
  set?: string;       // Uppercase set code, e.g. "OGN"
  collector?: string; // Collector number string, e.g. "001"
}
```

---

## Limits

| Constraint | Value |
|---|---|
| Max tokens per call | 20 |
| Separator characters | `|` and `\` |
| Collector format | Last segment must be digits; separated from set code by `-` or space |

---

## Usage in the resolve flow

```
User message containing [[...]] tokens
  → parseCardRequests(text)
  → CardRequest[]
  → provider.resolveRequest(req) (once per request)
  → ResolvedCard[]
  → API response
```

See [Provider Interface](./provider.md) for `resolveRequest` and [Types](./types.md) for `CardRequest` / `ResolvedCard`.
