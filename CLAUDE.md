# Riftseer project guidance

Riftseer is a Riftbound TCG data platform: a shared card model, REST API, Next.js site, Discord bot, Reddit bot, and scheduled ingest pipeline.

## Repository

```text
packages/types/          Zero-dependency shared types, parser, deck model, icons, slug and image helpers
packages/core/           Provider interface, Supabase provider, search
packages/api/            Elysia REST API on Cloudflare Workers
packages/web/            Next.js App Router site on Cloudflare Workers
packages/discord-bot/    Cloudflare Worker Discord bot
packages/ingest-worker/  Scheduled RiftCodex → Supabase ingest and image hosting
packages/raycast-extension/  Standalone npm project, outside the Bun workspace
packages/reddit-bot/     Standalone Devvit project, outside the Bun workspace
supabase/migrations/     Database migrations, append-only after the baseline
```

Read package-local guidance before changing a package.

## Common commands

```bash
bun dev                 # API + web, against PRODUCTION Supabase
bun run dev:local       # API + web, against the local docker database
bun dev:api             # API at http://localhost:8789
bun dev:web             # Next.js development server

bun run db:local:up     # Postgres + PostgREST + a Supabase-shaped proxy on :54321
bun run db:local:reset  # drop the volume and rebuild from supabase/migrations
bun run dev:api:local   # API against the local database instead of production
bun run dev:ingest:local
bun run test:db         # contract tests, against a throwaway database
curl localhost:8787/    # reports which database the ingest worker would write to
bun build:web
bun test
bun typecheck

cd packages/ingest-worker
bun run dev              # Worker at http://localhost:8787 (shares Miniflare R2/queue state with the API via ../../.wrangler/shared)
curl http://localhost:8787/cdn-cgi/mf/scheduled
curl -X POST http://localhost:8787/ingest   # unauthenticated unless INGEST_SECRET is set

cd packages/discord-bot
bun run dev
bun run register         # after slash-command changes

cd packages/reddit-bot
npx devvit upload
```

## The card model

Two levels. A field belongs to exactly one of them.

- **Oracle** — the rules object. Name, type, tags, domains, rules text, equip data, keywords, meta flags, relationships. Has a real surrogate `id`; printings carry a foreign key to it.
- **Printing** — one physical card. Art, artist, flavour, **rarity**, collector number, set, finishes, marketplace data, and a pinned `public_slug`.

`oracle_key` is a stable name-derived *lookup slug*, never identity. `oracleKeyForName()` in `packages/types/src/oracle.ts` is used at exactly one moment: when ingest meets a new printing and has to guess which oracle it belongs to. A printing it cannot match goes to the review queue rather than silently creating a second oracle.

## Architecture invariants

