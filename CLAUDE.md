# Riftseer — Project Context for Claude

## Overview
Riftseer is a Riftbound TCG card data platform. It exposes a REST API, a React frontend, a Discord bot, and a Reddit bot that all share a common card data model.

## Monorepo Structure
```
riftseer/
├── packages/types/          # Zero-dependency types, parser, icon tokens (@riftseer/types)
├── packages/core/           # Provider interface, Supabase provider, search, deck model (@riftseer/core)
├── packages/api/            # ElysiaJS REST API — Cloudflare Worker (wrangler dev/deploy)
├── packages/frontend/       # React 19 + Vite SPA
├── packages/discord-bot/    # Discord bot on Cloudflare Workers (Bun workspace member)
├── packages/ingest-worker/  # Cloudflare Worker — scheduled ingest (RiftCodex → Supabase, no API)
└── packages/reddit-bot/     # Devvit Reddit bot (NOT a Bun workspace member)
```

`packages/reddit-bot` is a standalone npm project excluded from the root Bun workspace. `packages/types`, `packages/core`, `packages/api`, `packages/frontend`, `packages/discord-bot`, and `packages/ingest-worker` are workspace members.

## Stack
| Layer | Technology |
|-------|-----------|
| Runtime | Bun ≥ 1.2 (workspace tooling) + Cloudflare Workers (API runtime) |
| API | ElysiaJS 1.4+ with CloudflareAdapter + @elysiajs/cors |
| DB | bun:sqlite (built-in, no extra dep) |
| Frontend | React 19, React Router 7, Tailwind CSS 4, Vite 6 |
| Card name search | Postgres `tsvector` full-text search (Supabase) |
| API client | @elysiajs/eden (type-safe, Eden Treaty) |
| Testing | bun test (Jest-compatible) |
| Discord bot | Cloudflare Workers + discord-api-types |
| Reddit bot | Devvit (Reddit platform) |

## Running the Project
```bash
bun dev             # API (wrangler dev) + frontend together
bun dev:api         # API only via wrangler dev (http://localhost:8789)
bun dev:frontend    # Frontend only
bun test            # Run all tests
bun typecheck       # Type-check all workspace packages

# Discord bot (workspace member, Cloudflare Workers)
cd packages/discord-bot
bun run dev         # wrangler dev (local)
bun run deploy      # wrangler deploy (production)
bun run register    # Register slash commands with Discord (run once after changes)

# Ingest worker (workspace member, Cloudflare Workers — scheduled events)
cd packages/ingest-worker
bun run dev         # wrangler dev; requires packages/ingest-worker/.dev.vars with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
# Trigger ingest locally (while wrangler dev is running):
curl "http://localhost:8787/cdn-cgi/mf/scheduled"                              # scheduled event trigger
curl -X POST "http://localhost:8787/ingest"                                    # HTTP POST (no INGEST_SECRET set)
curl -X POST -H "Authorization: Bearer <INGEST_SECRET>" "http://localhost:8787/ingest"  # with INGEST_SECRET
bun run deploy      # wrangler deploy (set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY via wrangler secret put)

# Reddit bot (separate standalone project)
cd packages/reddit-bot
npx devvit upload   # Deploy to Reddit
npx devvit settings set apiBaseUrl   # Set per-install config
npx devvit settings set siteBaseUrl
```

## Environment Variables

### API Worker (packages/api — set via `wrangler secret put` or `wrangler.jsonc` vars)
| Variable | Purpose |
|----------|---------|
| `CARD_PROVIDER` | `supabase` (only; data from ingest pipeline) — set in `wrangler.jsonc` vars |
| `SUPABASE_URL` | Supabase project URL — required |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role JWT — required |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL — optional |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token — required when `UPSTASH_REDIS_REST_URL` is set |
| `CORS_ORIGIN` | Comma-separated allowed origins (default: `https://riftseer.pages.dev,https://riftseer.com`) |
| `CACHE_REFRESH_INTERVAL_MS` | Provider stats refresh interval in ms (default 6h) |

### Ingest Worker (packages/ingest-worker)
| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL — required |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role JWT — required |
| `RIFTCODEX_BASE_URL` | RiftCodex API base (default: `https://api.riftcodex.com`) — optional |
| `RIFTCODEX_API_KEY` | RiftCodex API key — optional |
| `UPSTREAM_TIMEOUT_MS` | Timeout for upstream HTTP requests in ms (default: 30000) — optional |
| `INGEST_SECRET` | Bearer token for POST /ingest (optional) |

### GitHub Actions — ingest worker deploy (`.github/workflows/ingest-worker.yml`)

