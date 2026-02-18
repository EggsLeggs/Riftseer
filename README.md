# RiftSeer

MTGCardFetcher-style Reddit bot + card data API for the **Riftbound** TCG.

```
[[Sun Disc]]         → bot replies with card image, API link, site link
[[Sun Disc|OGN]]     → specific set
[[Sun Disc|OGN-021]] → specific printing by collector number
```

---

## Architecture

```
packages/
  core/   ← shared types, CardDataProvider interface, parser, SQLite helpers
  api/    ← Elysia HTTP server (OpenAPI + Swagger)
  bot/    ← Reddit polling bot
```

**Key design decision — bot calls provider directly:**
The bot imports `@riftseer/core` and calls `provider.resolveRequest()` in-process
rather than going over HTTP to the API.  Both share the same SQLite file and card
cache.  Benefit: lower latency, no dependency on the API being up, single point of
config.  Trade-off: both processes run the same provider logic (acceptable for MVP).

**Swapping data sources:**
Change only `packages/core/src/providers/index.ts` (the factory) + add a new
class that satisfies `CardDataProvider`.  Nothing else changes.

---

## Requirements

| Tool | Version |
|------|---------|
| [Bun](https://bun.sh) | ≥ 1.2 |

> **Why Bun?** [Elysia](https://elysiajs.com) is a Bun-first framework and uses
> `Bun.serve()` under the hood.  Bun also provides built-in SQLite (`bun:sqlite`)
> and a Jest-compatible test runner — no extra deps needed.

---

## Quick Start

```bash
# 1. Clone + install
git clone https://github.com/you/riftseer
cd riftseer
bun install

# 2. Configure
cp .env.example .env
# Fill in REDDIT_* credentials (see section below)

# 3. Run the API
bun dev:api
# → http://localhost:3000
# → Swagger UI at http://localhost:3000/swagger

# 4. Run the bot (separate terminal)
bun dev:bot
```

---

## Environment Variables

All variables are in `.env.example`.  Key ones:

| Variable | Default | Description |
|----------|---------|-------------|
| `CARD_PROVIDER` | `riftcodex` | `riftcodex` or `riot` (riot not yet implemented) |
| `DB_PATH` | `./data/riftseer.db` | SQLite database path |
| `API_PORT` | `3000` | Port for the Elysia server |
| `API_BASE_URL` | `http://localhost:3000` | Used in bot reply links |
| `SITE_BASE_URL` | `https://example.com` | Future React site URL in bot replies |
| `REDDIT_CLIENT_ID` | *(required)* | Reddit OAuth app client ID |
| `REDDIT_CLIENT_SECRET` | *(required)* | Reddit OAuth app secret |
| `REDDIT_USERNAME` | *(required)* | Bot's Reddit username |
| `REDDIT_PASSWORD` | *(required)* | Bot's Reddit password |
| `REDDIT_SUBREDDITS` | `riftbound` | Comma-separated subreddits to watch |
| `CACHE_REFRESH_INTERVAL_MS` | `21600000` | Card cache TTL (default 6 hours) |
| `FUZZY_THRESHOLD` | `0.4` | Fuse.js threshold (0=exact, 1=anything) |

---

## Creating a Reddit Script App

1. Log in as your bot account at reddit.com.
2. Go to **https://www.reddit.com/prefs/apps** → **"create another app"**.
3. Select **"script"**.
4. Fill in name + redirect URI (`http://localhost` is fine for scripts).
5. Copy **client ID** (under the app name) and **secret** into your `.env`.
6. Set `REDDIT_USERNAME` / `REDDIT_PASSWORD` to the bot account credentials.

**User-Agent** must be unique and descriptive per Reddit's rules:
```
REDDIT_USER_AGENT=RiftSeer/0.1.0 by u/YourBotUsername
```

---

## API Reference

Swagger UI is auto-generated at `/swagger` when the API is running.

### Endpoints

```
GET  /health                       → { status, uptimeMs }
GET  /meta                         → { provider, cardCount, lastRefresh, cacheAgeSeconds }
GET  /cards?name=Sun+Disc          → { count, cards[] }
GET  /cards?name=Sun+Disc&set=OGN  → filtered by set
GET  /cards?name=Sun+Disc&fuzzy=1  → fuzzy matching
GET  /cards/:id                    → single card by UUID
POST /resolve                      → batch resolve
```

### POST /resolve — example

```bash
curl -X POST http://localhost:3000/resolve \
  -H 'Content-Type: application/json' \
  -d '{"requests":["Sun Disc","Stalwart Poro|OGN","NonExistentCard"]}'
```

Response:
```json
{
  "count": 3,
  "results": [
    { "request": { "raw": "Sun Disc", "name": "Sun Disc" },
      "card": { "id": "bf1bafd...", "name": "Sun Disc", ... },
      "matchType": "exact" },
    { "request": { "raw": "Stalwart Poro|OGN", "name": "Stalwart Poro", "set": "OGN" },
      "card": { ... },
      "matchType": "exact" },
    { "request": { "raw": "NonExistentCard", "name": "NonExistentCard" },
      "card": null,
      "matchType": "not-found" }
  ]
}
```

---

## React Client Integration Notes

The API is designed for React consumption:

```typescript
// Example typed fetch helper (add to your React app)
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function resolveCards(names: string[]) {
  const res = await fetch(`${API}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: names }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<ResolveResponse>;
}

