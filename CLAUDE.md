<!-- IMPORTANT: AGENTS.md and CLAUDE.md must remain byte-for-byte identical. Update both together and verify with `cmp AGENTS.md CLAUDE.md`. -->

# Riftseer project guidance

Riftseer is a Riftbound TCG data platform: a shared card model, REST API, Next.js site, Discord bot, Reddit bot, and scheduled ingest pipeline.

## Repository

```text
packages/types/          Zero-dependency shared types, parser, icons, slug helpers
packages/core/           Provider interface, Supabase provider, search, deck model
packages/api/            Elysia REST API on Cloudflare Workers
packages/web/            Canonical Next.js App Router site on Cloudflare Workers
packages/frontend/       Deprecated Vite SPA; prefer packages/web
packages/discord-bot/    Cloudflare Worker Discord bot
packages/ingest-worker/  Scheduled RiftCodex → Supabase ingest and image hosting
packages/reddit-bot/     Standalone Devvit project, outside the Bun workspace
supabase/migrations/     Append-only production database migrations
```

The Bun workspace includes every package above except `packages/reddit-bot`; the deprecated frontend remains present but should not receive new product work.

Read package-local guidance before changing a package, especially `packages/web/AGENTS.md` and `packages/ingest-worker/CLAUDE.md`.

## Common commands

```bash
bun dev                 # API + canonical web app
bun dev:api             # API at http://localhost:8789
bun dev:web             # Next.js development server
bun build:web
bun test
bun typecheck

cd packages/ingest-worker
bun run dev              # Worker at http://localhost:8787
curl http://localhost:8787/cdn-cgi/mf/scheduled
curl -X POST http://localhost:8787/ingest

cd packages/discord-bot
bun run dev
bun run register         # after slash-command changes

cd packages/reddit-bot
npx devvit upload
```

## Architecture invariants

- RiftCodex is authoritative for cards and sets. TCGCSV only enriches existing records with prices, purchase links, and fallback images.
- `CardDataProvider` lives in `packages/core`; `SupabaseCardProvider` is the production implementation.
- Bots resolve cards through `/api/v1/cards/resolve`, not their own databases.
- Card IDs are text MongoDB ObjectIds, not UUIDs.
- Card search uses exact `name_normalized` matching before Postgres full-text fallback.
- Each printing receives a stable `public_slug`; ingest must preserve an existing slug. Prefer API-provided `riftseer_uri` over constructing card URLs.
- Rulings and format legalities are keyed on `cards.oracle_key` — a name-derived group shared by every printing — not on the card id. `oracleKeyForName()` in `packages/types/src/oracle.ts` is the only derivation; a SQL mirror exists solely for the migration backfill.
- Legality is **default-legal**: only non-legal statuses are stored, and precedence is per-printing override → oracle row → legal.
- Do not import `@riftseer/core` into the ingest Worker. It has Worker-incompatible dependencies; use the local utilities there.

## Ingest

`packages/ingest-worker/src/ingest.ts` coordinates:

```text
RiftCodex fetch → normalize/deduplicate → TCGPlayer enrichment
→ relationship linking → durable DB overrides → image catalogue
→ bounded Supabase RPC upserts → guarded final prune → image queue
→ Cloudflare Images variants → R2 → hash-guarded media update
```

Important behavior:

- TCGPlayer failure is non-fatal and never creates cards or sets.
- DB overrides (`card_overrides`, `manual_cards`, relationship overrides, deletions) are applied after automatic linking so admin edits survive every ingest.
- `ingest_card_data_v2` receives bounded card batches with pruning disabled. Pruning runs only after every batch succeeds, using the complete valid-ID list.
- Hosted images use `cards/<id>/{small,normal,large}.webp` plus `original` in R2. `media.source_hash` is the source-URL hash: unchanged completed media is reused; changed sources are queued. The publish RPC verifies the current hash.
- The production schedule is `0 */6 * * *`. Manual `POST /ingest` may be protected by `INGEST_SECRET`.

## Configuration and deployment

Treat each package's `wrangler.jsonc`, `.env.example`, and generated Worker bindings as authoritative. Never commit secrets; use `.dev.vars` locally and `wrangler secret put` remotely.

Key configuration groups:

- API: Supabase URL/service/anon keys, optional Upstash, legal consent versions, `SITE_ORIGIN`, comma-separated `ADMIN_USER_IDS`, shared `CARD_IMAGES`/`CARD_IMAGE_QUEUE` bindings, `CARD_IMAGE_BASE_URL`, and Metafy OAuth/webhook settings.
- Ingest: Supabase service credentials, RiftCodex settings, `CARD_IMAGE_BASE_URL`, R2 `CARD_IMAGES`, queue `CARD_IMAGE_QUEUE`, and `IMAGES`.
- Web: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, and secret `C15T_DATABASE_URL` (Supabase transaction pooler on port 6543 with `?prepare=false`).
- CI ingest migration check: `SUPABASE_DB_URL` must be a Postgres connection URI, preferably an IPv4-compatible Supabase pooler URI—not an HTTPS project URL or service-role key.

Deployments:

- API: `cd packages/api && wrangler deploy`
- Ingest: `cd packages/ingest-worker && bun run deploy`
- Web: from `packages/web`, run `bun run preview` first to test workerd, then `bun run deploy`; production builds must use matching build-time and Worker vars.
- Discord: `cd packages/discord-bot && bun run deploy`
- Reddit: `cd packages/reddit-bot && npx devvit upload`

Image infrastructure uses R2 bucket `riftseer-cards`, queues `riftseer-card-images` and `riftseer-card-images-dlq`, and cached custom domain `img.riftseer.com`.

## Database migrations

- Add a new timestamped file under `supabase/migrations/` for every schema change; never edit an existing migration.
- Prefer `supabase db push` for linked projects. Dashboard SQL or `psql "$SUPABASE_DB_URL" -f <migration>` are fallbacks.
- The current ingest/override RPC is defined by `20260731000000_phase5_rulings_legalities_formats.sql` (which supersedes the `ingest_card_data_v2` body in `20260729000000_ingest_v2_and_overrides.sql` to persist `oracle_key`); image publication is defined by `20260730001503_phase2_card_image_hosting.sql`; admin mutation RPCs by `20260730120000_phase3_admin_api.sql`.

## Legal pages

Canonical copy lives in:

- `packages/web/src/views/privacy-view.tsx` (`/privacy`)
- `packages/web/src/views/terms-view.tsx` (`/terms`)
- shared layout: `packages/web/src/views/legal-document.tsx`

When policy content changes, update the relevant page and its “Last updated” date. For material changes, also bump `LEGAL_PRIVACY_VERSION` and/or `LEGAL_TERMS_VERSION` in `packages/api/wrangler.jsonc` and redeploy the API.

Review the legal pages when data collection, third parties, bot behavior/logging, card-data use, age/acceptable-use rules, contact details, or dispute terms change. The deprecated SPA only contains stubs linking to the canonical pages.
