---
title: Meta
sidebar_label: Meta
sidebar_position: 6
---

Two lightweight endpoints for server health and provider state. Full schemas in [Swagger](https://riftseerapi-production.up.railway.app/api/swagger#tag/meta).

---

## Endpoints at a glance

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Liveness probe |
| `GET` | `/api/v1/meta` | Provider stats and cache state |

---

## GET /api/v1/health

Returns 200 if the server is running. Intended for load balancers and uptime monitors — it does not check the card provider or database.

```json
{ "status": "ok", "uptimeMs": 3600000 }
```

---

## GET /api/v1/meta

Returns the current state of the card data provider — useful for confirming the cache is warm and data is recent.

```json
{
  "provider": "supabase",
  "cardCount": 656,
  "lastRefresh": "2026-04-04T10:00:00.000Z",
  "cacheAgeSeconds": 3600,
  "uptimeSeconds": 7200
}
```

| Field | Notes |
|---|---|
| `provider` | Always `supabase` — the active `CardDataProvider` implementation |
| `cardCount` | Number of cards currently in the in-memory index |
| `lastRefresh` | ISO timestamp of the last successful cache load from Supabase |
| `cacheAgeSeconds` | Seconds since last refresh; `null` if no refresh has completed yet |
| `uptimeSeconds` | Server process uptime |

`cacheAgeSeconds` exceeding the configured `CACHE_REFRESH_INTERVAL_MS` (default 6 hours) means a background refresh is overdue or has failed.
