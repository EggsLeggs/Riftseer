# packages/core — Context for Claude

## Purpose
Shared library consumed by `packages/api`. Contains the `CardDataProvider` interface, the Supabase provider, the autocomplete search engine, and the deck model. Canonical card types and the parser live in `@riftseer/types` and are re-exported here.

## Key Files

| File | Purpose |
|------|---------|
| `src/types.ts` | Re-exports `Card`, `CardRequest`, `ResolvedCard`, `CardSearchOptions` from `@riftseer/types` |
| `src/parser.ts` | Re-exports `parseCardRequests()` from `@riftseer/types` |
| `src/icons.ts` | Re-exports `TOKEN_REGEX`, `TOKEN_ICON_MAP` from `@riftseer/types` |
| `src/normalize.ts` | Re-exports `normalizeCardName()` from `@riftseer/types` |
| `src/provider.ts` | `CardDataProvider` interface — the only contract between API and data |
| `src/logger.ts` | Lightweight logging utility |
| `src/providers/index.ts` | Factory: `createProvider()` — returns `SupabaseCardProvider` |
| `src/providers/supabase.ts` | `SupabaseCardProvider` — reads from Postgres, in-memory index + Fuse |
| `src/index.ts` | Public re-exports |

## Card Token Syntax (parser)
- `[[Card Name]]` — fuzzy name search
- `[[Card Name|SET-001]]` — exact set + collector lookup (preferred)
- `[[Card Name|set-id]]` — set-scoped name search
- `parseCardRequests(text: string): CardRequest[]`

## Card shape
The canonical `Card` interface is defined in `packages/types/src/card.ts` (source of truth). `src/types.ts` re-exports it from `@riftseer/types` for convenience.

## Testing
```bash
bun test packages/core   # or: bun test from root
```
Tests live in `src/__tests__/`. Use `mock()` from `bun:test` for provider mocks.

## Adding/Changing Data Fields
If a new field is added to the canonical `Card` type:
- Update `packages/types/src/card.ts` (source of truth) and `packages/ingest-worker/src/riftcodex.ts` (rawToCard) and Supabase provider row mapping
- Update the card object field table in `packages/api/docs/cards.md`
- Check whether `PrivacyPage.tsx` mentions the data — update if the field affects what is collected or stored

## Documentation
Doc pages for this package live in `packages/core/docs/`. Keep them up to date when making changes — if behaviour, types, or the provider interface changes, update the relevant doc page alongside the code.
