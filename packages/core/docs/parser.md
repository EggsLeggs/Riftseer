---
title: Card Token Parser
sidebar_label: Parser
sidebar_position: 4
---

`src/parser.ts` exports `parseCardRequests()`, a **free-text** helper that scans arbitrary strings for `[[Card Name]]` tokens and returns structured `CardRequest` objects ready to pass to `provider.resolveRequest()`.

`POST /api/v1/cards/resolve` accepts JSON `{ requests: string[] }` (up to 20 strings). For **each** string, the API wraps it as `[[…]]` and runs `parseCardRequests` once, then resolves the resulting `CardRequest` — see `packages/api/src/routes/cards.ts`. That is different from passing an entire message body through `parseCardRequests` in one shot: clients often build one string per card (for example `packages/discord-bot/src/handlers/card.ts` composes `name` and optional `set` into a single request string before calling the API).

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

```text
Client builds one string per card (plain name or Name|SET-### inside the bracket grammar)
  → POST /api/v1/cards/resolve { requests: string[] }
  → per string: parseCardRequests("[[…]]") → CardRequest
  → provider.resolveRequest(req)
  → ResolvedCard[]
  → API response
```

See [Provider Interface](./provider.md) for `resolveRequest` and [Types](./types.md) for `CardRequest` / `ResolvedCard`.