| Secret | Purpose |
|----------|---------|
| `SUPABASE_DB_URL` | **Postgres** connection URI for `psql` only: confirms every file in `supabase/migrations/` is in `supabase_migrations.schema_migrations`. Prefer **Session** or **Transaction pooler** from **Dashboard → Database → Connection string** — GitHub Actions is usually **IPv4-only**, and Supabase’s **direct** host (`db.*.supabase.co:5432`) may not work without IPv4 support. Put your DB password in the URI. **Not** `https://*.supabase.co` and **not** `SUPABASE_SERVICE_ROLE_KEY`. |

## Key Architecture Decisions
- **Provider pattern**: `CardDataProvider` interface in `packages/core`; the only implementation is `SupabaseCardProvider` (data from the ingest pipeline).
- **Bots delegate to API**: Both the Discord bot and Reddit bot call the external `/api/v1/cards/resolve` endpoint.
- **Ingest**: Modular pipeline runs as a Cloudflare Worker on a schedule. No ingest endpoint in the API. See [Ingest Pipeline](#ingest-pipeline) below.
- **Card name search**: Postgres `tsvector` on `name` + `name_normalized`. Exact `name_normalized` match is tried first; full-text search is used as fallback.
- **Card IDs**: `cards.id` is `text` (MongoDB ObjectIds from RiftCodex — 24-char hex strings).

## Ingest Pipeline

The pipeline runs inside `packages/ingest-worker` and is orchestrated by `src/ingest.ts`:

```text
RiftCodex /sets + /cards
    ↓ src/sources/riftcodex.ts  — fetch + map to Card[]
    ↓ src/pipeline/normalize.ts — apply overrides, build IngestSet[]
    ↓ src/pipeline/enrich.ts    — clearDuplicateImages (alt-art/reprints)
    ↓ src/sources/tcgcsv.ts     — fetch TCGPlayer groups, products, prices
    ↓ src/pipeline/enrich.ts    — reconcileSets + enrichCards (prices, purchase URIs, fallback images)
    ↓ src/pipeline/link.ts      — linkTokens, linkChampionsLegends, linkRelatedPrintings
    ↓ src/pipeline/db.ts        — ingestCardData() RPC → Supabase (atomic upsert)
```

**Key files:**

| File | Purpose |
|------|---------|
| `src/index.ts` | CF Worker entry — `scheduled` handler + `POST /ingest` HTTP trigger |
| `src/ingest.ts` | Pipeline coordinator (`runIngest`) + `Env` type |
| `src/utils.ts` | Local `logger` + `normalizeCardName` (can't import @riftseer/core in CF Workers) |
| `src/sources/riftcodex.ts` | Fetch RiftCodex `/sets` and `/cards`; `rawToCard` mapper |
| `src/sources/tcgcsv.ts` | Fetch TCGPlayer groups, products, and prices via TCGCSV |
| `src/pipeline/types.ts` | `IngestSet` — internal set type with external_ids |
| `src/pipeline/normalize.ts` | `normalizeSets` / `normalizeCards` — apply overrides |
| `src/pipeline/enrich.ts` | `reconcileSets`, `clearDuplicateImages`, `buildProductMap`, `enrichCards` |
| `src/pipeline/link.ts` | `linkTokens`, `linkChampionsLegends`, `linkRelatedPrintings` |
| `src/pipeline/db.ts` | `ingestCardData()` — calls `ingest_card_data` Postgres RPC |
| `src/overrides/` | JSON override files for sets, TCGPlayer groups, individual cards |

**Overrides** (`src/overrides/*.json`) allow correcting or augmenting upstream data without code changes:
- `riftcodex_sets.json` — override set names, `is_promo`, `parent_set_code`
- `tcgplayer_groups.json` — map TCGPlayer groupId → canonical set_code / name / parent
- `cards.json` — per-card overrides (e.g. `use_tcgplayer_image: true`)

**TCGPlayer enrichment is non-fatal**: if TCGCSV is unavailable, the pipeline continues without prices/images. Cards still get upserted with RiftCodex data only.

**Supabase RPC**: All three tables (sets, artists, cards) are written atomically via `ingest_card_data(p_sets, p_artists, p_cards)`. See `supabase/migrations/20260407160000_fix_ingest_rpc_id_cast.sql` for the current definition.

## Deployment
- **API**: Cloudflare Workers via `cd packages/api && wrangler deploy`. Secrets set with `wrangler secret put`. Worker name: `riftseer-api`.
- **Frontend**: Cloudflare Pages (separate deployment).
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

# 3. psql (direct Postgres connection string)
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
