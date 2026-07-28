# packages/types — Context for Claude

## Purpose
Zero-dependency package that owns the canonical Riftbound card types, the `[[Card Name]]` token parser, and the icon token map. It is the single source of truth for the card data shape across the monorepo.

Because it has no runtime dependencies it can safely be imported from anywhere — Bun, Node, Cloudflare Workers, and browser builds.

`@riftseer/core` depends on this package and re-exports its full surface, so existing code importing from `@riftseer/core` is unaffected.

## Key Files

| File | Purpose |
|------|---------|
| `src/card.ts` | Canonical `Card`, all sub-interfaces, `CardRequest`, `ResolvedCard`, `CardSearchOptions`, `SimplifiedDeck` |
| `src/card-detail.ts` | `CardDetail` and `CardPrintingSummary` — the aggregate payload behind `GET /api/v1/cards/detail` |
| `src/card-text.ts` | `normalizeCardTextLayout()` — paragraph splitting for rules text, shared by every renderer |
| `src/keywords.ts` | `[Keyword]` badge helpers — `KEYWORD_STYLES`, `styleForKeyword()`, `isKeywordTag()` |
| `src/parser.ts` | `parseCardRequests()` and `normalizeCardName()` |
| `src/icons.ts` | `TOKEN_REGEX`, `TOKEN_ICON_MAP`, and `tokenPlainLabel()` (copy-paste stand-ins for icon tokens) |
| `src/slug.ts` | Public-URL slug rules — `slugifyCardName`, `buildPublicSlugSegments`, `joinPublicSlug`, `withNameCollisionSuffix`, `generatePublicSlug`, `absoluteRiftseerUri` |
| `index.ts` | Default export — re-exports all of the above |

## Exports
```typescript
// Default — all types + functions
import type { Card, CardRequest } from "@riftseer/types";
import { parseCardRequests, normalizeCardName } from "@riftseer/types";

// Sub-path exports (tree-shakeable)
import { normalizeCardTextLayout } from "@riftseer/types/card-text";
import { TOKEN_REGEX, TOKEN_ICON_MAP } from "@riftseer/types/icons";
import { parseCardRequests, normalizeCardName } from "@riftseer/types/parser";
import {
  buildPublicSlugSegments,
  generatePublicSlug,
  absoluteRiftseerUri,
} from "@riftseer/types/slug";
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
- Check `packages/web/src/views/privacy-view.tsx` if the field affects what data is stored or shown

## Public URL slugs

`src/slug.ts` is the single source of truth for the public site-URL shape:

```text
<set>/<collector>(/signature)?/<name>(-<n>)?
```

- `<set>` — lowercase `set.set_code`
- `<collector>` — `collector_number`, with literal `a` appended for
  alternate-art numeric collectors (`12` → `12a`); the sentinel `x` when
  there is no collector number
- `signature` — present iff `metadata.signature === true`
- `<name>` — `slugifyCardName(name)` (lowercased, ASCII-folded, hyphenated,
  apostrophes stripped, stars/ornaments stripped)
- `-<n>` — collision suffix on the name segment only

Slugs are persisted in `cards.public_slug` on first insert and never
overwritten by ingest, so URLs do not drift when upstream data changes.
The API computes `riftseer_uri = ${SITE_ORIGIN}/card/${public_slug}` at
response time.

## Documentation
Doc pages live in `packages/types/docs/`. Keep them up to date when making changes to types, parser behaviour, or the icon map.
