# packages/types — Context for Claude

## Purpose
Zero-dependency package that owns the canonical Riftbound card types, the `[[Card Name]]` token parser, and the icon token map. It is the single source of truth for the card data shape across the monorepo.

Because it has no runtime dependencies it can safely be imported from anywhere — Bun, Node, Cloudflare Workers, and browser builds.

`@riftseer/core` depends on this package and re-exports its full surface, so existing code importing from `@riftseer/core` is unaffected.

## Key Files

| File | Purpose |
|------|---------|
| `src/card.ts` | Canonical `Card`, all sub-interfaces, `CardRequest`, `ResolvedCard`, `CardSearchOptions`, `SimplifiedDeck` |
| `src/parser.ts` | `parseCardRequests()` and `normalizeCardName()` |
| `src/icons.ts` | `TOKEN_REGEX` and `TOKEN_ICON_MAP` |
| `index.ts` | Default export — re-exports all of the above |

## Exports
```typescript
// Default — all types + functions
import type { Card, CardRequest } from "@riftseer/types";
import { parseCardRequests, normalizeCardName } from "@riftseer/types";

// Sub-path exports (tree-shakeable)
import { TOKEN_REGEX, TOKEN_ICON_MAP } from "@riftseer/types/icons";
import { parseCardRequests, normalizeCardName } from "@riftseer/types/parser";
```

## Card Token Syntax (parser)
- `[[Card Name]]` — fuzzy name search
- `[[Card Name|SET-001]]` — exact set + collector lookup (preferred)
- `[[Card Name|set-id]]` — set-scoped name search
- `parseCardRequests(text: string): CardRequest[]`

## Adding/Changing Data Fields
If a new field is added to the canonical `Card` type:
- Update `src/card.ts` here first
- Update `packages/ingest-worker/src/riftcodex.ts` (`rawToCard`)
- Update the row mapping in `packages/core/src/providers/supabase.ts` (`dbRowToCard`)
- Update the field table in `packages/api/docs/cards.md`
- Check `PrivacyPage.tsx` if the field affects what data is stored or shown

## Documentation
Doc pages live in `packages/types/docs/`. Keep them up to date when making changes to types, parser behaviour, or the icon map.