- RiftCodex is authoritative for cards and sets. TCGCSV only enriches existing records with prices, purchase links and fallback images. Riot's official card gallery (`content.publishing.riotgames.com`) supplies only the `[Equip]` section RiftCodex has no field for, and reports what it thinks we are missing or have wrong. Neither source creates a card.
- `CardDataProvider` lives in `packages/core`; `SupabaseCardProvider` is the production implementation.
- Bots resolve cards through `/api/v1/cards/resolve`, not their own databases.
- Printing ids are text MongoDB ObjectIds, not UUIDs. They must stay stable across a rebuild because `deck_cards` rows and hosted image URLs are both keyed on them. Oracle ids are UUIDs.
- **Two mechanisms that look similar and are not.** A `printing_deltas` row means the card genuinely differs from its oracle on that printing — Vayne carries `Sentinel` on newer printings but not the original, so the oracle has the tag and the old printing carries a `remove`, and printings that arrive later inherit correctly with no action. `locked_fields` means an admin decided a value and ingest must not undo it. Ingest owns `source='ingest'` delta rows and never touches `source='admin'` ones.
- That pairing, plus `deleted_at` soft deletes and `source='manual'` rows the prune skips, is the *whole* durability story. There is no override overlay and no tombstone table.
- Relationships are **oracle → oracle edges, stored once**, in three directed kinds: `makes_token`, `character`, `signature`. `used_by` is the reverse of `makes_token`, read by querying the other column. There is no printing-scoped relationship override — a relationship is a property of the rules object.
- `resolved_printings` is a trigger-maintained projection with the delta layer already applied. Search must never resolve deltas at query time, and `card_search_ast_to_sql` scans exactly one flat relation.
- The card search grammar (`packages/core/src/card-search-query.ts`) is also the **ruling rule language**: an admin query is parsed by that parser, stored as its AST, and evaluated by the same `card_search_ast_to_sql`. Adding a field to search adds it to rules; a leaf that cannot be rendered to SQL must not parse. Document changes in `packages/web/src/views/search-syntax-view.tsx` and `packages/api/docs/search.md`.
- **Rarity is printing-level.** TCGPlayer treats Showcase as a rarity while RiftCodex and the gallery report the base card's rarity on an alternate-art or showcase printing. That disagreement is real data, not review-queue noise.
- An `[Equip]` gear's Might bonus is `oracles.might_bonus`, and `0` is a real printed value — **presence, never truthiness**, decides whether a card is equipment.
- `oracles.keywords` is derived by a **database trigger** from the rules text, so ingest, admin patches and manual creation all stay in sync without each remembering to recompute it. `extractCardKeywords()` in `packages/types/src/keywords.ts` is the TypeScript mirror, covered against the SQL function by shared conformance cases.
- Legality is **default-legal**: only non-legal statuses are stored at oracle level, and precedence is printing row → oracle row → legal. Statuses are `legal`, `restricted`, `not_legal`, `banned`; severity is a function of status, defaulted in `packages/types/src/deck.ts` and overridable per format by a `format_legality_severities` row. A warning names which rung fired, because a banned printing under a legal oracle is fixed by swapping the art, not cutting the card.
- **A deck is a row, not a string.** Decks are account-owned, and a `deck_cards` row carries both `oracle_id` and `printing_id` behind a composite foreign key, so "this printing belongs to this oracle" is a schema fact. Counting is by oracle, display is by printing. Format limits live in `format_zone_rules` as data — a format that enforces nothing simply has no rows — and are **never** database constraints, so changing a format cannot make an existing deck unloadable. `validateDeck()` in `packages/types` is the single evaluator, shared by the builder and the API — and by the **signed-out** builder, which holds its deck in localStorage and validates in the browser, which is why `GET /formats` publishes each format's `zone_rules` and `severity_overrides`. A guest deck is never encoded into a URL: that is the printing-id short form this model replaced.
- Hosted image URLs are **derived** from the printing id, never stored. The database keeps `image_hosted_at` (is the full R2 variant set present?) and `image_source_hash` (which source were the variants built from?). `packages/types/src/card-image.ts` is the single derivation, shared by the worker that writes the objects and the API that hands out the URLs.
- RiftCodex types `collector_number` as an integer, which drops the letter prefix several numbering tracks print — `T03` (tokens), `SP3` (special collections), `R01` (runes). `printedCollectorNumber()` in `packages/ingest-worker/src/sources/riftcodex.ts` restores it from the `riftbound_id` collector segment, and only when a prefix is actually present: the id zero-pads plain numbers (`ogn-042a-298`) where the card and every existing slug do not.
- Slugs are pinned on first insert and never overwritten, so public URLs do not drift as upstream data is corrected. Because the derivation is pure, a catalogue rebuilt from the same upstream data regenerates identical slugs. Prefer API-provided `riftseer_uri` over constructing card URLs.
- `/card/<printing-id>` must keep resolving. It is not the canonical URL, but the legacy frontend used it and the current site preserved it.
- Do not import `@riftseer/core` into the ingest Worker. It has Worker-incompatible dependencies; use the local utilities there.

## Ingest

`packages/ingest-worker/src/ingest.ts` coordinates:

```text
RiftCodex fetch → normalize/deduplicate → group printings into oracles
→ TCGPlayer enrichment → official gallery equipment → oracle relationship edges
→ divergence detection → printing deltas → bounded ingest_catalogue batches
→ guarded final prune → projection and preferred-printing refresh
→ ruling rule refresh → review queue → image queue → R2 variants
```

- TCGPlayer and official-gallery failures are both non-fatal and neither creates cards or sets.
- `ingest_catalogue` receives bounded batches with pruning disabled. Pruning runs only after every batch succeeds, using the complete valid-id list, so a failed batch leaves stale rows rather than deleting a catalogue it only half wrote.
- The ingest RPC defers the projection for its transaction (`riftseer.defer_projection`) and rebuilds once at the end — thousands of per-row rebuilds otherwise.
- Rule-scoped rulings are re-materialised after the upsert. Advisory: rulings are supplementary to the card page, so a failure is logged and swallowed rather than failing an ingest that already committed.
- What ingest cannot reconcile is filed in `reconciliation_queue` for `/admin/review` rather than applied. `source` says which observer raised the entry, and the fingerprint encodes the observed upstream value, so a dismissal sticks while a genuinely new disagreement resurfaces. Prices are never queued. Detection runs on final data so a confirmed link does not re-surface, and ingest refreshes and prunes only `pending` rows. The prune is queue-wide, so it runs only when **both** sources reported.
- The production schedule is `0 */6 * * *`.

