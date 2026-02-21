# RiftSeer — Project Context for Claude

## Overview
RiftSeer is a Riftbound TCG card data platform. It exposes a REST API, a React frontend, a Discord bot, and a Reddit bot that all share a common card data model.

## Monorepo Structure
```
riftseer/
├── packages/core/           # Shared types, provider interface, parser, SQLite DB
├── packages/api/            # ElysiaJS REST API (port 3000)
├── packages/frontend/       # React 19 + Vite SPA
├── packages/discord-bot/    # Discord bot on Cloudflare Workers (Bun workspace member)
└── packages/reddit-bot/     # Devvit Reddit bot (NOT a Bun workspace member)
```

`packages/reddit-bot` is a standalone npm project excluded from the root Bun workspace. `packages/core`, `packages/api`, `packages/frontend`, and `packages/discord-bot` are workspace members.

## Stack
| Layer | Technology |
|-------|-----------|
| Runtime | Bun ≥ 1.2 (required — Elysia is Bun-first) |
| API | ElysiaJS 1.3 + @elysiajs/swagger, @elysiajs/cors |
| DB | bun:sqlite (built-in, no extra dep) |
| Frontend | React 19, React Router 7, Tailwind CSS 4, Vite 6 |
| Fuzzy search | fuse.js v7 |
| API client | @elysiajs/eden (type-safe, Eden Treaty) |
| Testing | bun test (Jest-compatible) |
| Discord bot | Cloudflare Workers + discord-api-types |
| Reddit bot | Devvit (Reddit platform) |

## Running the Project
```bash
bun dev             # API + frontend together
bun dev:api         # API only (port 3000, swagger at /api/swagger)
bun dev:frontend    # Frontend only
bun test            # All tests (51 across 3 files)
bun typecheck       # Type-check all workspace packages

# Discord bot (workspace member, Cloudflare Workers)
cd packages/discord-bot
bun run dev         # wrangler dev (local)
bun run deploy      # wrangler deploy (production)
bun run register    # Register slash commands with Discord (run once after changes)

# Reddit bot (separate standalone project)
cd packages/reddit-bot
npx devvit upload   # Deploy to Reddit
npx devvit settings set apiBaseUrl   # Set per-install config
npx devvit settings set siteBaseUrl
```

## Environment Variables (see .env.example)
| Variable | Purpose |
|----------|---------|
| `CARD_PROVIDER` | `riftcodex` (default) or `riot` |
| `DB_PATH` | SQLite file path (default `./data/riftseer.db`) |
| `API_PORT` | Server port (default `3000`) |
| `RIFTCODEX_BASE_URL` | `https://api.riftcodex.com` |
| `CACHE_REFRESH_INTERVAL_MS` | Cache TTL in ms (default 6h) |
| `FUZZY_THRESHOLD` | Fuse.js threshold 0–1 (default `0.4`) |
| `SUPABASE_URL` | Supabase project URL — required when `CARD_PROVIDER=supabase` (MR6+) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role JWT — required when `CARD_PROVIDER=supabase` |
| `REDIS_URL` | Redis connection URL (default `redis://localhost:6379`) |

## Key Architecture Decisions
- **Provider pattern**: `CardDataProvider` interface in `packages/core` is the only coupling point between the API and data sources. Swap providers by changing `CARD_PROVIDER` — only the factory (`packages/core/src/providers/index.ts`) changes.
- **Bots delegate to API**: Both the Discord bot and Reddit bot call the external `/api/v1/resolve` endpoint — neither embeds a provider nor SQLite connection.
- **SQLite cache**: RiftCodexProvider fetches all cards on startup, caches to SQLite, builds an in-memory Fuse.js index. Cache refreshes on a configurable interval.
- **Fuzzy search**: Fuse.js index is built from `name` + `clean_name` fields. Exact match is tried first; fuzzy search is used as fallback.

## Deployment
- **API + Frontend**: Docker (Alpine + Bun 1.3) or Railway (`railway.toml`). The Dockerfile serves the API and the built static frontend from the same container.
- **Discord bot**: Cloudflare Workers via `wrangler deploy`. Secrets set with `wrangler secret put`.
- **Reddit bot**: Devvit upload (`npx devvit upload`). The bot's HTTP fetch domain must be registered in `devvit.yaml`.

## Database Migrations (Supabase)
Migrations live in `supabase/migrations/`. Apply them in one of three ways:

```bash
# 1. Supabase CLI (recommended — install from https://supabase.com/docs/guides/cli)
supabase login
supabase db push          # pushes all pending migrations to the linked project

# 2. Supabase dashboard SQL editor
#    Open https://supabase.com/dashboard → your project → SQL Editor,
#    paste the contents of each migration file and run.

# 3. psql (direct connection)
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260221000000_initial_schema.sql
```

When adding a new migration, create a new file in `supabase/migrations/` with a
timestamp prefix (`YYYYMMDDHHmmss_description.sql`) and never edit existing
migration files.

## RiftCodex API
- Base URL: `https://api.riftcodex.com`
- Pagination: `GET /cards?page=N&size=100` → `{ items: Card[], total, page, size, pages }`
- ~656 cards across 14 pages (as of 2026-02)

## Legal Pages — IMPORTANT
`packages/frontend/src/components/PrivacyPage.tsx` and `TermsPage.tsx` are the **authoritative** privacy policy and terms of service shown to users. If any of the following change, **both the relevant page component AND this notice** must be updated:
- Data collected (e.g., new analytics, new fields stored in KV or DB)
- Third-party services added or removed (hosting, analytics, data providers)
- Bot behaviour (new triggers, new data logged, new KV keys)
- Scope of card data use or attribution
- Age requirements or acceptable-use rules
- Contact information or dispute resolution process

See each package's own `CLAUDE.md` for package-specific guidance.