// Types live in packages/core/src/types.ts — copy or re-export as needed.
// The API never returns the internal `raw` field, so the client shape is clean.
```

**Recommendations for the React frontend:**
- Use the `Card` type from `@riftseer/core` (or copy it) for type safety.
- `/cards/:id` is suitable as a detail page data source.
- `/resolve` is ideal for batch lookups (e.g. a deck list).
- The `imageUrl` field points directly to Riot's CDN — usable in `<img>` tags.
- All API errors return `{ error: string, code: string }` for consistent handling.

---

## Running Tests

```bash
bun test                    # all tests
bun test:core               # parser + provider tests
bun test:api                # API route tests
```

The tests use Bun's built-in test runner (Jest-compatible API).  No test server
is started — Elysia's `.handle()` method is used for route testing.

---

## Deployment

### Docker Compose (recommended)

```bash
cp .env.example .env
# fill in credentials
docker compose up -d
```

Both services share a named volume (`riftseer_data`) for the SQLite DB.

### Fly.io / Render

1. Build two services from `Dockerfile.api` and `Dockerfile.bot`.
2. Mount a persistent volume at `/app/data` so the DB survives deploys.
3. Set all `REDDIT_*` and `SITE_BASE_URL` / `API_BASE_URL` env vars in the dashboard.

### systemd (bare metal)

```ini
# /etc/systemd/system/riftseer-api.service
[Unit]
Description=RiftSeer API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/riftseer
EnvironmentFile=/opt/riftseer/.env
ExecStart=/usr/local/bin/bun packages/api/src/index.ts
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

Create an equivalent `riftseer-bot.service` pointing at `packages/bot/src/index.ts`.

---

## Card Data Source

**Current:** [RiftCodex](https://riftcodex.com) — free community API.
- Base URL: `https://api.riftcodex.com`
- Cards fetched at startup + every 6 hours (configurable).
- All 656+ cards (~7 pages at 100/page) are fetched and stored in SQLite.
- In-memory [Fuse.js](https://fusejs.io) index for fast fuzzy search.

**Future:** Riot Games official API — stub provider is in
`packages/core/src/providers/riot.ts`.  Once available, set `CARD_PROVIDER=riot`.

---

## Assumptions & Decisions

| Decision | Rationale |
|----------|-----------|
| Bun runtime | Elysia requires Bun; also provides free SQLite + test runner |
| Bot calls provider directly | Simpler, no HTTP hop, bot resilient to API downtime |
| SQLite for replied IDs | Zero-config, sufficient for single-bot workload |
| All cards cached in memory | 656 cards ≈ <5 MB RAM; instant lookups without per-request DB query |
| Polling (not streaming) | Reddit's push APIs (PRAW async, websockets) are more complex; polling is reliable for MVP |
| No rate limit middleware | Provider handles upstream rate limits; API doesn't need per-IP limiting for MVP |
| Ignore edited content | Safe default; avoids re-processing significantly changed posts |