## Configuration and deployment

Treat each package's `wrangler.jsonc`, `.env.example`, and generated Worker bindings as authoritative. Never commit secrets; use `.dev.vars` locally and `wrangler secret put` remotely.

- API: Supabase URL/service/anon keys, optional Upstash, legal consent versions, `SITE_ORIGIN`, comma-separated `ADMIN_USER_IDS`, shared `CARD_IMAGES`/`CARD_IMAGE_QUEUE` bindings, `CARD_IMAGE_BASE_URL`, Metafy OAuth/webhook settings.
- Ingest: Supabase service credentials, RiftCodex settings, `RIFTBOUND_GALLERY_BASE_URL`, `CARD_IMAGE_BASE_URL`, R2 `CARD_IMAGES`, queue `CARD_IMAGE_QUEUE`, `IMAGES`.
- Web: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, secret `C15T_DATABASE_URL` (Supabase transaction pooler on port 6543 with `?prepare=false`).
- CI ingest migration check: `SUPABASE_DB_URL` must be a Postgres connection URI, preferably an IPv4-compatible Supabase pooler URI — not an HTTPS project URL or service-role key.

Deployments: `wrangler deploy` from `packages/api` and `packages/discord-bot`; `bun run deploy` from `packages/ingest-worker`; from `packages/web` run `bun run preview` first to test workerd, then `bun run deploy` (production builds must use matching build-time and Worker vars); `npx devvit upload` from `packages/reddit-bot`.

Image infrastructure uses R2 bucket `riftseer-cards`, queues `riftseer-card-images` and `riftseer-card-images-dlq`, and cached custom domain `img.riftseer.com`.

## Database migrations

- The schema is defined by a single squashed baseline: `supabase/migrations/20260810000000_oracle_printing_baseline.sql`. Migrations are append-only after it; never edit an existing one.
- Prefer `supabase db push` for linked projects. Dashboard SQL or `psql "$SUPABASE_DB_URL" -f <migration>` are fallbacks.
- A new column needs a reader **and** a writer; a new table needs a reason the existing ones cannot serve. State both in the migration.
- No new JSONB grab-bag columns. `attributes` / `classification` / `text` / `metadata` existed because they mirrored an upstream payload, and unwinding them is what this schema is for. New fields get columns, or a stated reason not to.
- One implementation per pattern. Three hand-rolled versions of "oracle row, then printing exception" is the clearest lesson in this repo's history.
- Validate a migration by running it, not by reading it. A local Postgres catches SQL errors; a local **PostgREST** additionally catches client-shape bugs psql cannot see — a one-to-one embedded resource comes back as an object or null, never an array.

## Writing guidance files

- Prefer a structural fix to a documented warning. A line saying "keep X and Y in step" is a bug report against the code: hoist the shared thing instead.
- Keep hard-won "why" — anything that encodes a bug already paid for. Move local "what" into a code comment next to the thing it describes, where it is seen at the moment it matters and updated in the same diff. Delete restatements of what the code says more accurately.
- Adding a bullet to an invariants list should prompt the question *"which bullet does this replace?"*. The append-only habit is what turned this file's migration section into a changelog.
- Every tracked `CLAUDE.md` has a sibling `AGENTS.md` symlink that resolves to it. `CLAUDE.md` is canonical; put shared guidance there and never maintain a second copy. The docs-reference check enforces the pairing.

## Legal pages

Canonical copy lives in `packages/web/src/views/privacy-view.tsx` (`/privacy`), `packages/web/src/views/terms-view.tsx` (`/terms`), and the shared `packages/web/src/views/legal-document.tsx`.

When policy content changes, update the page and its "Last updated" date. For material changes, also bump `LEGAL_PRIVACY_VERSION` and/or `LEGAL_TERMS_VERSION` in `packages/api/wrangler.jsonc` and redeploy the API.

Review the legal pages when data collection, third parties, bot behavior/logging, card-data use, age/acceptable-use rules, contact details, or dispute terms change.
