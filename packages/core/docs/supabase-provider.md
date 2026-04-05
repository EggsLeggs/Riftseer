---
title: Supabase Provider
sidebar_label: Supabase Provider
sidebar_position: 6
---

`src/providers/supabase.ts` is the only `CardDataProvider` implementation. It reads card data from Supabase Postgres (populated by the ingest pipeline), builds an in-memory index for fast query serving, and uses Redis as a warmup cache so restarts don't hit Postgres on every deploy.

---

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `SUPABASE_URL` | required | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | required | Service-role JWT |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `FUZZY_THRESHOLD` | `0.4` | Fuse.js threshold (0 = exact only, 1 = very fuzzy) |
| `CACHE_REFRESH_INTERVAL_MS` | `21600000` (6 h) | How often the provider refreshes its index |

Enable with: `CARD_PROVIDER=supabase`

---

## Startup and warmup

`SupabaseCardProvider` is instantiated by the factory in `src/providers/index.ts`. The API calls `provider.warmup()` before starting the Elysia server — see [Elysia lifecycle hooks](https://elysiajs.com/life-cycle/overview.html) for how on-start logic is structured in the API layer.

`warmup()` runs `loadAndIndex()` and then schedules a background refresh on `CACHE_REFRESH_INTERVAL_MS`. The interval timer calls `.unref()` so it does not prevent a clean exit.

---

## Load strategy

On each `loadAndIndex()` call:

1. Query `cards.ingested_at` to get the latest ingestion timestamp (single-row, cheap).
2. Check Redis for a snapshot keyed by that `ingested_at` value (fast path).
3. If cache miss, load all cards from Supabase in paginated chunks of 1 000 rows (slow path), then write the snapshot to Redis with a 24-hour TTL.
4. Map DB rows → `Card` objects via `dbRowToCard` and rebuild the in-memory index.

If the reload fails and the provider already has data in memory, it logs the error and keeps serving the stale index rather than crashing.

---

## In-memory index

After loading, the provider holds three structures:

| Structure | Type | Purpose |
|---|---|---|
| `byId` | `Map<string, Card>` | UUID → card (O(1) lookup for `getCardById`) |
| `byNorm` | `Map<string, Card[]>` | Normalized name → cards (O(1) for exact-name resolution) |
| `fuse` | `Fuse<Card>` | Fuse.js index over `name` + `name_normalized` |

The Fuse index is configured with:
```typescript
{
  keys: [
    { name: "name", weight: 0.7 },
    { name: "name_normalized", weight: 0.3 },
  ],
  threshold: FUZZY_THRESHOLD,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
}
```

---

## Search behaviour

`searchByName(q, opts)` has two modes:

- **Exact mode** (`opts.fuzzy === false`): looks up `byNorm.get(normalizeCardName(q))` directly and applies any set/collector filters. Used when the caller needs a strict match.
- **Autocomplete mode** (default): calls `autocompleteSearch` with the Fuse instance for deterministic, position-aware ranking. See [Search](./search.md).

When set or collector filters are present, the provider narrows the search corpus to matching cards first. If the narrowed corpus is empty (unknown set), it falls back to the full index to avoid returning nothing.

---

## Resolve behaviour

`resolveRequest(req)` walks a priority chain:

1. Exact name + set code + collector number
2. Exact name + set code (first matching card)
3. Exact name (any set, first card in `byNorm`)
4. Fuse fuzzy search on `req.name` (single result)
5. `{ card: null, matchType: "not-found" }`

Never throws.

---

## Redis snapshot keys

Snapshots are keyed by `ingested_at` timestamp: `riftseer:snapshot:<timestamp>`. Because the key changes with each new ingest run, stale keys expire naturally after 24 hours rather than being explicitly deleted.

Redis failures are swallowed silently — the provider continues without caching.

---

## `stop()`

`stop()` clears the refresh interval. Call it in test teardown or graceful shutdown handlers.
