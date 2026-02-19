# RiftSeer — Project Context for Claude

## Overview
RiftSeer is a Riftbound TCG card data platform. It exposes a REST API, a React frontend, and a Reddit bot that all share a common card data model.

## Monorepo Structure
```
riftseer/
├── packages/core/       # Shared types, provider interface, parser, SQLite DB
├── packages/api/        # ElysiaJS REST API (port 3000)
├── packages/frontend/   # React 19 + Vite SPA
└── packages/bot/        # Devvit Reddit bot (NOT a Bun workspace member)
```

`packages/bot` is a standalone npm project excluded from the root Bun workspace (`packages/core`, `packages/api`, `packages/frontend` are workspace members).

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
| Bot | Devvit (Reddit platform) |

## Running the Project
```bash
bun dev             # API + frontend together
bun dev:api         # API only (port 3000, swagger at /api/swagger)
bun dev:frontend    # Frontend only
bun test            # All tests (51 across 3 files)
bun typecheck       # Type-check all workspace packages

# Bot (separate project)
cd packages/bot
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

## Key Architecture Decisions
- **Provider pattern**: `CardDataProvider` interface in `packages/core` is the only coupling point between the API and data sources. Swap providers by changing `CARD_PROVIDER` — only the factory (`packages/core/src/providers/index.ts`) changes.
- **Bot delegates to API**: The bot calls the external `/api/resolve` endpoint — it does NOT embed a provider or SQLite connection.
- **SQLite cache**: RiftCodexProvider fetches all cards on startup, caches to SQLite, builds an in-memory Fuse.js index. Cache refreshes on a configurable interval.
- **Fuzzy search**: Fuse.js index is built from `name` + `clean_name` fields. Exact match is tried first; fuzzy search is used as fallback.

## Deployment
- **API + Frontend**: Docker (Alpine + Bun 1.3) or Railway (`railway.toml`). The Dockerfile serves the API and the built static frontend from the same container.
- **Bot**: Devvit upload (`npx devvit upload`). The bot's HTTP fetch domain must be registered in `devvit.yaml`.

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
