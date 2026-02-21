# packages/core — Context for Claude

## Purpose
Shared library consumed by `packages/api`. Contains the canonical Card types, the `CardDataProvider` interface, the `[[Card Name]]` parser, and the Supabase provider.

## Key Files
| File | Purpose |
|------|---------|
| `src/types.ts` | Canonical `Card`, `CardRequest`, `ResolvedCard`, `CardSearchOptions` types |
| `src/provider.ts` | `CardDataProvider` interface — the only contract between API and data |
| `src/parser.ts` | `parseCardRequests()` — extracts `[[Name\|SET-123]]` tokens from text |
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
See `src/types.ts` for the canonical nested `Card` type (mirrors Postgres/supabase migrations).

## Testing
```bash
bun test packages/core   # or: bun test from root
```
Tests live in `src/__tests__/`. Use `mock()` from `bun:test` for provider mocks.

## Adding/Changing Data Fields
If a new field is added to the canonical `Card` type:
- Update `src/types.ts` and `packages/api/src/ingest/riftcodex.ts` (rawToCard) and Supabase provider row mapping
- Check whether `PrivacyPage.tsx` mentions the data — update if the field affects what is collected or stored
