# Riftseer — Project Context for Claude

## Overview
Riftseer is a Riftbound TCG card data platform. It exposes a REST API, a Next.js frontend, a Discord bot, and a Reddit bot that all share a common card data model.

## Monorepo Structure

```text
riftseer/
├── packages/types/          # Zero-dependency types, parser, icon tokens (@riftseer/types)
├── packages/core/           # Provider interface, Supabase provider, search, deck model (@riftseer/core)
├── packages/api/            # ElysiaJS REST API — Cloudflare Worker (wrangler dev/deploy)
├── packages/web/            # Next.js App Router SPA — Cloudflare Workers via OpenNext (@riftseer/web)
├── packages/frontend/       # React 19 + Vite SPA — DEPRECATED, to be removed (replaced by packages/web)
├── packages/discord-bot/    # Discord bot on Cloudflare Workers (Bun workspace member)
├── packages/ingest-worker/  # Cloudflare Worker — scheduled ingest (RiftCodex → Supabase, no API)
└── packages/reddit-bot/     # Devvit Reddit bot (NOT a Bun workspace member)
```

`packages/reddit-bot` is a standalone npm project excluded from the root Bun workspace (managed separately). Workspace members are `packages/types`, `packages/core`, `packages/api`, `packages/web`, `packages/discord-bot`, and `packages/ingest-worker`. (`packages/frontend` remains in the tree as deprecated Vite SPA; prefer `packages/web`.)

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun ≥ 1.2 (workspace tooling) + Cloudflare Workers (API runtime) |
| API | ElysiaJS 1.4+ with CloudflareAdapter + @elysiajs/cors |
| DB | bun:sqlite (built-in, no extra dep) |
| Web (packages/web) | Next.js App Router, Tailwind CSS 4, Cloudflare Workers via OpenNext |
| Frontend (deprecated) | React 19, React Router 7, Tailwind CSS 4, Vite 6 — replaced by packages/web |
| Card name search | Postgres `tsvector` full-text search (Supabase) |
| API client | @elysiajs/eden (type-safe, Eden Treaty) |
| Testing | bun test (Jest-compatible) |
| Discord bot | Cloudflare Workers + discord-api-types |
| Reddit bot | Devvit (Reddit platform) |

