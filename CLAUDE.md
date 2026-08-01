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
bun run dev              # Worker at http://localhost:8787 (shares Miniflare R2/queue state with the API via ../../.wrangler/shared)
curl http://localhost:8787/cdn-cgi/mf/scheduled
# POST /ingest is unauthenticated unless INGEST_SECRET is set:
curl -X POST http://localhost:8787/ingest
curl -X POST http://localhost:8787/ingest -H "Authorization: Bearer ${INGEST_SECRET}"

cd packages/discord-bot
bun run dev
bun run register         # after slash-command changes

cd packages/reddit-bot
npx devvit upload
```

## Architecture invariants

- RiftCodex is authoritative for cards and sets. TCGCSV only enriches existing records with prices, purchase links, and fallback images. Riot's official card gallery (`content.publishing.riotgames.com`, the data behind playriftbound.com) supplies only the equipment section RiftCodex has no field for, and reports what it thinks we are missing or have wrong. Neither source creates a card.
- `CardDataProvider` lives in `packages/core`; `SupabaseCardProvider` is the production implementation.
- Bots resolve cards through `/api/v1/cards/resolve`, not their own databases.
- Card IDs are text MongoDB ObjectIds, not UUIDs.
- Card search uses exact `name_normalized` matching before Postgres full-text fallback.
- The card search grammar (`packages/core/src/card-search-query.ts`) is also the **ruling rule language**: an admin-written query is parsed by that parser, stored as its AST, and evaluated by the same `card_search_ast_to_sql` RPC. Adding a field to search adds it to rules; a leaf that cannot be rendered to SQL must not parse. Document changes in `packages/web/src/views/search-syntax-view.tsx` and `packages/api/docs/search.md`.
- Each printing receives a stable `public_slug`; ingest must preserve an existing slug. Prefer API-provided `riftseer_uri` over constructing card URLs.
- RiftCodex types `collector_number` as an integer, which drops the letter prefix several numbering tracks print — `T03` (tokens), `SP3` (special collections), `R01` (runes). `printedCollectorNumber()` in `packages/ingest-worker/src/sources/riftcodex.ts` restores it from the `riftbound_id` collector segment, and only when a prefix is actually present: the id zero-pads plain numbers (`ogn-042a-298`) where the card and every existing slug do not. `metadata.special_collection` (searchable as `is:special`) comes from the same parse.
- An `[Equip]` gear's second text box — the Might it grants and the effect that comes with it — lives in `attributes.might_bonus` and `text.equipment`. RiftCodex omits it entirely; the official gallery is the only source. It is applied by **oracle key**, because the gallery has no promo printings and an equipment effect is a property of the card, not the printing. A `might_bonus` of `0` is a real printed value, so presence — never truthiness — decides whether a card is equipment.
- Rulings and format legalities are keyed on `cards.oracle_key` — a name-derived group shared by every printing — not on the card id. `oracleKeyForName()` in `packages/types/src/oracle.ts` is the only derivation; a SQL mirror exists solely for the migration backfill.
- A ruling is separate from what it applies to. `card_ruling_targets` points one ruling at a whole card (`oracle`), a single printing (`printing`), or a saved search query (`query`). Query targets are materialised into `card_ruling_matches`, refreshed on admin save, at the end of every ingest (`refresh_ruling_rule_matches`), and per card on every admin card mutation (`refresh_ruling_matches_for_card`) — together those are what make a rule cover cards written after it, whether they arrive by ingest or by hand.
- `cards.keywords` holds the `[Keyword]` badges a printing's text carries, as base keys (`deflect`, not `Deflect 3`). Unlike `oracle_key`, it is derived by a **DB trigger** rather than sent in the ingest payload, so ingest, admin card patches and manual card creation all stay in sync without each remembering to recompute it. `extractCardKeywords()` in `packages/types/src/keywords.ts` is the TypeScript mirror; keep the two in step.
- Legality is **default-legal**: only non-legal statuses are stored, and precedence is per-printing override → oracle row → legal.
- Do not import `@riftseer/core` into the ingest Worker. It has Worker-incompatible dependencies; use the local utilities there.

## Ingest

`packages/ingest-worker/src/ingest.ts` coordinates:

```text
RiftCodex fetch → normalize/deduplicate → TCGPlayer enrichment
→ official gallery equipment → relationship linking → durable DB overrides
→ review queue (TCGPlayer + gallery) → image catalogue
→ bounded Supabase RPC upserts → guarded final prune
→ image queue → Cloudflare Images variants → R2 → hash-guarded media update
```

Important behavior:

- TCGPlayer and official-gallery failures are both non-fatal and neither creates cards or sets.
- DB overrides (`card_overrides`, `manual_cards`, relationship overrides, deletions) are applied after automatic linking so admin edits survive every ingest. Relationship overrides are dual-scoped like legalities: oracle-keyed rows apply to every printing of the card (including ones that arrive later), then printing-scoped exceptions win.
- `ingest_card_data_v2` receives bounded card batches with pruning disabled. Pruning runs only after every batch succeeds, using the complete valid-ID list.
- Hosted images use `cards/<id>/{small,normal,large}.webp` plus `original` in R2. `media.source_hash` is the source-URL hash: unchanged completed media is reused; changed sources are queued. The publish RPC verifies the current hash.
- Rule-scoped rulings are re-materialised after the card upsert (`refreshRulingRuleMatches`). It is advisory: rulings are supplementary to the card page, so a failure is logged and swallowed rather than failing an ingest that already committed.
- What ingest cannot reconcile is filed in `reconciliation_queue` for `/admin/review` rather than applied: TCGPlayer products that match no card, printings the official gallery lists that we hold no card for, and field disagreements from either source. `source` says which observer raised the entry. Prices are never queued. TCGPlayer is the only source that knows `Showcase` is a rarity — RiftCodex and the gallery both report the base card's rarity on an alternate-art, overnumbered or signature printing — so its rarity is compared and filed too. Detection runs after the override overlay so a confirmed link does not re-surface, and admin decisions are durable — ingest refreshes and prunes only `pending` rows. The prune is queue-wide, so it runs only when **both** sources reported; pruning on one source's findings would delete the other's.
- The production schedule is `0 */6 * * *`. Manual `POST /ingest` may be protected by `INGEST_SECRET`.

## Configuration and deployment

Treat each package's `wrangler.jsonc`, `.env.example`, and generated Worker bindings as authoritative. Never commit secrets; use `.dev.vars` locally and `wrangler secret put` remotely.

Key configuration groups:

- API: Supabase URL/service/anon keys, optional Upstash, legal consent versions, `SITE_ORIGIN`, comma-separated `ADMIN_USER_IDS`, shared `CARD_IMAGES`/`CARD_IMAGE_QUEUE` bindings, `CARD_IMAGE_BASE_URL`, and Metafy OAuth/webhook settings.
- Ingest: Supabase service credentials, RiftCodex settings, `RIFTBOUND_GALLERY_BASE_URL`, `CARD_IMAGE_BASE_URL`, R2 `CARD_IMAGES`, queue `CARD_IMAGE_QUEUE`, and `IMAGES`.
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
- The current ingest/override RPC is defined by `20260731000000_phase5_rulings_legalities_formats.sql` (which supersedes the `ingest_card_data_v2` body in `20260729000000_ingest_v2_and_overrides.sql` to persist `oracle_key`); image publication is defined by `20260730001503_phase2_card_image_hosting.sql`; admin mutation RPCs by `20260730120000_phase3_admin_api.sql`; the review queue by `20260801000000_phase6_reconciliation_queue.sql`; per-card ruling rematch by `20260803000000_ruling_matches_for_card.sql`; searchable keywords, the v2 search grammar and ruling targets/rules by `20260802000000_phase7_keywords_and_ruling_rules.sql` (which supersedes `card_search_ast_to_sql` from `20260510140000_add_card_search_rpc.sql` and the ruling RPCs from phase 5); the `is:special` flag and the gallery-aware review queue by `20260805000000_phase8_special_collection_and_gallery_review.sql` (which again supersedes `card_search_ast_to_sql`, renames `reconciliation_queue.tcgplayer_payload` to `payload`, and redefines both phase-6 queue RPCs — apply it and deploy the API together); dual-scope relationship overrides by `20260806000000_relationship_override_scopes.sql` (redefines `admin_set_card_relationships` with `p_all_printings` and adds `admin_list_card_relationships` — apply it and deploy the API together). `20260807000000_relationship_lock_order_and_queue_rename_guard.sql` then supersedes `admin_set_card_relationships` once more (locking the oracle group in id order), drops the redundant `card_relationship_overrides_oracle_key_idx`, and re-runs the phase-8 `payload` rename conditionally for a database left part-way through that push.

## Legal pages

Canonical copy lives in:

- `packages/web/src/views/privacy-view.tsx` (`/privacy`)
- `packages/web/src/views/terms-view.tsx` (`/terms`)
- shared layout: `packages/web/src/views/legal-document.tsx`

When policy content changes, update the relevant page and its “Last updated” date. For material changes, also bump `LEGAL_PRIVACY_VERSION` and/or `LEGAL_TERMS_VERSION` in `packages/api/wrangler.jsonc` and redeploy the API.

Review the legal pages when data collection, third parties, bot behavior/logging, card-data use, age/acceptable-use rules, contact details, or dispute terms change. The deprecated SPA only contains stubs linking to the canonical pages.
