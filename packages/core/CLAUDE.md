# packages/core

Shared data-access and deck library consumed by the API. Canonical wire types, parser primitives, icons, slugs and image helpers live in `@riftseer/types` and are re-exported where useful.

## Boundaries

- `src/provider.ts` is the only contract between API code and card storage. `SupabaseCardProvider` in `src/providers/supabase.ts` is the production implementation.
- Provider reads are split into oracle and printing families. Do not collapse them back into a flat card or infer oracle identity from a name.
- Search parses once, renders the AST to SQL and scans `resolved_printings`, where printing deltas are already applied. Oracle search collapses by `oracle_id`; printing search returns physical rows plus their owning oracles.
- `src/card-detail.ts` assembles the public `OracleDetail`. Relationships arrive as oracle edges, printings through the foreign key, and marketplace links are accepted only from recognised HTTPS hosts.
- Rulings and legalities are supplementary to a card page. Their read failures are logged and degrade to empty lists rather than making the primary card lookup fail.
- Decks remain keyed by printing id because published short-form strings encode those ids. Deck construction rules may read oracle fields, but serialized ids must never change to oracle UUIDs.

## Working here

```bash
bun test packages/core
```

- Put shared runtime-neutral shapes and parsing helpers in `@riftseer/types`, not here.
- Update `CardDataProvider`, its Supabase implementation and test doubles together when the storage contract changes.
- Keep search grammar changes renderable by `card_search_ast_to_sql`; an accepted leaf without a SQL rendering is invalid by design.
- Package documentation lives under `docs/`; update it with externally visible provider or search behavior.
