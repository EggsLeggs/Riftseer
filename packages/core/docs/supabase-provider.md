---
title: Supabase Provider
sidebar_label: Supabase Provider
sidebar_position: 6
---

`src/providers/supabase.ts` is the only `CardDataProvider` implementation. It reads card data from Supabase Postgres (populated by the ingest pipeline). Name search uses Postgres full-text search (`tsvector` column `name_search`, GIN index); there is no in-memory card index.

---

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | required | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | required | Service-role JWT |
| `CACHE_REFRESH_INTERVAL_MS` | `21600000` (6 h) | How often the provider refreshes cached stats (`cardCount`, `lastRefresh`) |

Enable with: `CARD_PROVIDER=supabase`

---

## Startup and warmup

`SupabaseCardProvider` is instantiated by the factory in `src/providers/index.ts`. The API calls `provider.warmup()` before starting the Elysia server.

`warmup()` verifies connectivity and loads a row count from `cards`, then schedules a background refresh on `CACHE_REFRESH_INTERVAL_MS`. The interval timer calls `.unref()` so it does not prevent a clean exit.

---

## Search behaviour

`searchByName(q, opts)`:

1. **Exact path**: `WHERE name_normalized = normalizeCardName(q)`, with optional `set_id` / `collector_number` filters when `opts.set` / `opts.collector` are set.
2. If no rows and `opts.fuzzy !== false`: **FTS path** — `textSearch` on `name_search` using a prefix tsquery (e.g. `token:* & token:*`, no `type` option so `to_tsquery()` handles raw syntax) with `config: "simple"`. Candidates are re-ranked in memory by `autocompleteSearch` before returning the final limited set.

`resolveRequest(req)` tries exact matches on `name_normalized` first (same set/collector priority as before), then a single-row FTS fallback using `type: "websearch"` and `config: "simple"`. When `req.set` or `req.collector` is provided the FTS fallback is skipped entirely to prevent global matches from satisfying a scoped lookup.

`getCardById`, `getCardsBySet`, `getRandomCard`, and `getSets` query Postgres on demand.

---

## Rulings, legalities and formats

`getFormats`, `getCardLegalities`, and `getCardRulings` read the Phase 5 tables
(`formats`, `card_legalities`, `card_legality_overrides`, `card_rulings`). All
three query on demand — the data is small and changes rarely, so it is not cached
alongside the row-count stats.

`getCardLegalities` fetches the format list and both legality layers in parallel,
then resolves each format through printing override → oracle row → default
`legal`. Every active format is returned, so a caller never has to distinguish
"legal" from "not recorded".

`getCardRulings` filters the printing scope **in TypeScript** rather than as a
PostgREST `or(...)` filter. Card ids for manual cards are admin-chosen text, and
interpolating one into a filter string would let a comma or parenthesis rewrite
the query.

`dbRowToCard` falls back to `oracleKeyForName(row.name)` when `oracle_key` is
null, so a row predating the column — or a manual card seeded before its patch
landed — still resolves its rulings.

---

## `stop()`

`stop()` clears the refresh interval. Call it in test teardown or graceful shutdown handlers.
