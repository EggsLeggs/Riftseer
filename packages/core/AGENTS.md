# packages/core

Shared data-access library consumed by the API. Canonical wire types, parser primitives, deck model, icons, slugs and image helpers live in `@riftseer/types` and are re-exported where useful.

## Boundaries

- `src/provider.ts` is the only contract between API code and card storage. `SupabaseCardProvider` in `src/providers/supabase.ts` is the production implementation.
- Provider reads split into oracle and printing families. Do not collapse them back into a flat card or infer oracle identity from a name.
- `src/card-search-query.ts` owns the search grammar and its AST. `src/search.ts` owns autocomplete and fuzzy scoring.
- Search parses once, renders the AST to SQL and scans `resolved_printings`, where printing deltas are already applied.
- Oracle search collapses by `oracle_id`; printing search returns physical rows plus their owning oracles.
- `src/card-detail.ts` assembles the public `OracleDetail`. Relationships arrive as oracle edges and printings through the foreign key.
- Marketplace links are accepted only from the HTTPS host allowlist in `validateMarketplaceUrl()`. Adding a marketplace means adding its hosts there.
- `src/hydrate.ts` is the only place `riftseer_uri` is attached. A new ref array on `Oracle` must be wired through `finalizeOracle()` or it ships without URIs.
- Rulings and legalities are supplementary to a card page. Read failures are logged and degrade to empty lists rather than failing the card lookup.
- The deck model lives entirely in `@riftseer/types`. Nothing deck-shaped belongs here; this package is the card provider.

## Server-only entry point

- `@riftseer/core/server` (`src/server.ts`) bundles `getRedisClient` and `getSupabaseClient`. **Do not import it in browser or Workers builds.**
- The Worker-safe path works because `src/providers/supabase.ts` imports the Supabase client directly rather than through `server.ts`. Keep it that way.
- `src/logger.ts` reads `process.env.LOG_LEVEL` at module scope. That works only under `nodejs_compat`; it is not licence to add more module-scope env reads.

## Working here

```bash
bun test packages/core
```

- Put shared runtime-neutral shapes and parsing helpers in `@riftseer/types`, not here.
- Update `CardDataProvider`, its Supabase implementation and test doubles together when the storage contract changes.
- Keep search grammar changes renderable by `card_search_ast_to_sql`. An accepted leaf without a SQL rendering is invalid by design.
- Package documentation lives under `docs/`. Update it with externally visible provider or search behaviour.
