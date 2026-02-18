# RiftSeer

Card data API, web app, and Reddit integration for the **Riftbound** TCG.

```text
[[Sun Disc]]         → bot replies with card image, API link, site link
[[Sun Disc|OGN]]     → specific set
[[Sun Disc|OGN-021]] → specific printing by collector number
```

---

## What’s included

|Part|Description|
|------|--------------|
|**Site**|React (Vite) app: search, card pages, sets browser, syntax guide, light/dark theme|
|**API**|Elysia HTTP server under `/api`: cards, sets, resolve, Swagger at `/api/swagger`|
|**Bot**|Reddit integration (see `packages/bot`) — uses [Devvit](https://devvit.dev) for Reddit apps|
|**Core**|Shared types, `CardDataProvider`, parser, RiftCodex provider, SQLite cache|

---

## Site features

The frontend (`packages/frontend`) is a single-page app that talks to the API:

- **Home** — Search box and links to Sets and Syntax
- **Search** — Fuzzy card search by name; filter by set (`?set=OGN`); single-result redirects to card page
- **Card page** — Image (with rotate for landscape cards), name, cost, type, domains, ability/effect (with inline icons), might, artist, rarity, tags; **Tokens** (parsed from text); **Printings** (all versions, click to switch); **Extra tools** — download image, copy-paste text, JSON link, report (placeholder)
- **Sets** — List of sets with codes and card counts; links to browse cards in set
- **Syntax** — Bracket syntax for Reddit/bot and API, search tips, set codes, API overview with link to Swagger
- **Nav** — Global search, Advanced (search), Syntax, Sets, **Random card**, light/dark theme toggle

The site uses Eden (typed API client), React Router, Tailwind, and domain/stat icons (e.g. runes, energy, might). Card text is rendered with `CardTextRenderer` (replaces `:rb_*:` tokens with icons).

---

## Architecture

```text
packages/
  core/     ← shared types, CardDataProvider, parser, SQLite, RiftCodex provider
  api/      ← Elysia server (all routes under /api)
  frontend/ ← React + Vite SPA (Eden client → API)
  bot/      ← Reddit app (Devvit)
```

**Design:** The API and bot both use `@riftseer/core` and the same provider interface. The bot calls the provider in-process (no dependency on the API being up). Data source is swappable via `CARD_PROVIDER` and a new provider implementation; the API and site are unchanged.

---

## Requirements

| Tool                    | Version |
| ----------------------- | ------- |
| [Bun](https://bun.sh)   | ≥ 1.2   |

Elysia is Bun-first and uses `Bun.serve()`; Bun also provides SQLite and a Jest-compatible test runner.

---

## Quick Start

```bash
# 1. Clone + install
git clone https://github.com/you/riftseer
cd riftseer
bun install

# 2. Configure
cp .env.example .env
# Set API_BASE_URL, SITE_BASE_URL, and REDDIT_* if using the bot

# 3. Run API + site together
bun dev
# → API: http://localhost:3000
# → Site: Vite dev server (port in frontend package, often 5173)
# → Swagger: http://localhost:3000/api/swagger

# Or run separately:
bun dev:api      # API only
bun dev:frontend # Frontend only (expects API at VITE_API_URL or same origin)
```

The bot lives in `packages/bot` and uses Devvit; see that package’s README for run/deploy.

---

## Environment Variables

See `.env.example`. Summary:

| Variable | Default | Description |
| ---------- | --------- | ------------- |
| `CARD_PROVIDER` | `riftcodex` | `riftcodex` or `riot` (riot stub only) |
| `DB_PATH` | `./data/riftseer.db` | SQLite path |
| `API_PORT` | `3000` | Elysia port |
| `API_BASE_URL` | `http://localhost:3000` | Public API URL (bot/site links) |
| `SITE_BASE_URL` | `https://example.com` | Public site URL (bot reply links) |
| `CACHE_REFRESH_INTERVAL_MS` | `21600000` | Card cache TTL (6h) |
| `FUZZY_THRESHOLD` | `0.4` | Fuse.js fuzzy match (0=exact, 1=loose) |
| `REDDIT_*` | — | Required for Reddit bot (see Reddit setup below) |

---

## Reddit app setup (for the bot)

1. Log in as the bot account → [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) → create app, type **script**.
2. Set redirect URI (e.g. `http://localhost`); copy client ID and secret into `.env`.
3. Set `REDDIT_USERNAME` / `REDDIT_PASSWORD` and a unique **User-Agent**, e.g.  
   `REDDIT_USER_AGENT=RiftSeer/0.1.0 by u/YourBotUsername`

Bot implementation and deployment are in `packages/bot` (Devvit).

---

## API Reference

When the API is running, OpenAPI UI is at **`/api/swagger`**.

All endpoints are under **`/api`**:

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/health` | `{ status, uptimeMs }` |
| GET | `/api/meta` | Provider name, card count, last refresh, cache age |
| GET | `/api/cards` | Search: `?name=...` (required unless browsing set), optional `?set=`, `?fuzzy=1`, `?limit=` |
| GET | `/api/cards?set=OGN` | List cards in set (no `name` required) |
| GET | `/api/cards/random` | One random card |
| GET | `/api/cards/:id` | Card by UUID |
| GET | `/api/cards/:id/text` | Plain text (name, type line, rules) for copy-paste |
| POST | `/api/resolve` | Batch resolve: `{ "requests": ["Sun Disc", "Stalwart Poro\|OGN", ...] }` (max 20) |
| GET | `/api/sets` | List sets with codes and card counts |

### POST /api/resolve example

```bash
curl -X POST http://localhost:3000/api/resolve \
  -H 'Content-Type: application/json' \
  -d '{"requests":["Sun Disc","Stalwart Poro|OGN","NonExistentCard"]}'
```

Response shape: `{ count, results: [{ request, card | null, matchType }] }`.

---

## Running tests

```bash
bun test         # all
bun test:core    # core (parser, provider)
bun test:api     # API routes
```

Tests use Bun’s runner; API tests call Elysia’s `.handle()` (no live server).

---

## Deployment

- **API:** Use the root `Dockerfile` and `railway.toml` (or any Node/Bun host). Set `PORT`, `API_BASE_URL`, `SITE_BASE_URL`, and optionally `CARD_PROVIDER`, `DB_PATH`, etc.
- **Frontend:** Build with `bun run build:frontend`; deploy the `packages/frontend/dist` output (e.g. Cloudflare Pages via `wrangler`, or any static host). Set `VITE_API_URL` at build time if the API is on another origin.
- **Bot:** See `packages/bot` (Devvit deploy).
- **Docker Compose:** From repo root, `docker compose up -d` runs API (and optionally bot) with a shared volume for SQLite.

---

## Card data

- **Current:** [RiftCodex](https://riftcodex.com) — community API (`https://api.riftcodex.com`). Cards are loaded at startup and on an interval (default 6h), stored in SQLite and in-memory Fuse.js for fuzzy search.
- **Future:** Riot official API — stub in `packages/core/src/providers/riot.ts`; set `CARD_PROVIDER=riot` when implemented.
