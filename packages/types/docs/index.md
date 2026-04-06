---
title: "@riftseer/types"
sidebar_label: Overview
sidebar_position: 1
---

`@riftseer/types` is a zero-dependency package that owns the canonical Riftbound card types, the `[[Card Name]]` token parser, and the icon token map. It is the single source of truth for the card data shape across the entire monorepo.

Because it has no runtime dependencies it can be imported in any environment — Bun, Node, Cloudflare Workers, and browser builds alike.

---

## Why a separate package?

`@riftseer/core` carries heavy server-side dependencies (Supabase client, Fuse.js, Redis). Any package that only needs *types* or the parser — the Discord bot, the ingest worker, external tooling — can import `@riftseer/types` directly without pulling in those transitive dependencies.

`@riftseer/core` re-exports everything from `@riftseer/types`, so existing code that imports from `@riftseer/core` continues to work unchanged.

---

## What's in this package

| Module | File | Purpose |
| --- | --- | --- |
| Card types | `src/card.ts` | `Card`, all sub-interfaces, `CardRequest`, `ResolvedCard`, `CardSearchOptions`, `SimplifiedDeck` |
| Parser | `src/parser.ts` | `parseCardRequests()` and `normalizeCardName()` |
| Icons | `src/icons.ts` | `TOKEN_REGEX` and `TOKEN_ICON_MAP` |

---

## Exports

```typescript
// Default export — everything in one import
import type { Card, CardRequest, ResolvedCard, SimplifiedDeck } from "@riftseer/types";
import { parseCardRequests, normalizeCardName } from "@riftseer/types";

// Sub-path exports (tree-shakeable)
import { TOKEN_REGEX, TOKEN_ICON_MAP } from "@riftseer/types/icons";
import { parseCardRequests, normalizeCardName } from "@riftseer/types/parser";
```

---

## Usage from @riftseer/core

If you are already importing from `@riftseer/core` you do not need to change anything. Core re-exports the full surface of `@riftseer/types`:

```typescript
// These continue to work — core re-exports from @riftseer/types
import type { Card, CardRequest } from "@riftseer/core";
import { parseCardRequests } from "@riftseer/core";
```

Import from `@riftseer/types` directly when you want to avoid the server-side dependencies that `@riftseer/core` carries.
