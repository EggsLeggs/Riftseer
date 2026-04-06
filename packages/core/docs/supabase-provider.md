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

## `stop()`

`stop()` clears the refresh interval. Call it in test teardown or graceful shutdown handlers.
