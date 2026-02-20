# RiftSeer

Card data API, web app, and Reddit + Discord integration for the **Riftbound** TCG.

```text
# Reddit bot (bracket syntax)
[[Sun Disc]]         → bot replies with card image, API link, site link
[[Sun Disc|OGN]]     → specific set
[[Sun Disc|OGN-021]] → specific printing by collector number

# Discord bot (slash commands)
/card name:Sun Disc          → embed with stats, rules text, and icons
/card name:Sun Disc set:OGN  → scoped to set
/card name:Sun Disc image:true → image-only embed
/random                      → random card
/sets                        → list all sets
```

---

## What’s included

|Part|Description|
|------|--------------|
|**Site**|React (Vite) app: search, card pages, sets browser, syntax guide, light/dark theme|
|**API**|Elysia HTTP server under `/api/v1`: cards, sets, resolve; Swagger UI at `/api/swagger`|
|**Discord bot**|Slash-command bot on Cloudflare Workers — see `packages/discord-bot`|
|**Reddit bot**|Bracket-syntax bot on Reddit — uses [Devvit](https://devvit.dev), see `packages/reddit-bot`|
|**Core**|Shared types, `CardDataProvider`, parser, icon definitions, RiftCodex provider, SQLite cache|

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
  core/         ← shared types, CardDataProvider, parser, icon defs, SQLite, RiftCodex provider
  api/          ← Elysia server (all routes under /api/v1)
  frontend/     ← React + Vite SPA (Eden client → API)
  discord-bot/  ← Discord slash-command bot (Cloudflare Workers + Wrangler)
  reddit-bot/   ← Reddit bracket-syntax bot (Devvit)
```

**Design:** The API and Reddit bot both use `@riftseer/core`. The Reddit bot calls the provider in-process; the Discord bot calls the deployed API over HTTP. Data source is swappable via `CARD_PROVIDER`; the API and site are unchanged. Icon definitions live in `@riftseer/core/icons` — a subpath export that is safe to import in both browser (Vite) and Cloudflare Workers (no `bun:sqlite` pulled in).

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

The Reddit bot lives in `packages/reddit-bot` and uses Devvit; see that package’s README for run/deploy.
The Discord bot lives in `packages/discord-bot` and uses Cloudflare Workers; see the Discord bot setup section below.

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

## Discord bot setup

The Discord bot runs on Cloudflare Workers. Secrets are set once via `wrangler secret put` (not `.env`).

```bash
cd packages/discord-bot

# 1. Set secrets (one-time)
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put DISCORD_BOT_TOKEN
wrangler secret put DISCORD_APPLICATION_ID

# 2. Register slash commands (re-run when commands.ts changes)
bun run register

# 3. Upload card icons as application emojis (one-time, re-run after new icons are added)
#    Reads DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID from .dev.vars
bun run setup-emojis

# 4. Run locally (requires a tunnel — ngrok or cloudflared — to receive Discord webhooks)
bun run dev

# 5. Deploy to Cloudflare
bun run deploy
```

Set the **Interactions Endpoint URL** in the Discord Developer Portal to your worker URL (or tunnel URL during dev).

Public vars (`API_BASE_URL`, `SITE_BASE_URL`) are in `wrangler.toml`.

---

## Reddit app setup (for the Reddit bot)

1. Log in as the bot account → [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) → create app, type **script**.
2. Set redirect URI (e.g. `http://localhost`); copy client ID and secret into `.env`.
3. Set `REDDIT_USERNAME` / `REDDIT_PASSWORD` and a unique **User-Agent**, e.g.
   `REDDIT_USER_AGENT=RiftSeer/0.1.0 by u/YourBotUsername`

Bot implementation and deployment are in `packages/reddit-bot` (Devvit).

---

## API Reference

When the API is running, OpenAPI UI is at **`/api/swagger`** (documents all API versions).

All endpoints are under **`/api/v1`**:

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/v1/health` | `{ status, uptimeMs }` |
| GET | `/api/v1/meta` | Provider name, card count, last refresh, cache age |
| GET | `/api/v1/cards` | Search: `?name=...` (required unless browsing set), optional `?set=`, `?fuzzy=1`, `?limit=` |
| GET | `/api/v1/cards?set=OGN` | List cards in set (no `name` required) |
| GET | `/api/v1/cards/random` | One random card |
| GET | `/api/v1/cards/:id` | Card by UUID |
| GET | `/api/v1/cards/:id/text` | Plain text (name, type line, rules) for copy-paste |
| POST | `/api/v1/resolve` | Batch resolve: `{ "requests": ["Sun Disc", "Stalwart Poro\|OGN", ...] }` (max 20) |
| GET | `/api/v1/sets` | List sets with codes and card counts |

### POST /api/v1/resolve example

```bash
curl -X POST http://localhost:3000/api/v1/resolve \
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
- **Discord bot:** Deploy with `wrangler deploy` from `packages/discord-bot`. Secrets set via `wrangler secret put`.
- **Reddit bot:** See `packages/reddit-bot` (Devvit deploy).
- **Docker Compose:** From repo root, `docker compose up -d` runs API (and optionally bot) with a shared volume for SQLite.

---

## Card data

- **Current:** [RiftCodex](https://riftcodex.com) — community API (`https://api.riftcodex.com`). Cards are loaded at startup and on an interval (default 6h), stored in SQLite and in-memory Fuse.js for fuzzy search.
- **Future:** Riot official API — stub in `packages/core/src/providers/riot.ts`; set `CARD_PROVIDER=riot` when implemented.