## Running the Project
```bash
bun dev             # API (wrangler dev) + frontend together
bun dev:api         # API only via wrangler dev (http://localhost:8789)
bun dev:web         # packages/web Next.js dev server
bun build:web       # packages/web production build
bun dev:frontend    # packages/frontend (deprecated)
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
| `SUPABASE_ANON_KEY` | Supabase anon/public JWT — required for `/api/v1/auth/*`. Use root `.env` / `.env.example` for local reference; for the deployed API Worker set via `cd packages/api && wrangler secret put SUPABASE_ANON_KEY` (see `secrets.required` in `packages/api/wrangler.jsonc`). |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL — optional |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token — required when `UPSTASH_REDIS_REST_URL` is set |
| `CACHE_REFRESH_INTERVAL_MS` | Provider stats refresh interval in ms (default 6h) |
| `LEGAL_TERMS_VERSION` | Version string stored with new users’ Terms acceptance at registration (`POST /auth/register`). **Set in `packages/api/wrangler.jsonc` → `vars`.** When you publish material Terms updates, bump this value and redeploy the API Worker so new signups record the new version. (Code still defaults to `1` if the binding is missing.) |
| `LEGAL_PRIVACY_VERSION` | Same for Privacy Policy acceptance. **Set in `packages/api/wrangler.jsonc` → `vars`** — bump alongside material Privacy policy updates and redeploy. |
| `SITE_ORIGIN` | Public site origin (no trailing slash) used to build absolute `riftseer_uri` values on every card response. **Set in `packages/api/wrangler.jsonc` → `vars`.** When unset, `riftseer_uri` is omitted and clients fall back to the legacy `/card/<id>` path. |
| `METAFY_COMMUNITY_ID` | Metafy community whose membership/subscription grants supporter status. **Set in `packages/api/wrangler.jsonc` → `vars`** (not confidential — it appears in the authorize URL). Required by `/auth/metafy/callback` and `/auth/metafy/refresh-status`; also gates the best-effort supporter refresh on login. |
| `METAFY_REDIRECT_URI` | OAuth redirect URI registered with Metafy — must match the web callback route (`<site>/auth/metafy/callback`). **Set in `packages/api/wrangler.jsonc` → `vars`.** |
| `METAFY_CLIENT_ID` | Metafy OAuth client id. Not confidential (it appears in the authorize URL), but the value is not committed — set via `cd packages/api && wrangler secret put METAFY_CLIENT_ID` (see `secrets.required` in `packages/api/wrangler.jsonc`). |
| `METAFY_CLIENT_SECRET` | Metafy OAuth client secret used for the authorization-code exchange — required. Set via `cd packages/api && wrangler secret put METAFY_CLIENT_SECRET`. |
| `METAFY_WEBHOOK_SECRET` | HMAC signing secret for `POST /api/v1/webhooks/metafy` — optional (Metafy Partners only). When unset the webhook endpoint returns 503. Set via `cd packages/api && wrangler secret put METAFY_WEBHOOK_SECRET`. |

### Ingest Worker (packages/ingest-worker)
| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL — required |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role JWT — required |
| `RIFTCODEX_BASE_URL` | RiftCodex API base (default: `https://api.riftcodex.com`) — optional |
| `RIFTCODEX_API_KEY` | RiftCodex API key — optional |
| `UPSTREAM_TIMEOUT_MS` | Timeout for upstream HTTP requests in ms (default: 30000) — optional |
| `INGEST_SECRET` | Bearer token for POST /ingest (optional) |

### Web (packages/web)
Production plain vars live under `env.production.vars` in `packages/web/wrangler.jsonc` (deploy with `opennextjs-cloudflare deploy --env production`). Mirror them in `.env.example` / local `.env` — they must match the values passed at build time (`opennextjs-cloudflare build`) and in `.github/workflows/web.yml`.

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Public API base URL used by the web client (e.g. `http://localhost:8789` locally, `https://api.riftseer.com` in production) |
| `NEXT_PUBLIC_APP_URL` | Public site/app URL used for OAuth/email `redirect_to` URLs (e.g. `http://localhost:3000` locally, `https://riftseer.com` in production) |
| `C15T_DATABASE_URL` | Supabase transaction pooler connection string — use port 6543 and append `?prepare=false`. Example value format: `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?prepare=false`. Required for the c15t consent backend. Declared under `secrets.required` in `packages/web/wrangler.jsonc`; set remotely via `cd packages/web && wrangler secret put C15T_DATABASE_URL`, and locally via `packages/web/.dev.vars`. |

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
- **Public card URLs**: Each printing has a stable `cards.public_slug` (e.g. `ogn/12a/signature/sun-disc`) generated on first ingest and **never overwritten** by subsequent runs — public URLs do not drift when upstream data is corrected. The API computes an absolute `riftseer_uri` on every card response (and on every related-card stub) using `SITE_ORIGIN`. Tools should prefer `card.riftseer_uri` over building URLs by id. Slug rules live in `packages/types/src/slug.ts`.

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

**Supabase RPC**: All three tables (sets, artists, cards) are written atomically via `ingest_card_data(p_sets, p_artists, p_cards)`. The current definition lives in `supabase/migrations/20260510030000_add_cards_public_slug.sql` (extends the earlier `20260407160000_fix_ingest_rpc_id_cast.sql` with the `public_slug` column). The `ON CONFLICT` clause `coalesce`s on `public_slug` so URLs are stable across ingest runs but still backfilled when null.

## Deployment
- **API**: Cloudflare Workers via `cd packages/api && wrangler deploy`. Secrets set with `wrangler secret put`. Worker name: `riftseer-api`.
- **Web (packages/web)**: Cloudflare Workers via `@opennextjs/cloudflare`. Run `bun run deploy` from `packages/web`. Build-time env vars must be set in the Workers Builds dashboard.
- **Frontend (deprecated)**: Cloudflare Pages (separate deployment) — will be removed when packages/web is complete.
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
Authoritative policy copy lives in **`packages/web/src/views/privacy-view.tsx`** (route `/privacy`) and **`packages/web/src/views/terms-view.tsx`** (route `/terms`). Shared layout primitives for both live in `packages/web/src/views/legal-document.tsx`.

The deprecated SPA (`packages/frontend`) keeps `/docs/privacy` and `/docs/terms` as short stubs linking to the canonical URLs on the main site.

When policy content changes, update **both** the relevant view component (`privacy-view.tsx` or `terms-view.tsx`) **and** its “Last updated” line; if routes or filenames change, update **this notice** too. For **material** changes that should distinguish new user consent, **bump `LEGAL_TERMS_VERSION` and/or `LEGAL_PRIVACY_VERSION` in `packages/api/wrangler.jsonc`** (`vars`) and redeploy the API Worker (`cd packages/api && wrangler deploy`).

If any of the following change, **update the relevant legal page (and this notice if paths change)**:
- Data collected (e.g., new analytics, new fields stored in KV or DB)
- Third-party services added or removed (hosting, analytics, data providers)
- Bot behaviour (new triggers, new data logged, new KV keys)
- Scope of card data use or attribution
- Age requirements or acceptable-use rules
- Contact information or dispute resolution process

See each package's own `CLAUDE.md` for package-specific guidance.
