# packages/core — Context for Claude

## Purpose
Shared library consumed by `packages/api`. Contains the canonical Card types, the `CardDataProvider` interface, the `[[Card Name]]` parser, SQLite helpers, and concrete provider implementations.

## Key Files
| File | Purpose |
|------|---------|
| `src/types.ts` | Canonical `Card`, `CardRequest`, `ResolvedCard`, `CardSearchOptions` types |
| `src/provider.ts` | `CardDataProvider` interface — the only contract between API and data |
| `src/parser.ts` | `parseCardRequests()` — extracts `[[Name\|SET-123]]` tokens from text |
| `src/db.ts` | `getDb()`, `hasReplied()`, `markReplied()`, `getCachedCards()`, `setCachedCards()` |
| `src/logger.ts` | Lightweight logging utility |
| `src/providers/index.ts` | Factory: `createProvider()` — reads `CARD_PROVIDER` env var |
| `src/providers/riftcodex.ts` | `RiftCodexProvider` — fetches, caches, and searches cards via RiftCodex API |
| `src/providers/riot.ts` | `RiotProvider` stub — reserved for future official Riot Games API |
| `src/index.ts` | Public re-exports |

## CardDataProvider Interface
All providers must implement these methods:
```typescript
interface CardDataProvider {
  initialize(): Promise<void>;
  getCards(options?: CardSearchOptions): Promise<Card[]>;
  getCardById(id: string): Promise<Card | null>;
  getCardByCollector(set: string, collector: string): Promise<Card | null>;
  getRandomCard(): Promise<Card | null>;
  getSets(): Promise<{ set_id: string; label: string; count: number }[]>;
  resolveRequests(requests: CardRequest[]): Promise<ResolvedCard[]>;
  getMetadata(): ProviderMetadata;
}
```

## Adding a New Provider
1. Create `src/providers/<name>.ts` implementing `CardDataProvider`
2. Add a case to the factory in `src/providers/index.ts`
3. Add the new value to the `CARD_PROVIDER` env var docs in root `CLAUDE.md` and `.env.example`
4. Do NOT change the interface without updating all existing providers

## Card Token Syntax (parser)
- `[[Card Name]]` — fuzzy name search
- `[[Card Name|SET-001]]` — exact set + collector lookup (preferred)
- `[[Card Name|set-id]]` — set-scoped name search
- `parseCardRequests(text: string): CardRequest[]`

## RiftCodex Card Shape (observed 2026-02)
```typescript
{
  id: string,           // UUID
  name: string,
  riftbound_id: string,
  public_code: string,
  collector_number: string,
  attributes: { energy: number, might: number, power: number },
  classification: {
    type: string,
    supertype: string,
    rarity: string,
    domain: string[]
  },
  text: { rich: string, plain: string },
  set: { set_id: string, label: string },
  media: { image_url: string, artist: string, accessibility_text: string },
  tags: string[],
  metadata: { clean_name: string, [key: string]: unknown }
}
```

## SQLite (bun:sqlite)
- Always use `bun:sqlite`, never `better-sqlite3`
- DB path from `DB_PATH` env var (default `./data/riftseer.db`)
- `getDb()` is idempotent — call it wherever you need a connection

## Testing
```bash
bun test packages/core   # or: bun test from root
```
Tests live in `src/__tests__/`. Use `mock()` from `bun:test` for provider mocks.

## Adding/Changing Data Fields
If a new field is added to the canonical `Card` type or stored in SQLite:
- Update `src/types.ts`
- Update the normalization logic in `src/providers/riftcodex.ts` (`toCard()`)
- Check whether `PrivacyPage.tsx` mentions the data — update if the field affects what is collected or stored
