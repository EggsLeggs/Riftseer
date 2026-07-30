# packages/ingest-worker — Context for Claude

## Purpose
Cloudflare Worker that runs the full card data ingestion pipeline on a schedule (cron) or via an authenticated HTTP POST. It treats RiftCodex as the authoritative card/set source, enriches those records from TCGPlayer, overlays durable DB admin overrides, and upserts/prunes everything in Supabase atomically. It has **no connection to the API worker**.

## Source layout
```
src/
├── index.ts              # CF Worker entry — scheduled + POST /ingest handlers
├── ingest.ts             # runIngest() orchestrator; Env type
├── utils.ts              # logger + normalizeCardName (local copy — see note below)
├── sources/
│   ├── riftcodex.ts      # Fetch /sets + paginated /cards; rawToCard mapper
│   └── tcgcsv.ts         # Fetch TCGPlayer groups, products, prices
├── pipeline/
│   ├── types.ts          # IngestSet — internal set type
│   ├── normalize.ts      # normalizeSets / normalizeCards + overrides
│   ├── dedup.ts          # collapse genuine duplicate RiftCodex printings
│   ├── enrich.ts         # TCGPlayer group matching + product/price/image enrichment
│   ├── link.ts           # linkTokens, linkChampionsLegends, linkSignatures, linkRelatedPrintings
│   ├── overrides-db.ts   # DB override overlay (manual cards, patches, relationships, deletions)
│   └── db.ts             # ingestCardData() — calls ingest_card_data_v2 Postgres RPC
└── overrides/
    ├── index.ts           # Typed exports for all override maps
    ├── riftcodex_sets.json # Set name / is_promo / parent_set_code overrides
    ├── tcgplayer_groups.json # groupId → set_code / name / parent_set_code overrides
    └── cards.json         # Per-card overrides (e.g. use_tcgplayer_image)
```

## Pipeline flow
```
1. fetchAllSets + fetchAllPages  (sources/riftcodex.ts)
2. normalizeSets + normalizeCards + apply overrides  (pipeline/normalize.ts)
3. collapseDuplicates  (pipeline/dedup.ts)
4. fetchGroups + matchTcgGroupsToSets  (sources/tcgcsv.ts / pipeline/enrich.ts) ← non-fatal if fails
5. fetchAllGroupResults  (sources/tcgcsv.ts) ← non-fatal if fails
6. buildProductMap + enrichCards  (pipeline/enrich.ts) ← non-fatal if fails
7. linkTokens + linkChampionsLegends + linkSignatures + linkRelatedPrintings  (pipeline/link.ts)
8. overlayDbOverrides  (pipeline/overrides-db.ts)
9. ingestCardData → ingest_card_data_v2 RPC  (pipeline/db.ts)
```
Steps 4–6 (TCGPlayer enrichment) are wrapped in a try/catch; failure is logged as a warning and the pipeline continues with RiftCodex-only data. TCGPlayer never creates sets or cards.

## Local development
```bash
# Create packages/ingest-worker/.dev.vars with:
#   SUPABASE_URL=...
#   SUPABASE_SERVICE_ROLE_KEY=...
cd packages/ingest-worker
bun run dev   # starts wrangler dev at http://localhost:8787

# Trigger the pipeline:
curl -X POST http://localhost:8787/ingest
# or via scheduled event:
curl "http://localhost:8787/cdn-cgi/mf/scheduled"
```

## Important notes
- **`utils.ts` duplicates `normalizeCardName`** from `@riftseer/types`. This is intentional: `@riftseer/core` pulls in ioredis and Node.js built-ins that are incompatible with Cloudflare Workers. Do not import from `@riftseer/core` here.
- **Card IDs are `text`** (MongoDB ObjectIds — 24-char hex from RiftCodex), not UUIDs.
- **Supabase RPC** `ingest_card_data_v2` handles FK resolution (set_code → set_id, artist name → artist_id), upsert, admin deletion enforcement, and stale RiftCodex-card pruning inside the transaction. See `supabase/migrations/20260729000000_ingest_v2_and_overrides.sql` for the current definition.
- **`public_slug` assignment** lives in `pipeline/db.ts`. Slug logic comes from `@riftseer/types/slug` (zero-dep, also used by tests). Each card's slug is `<set>/<collector>(/signature)?/<name>`, with `a` appended to numeric collectors for alternate art and a `-2`, `-3`, … suffix on the name segment for collisions. Cards with no collector number get the sentinel segment `x`. The RPC `coalesce`s on conflict so the value persisted on first insert is **never overwritten** — public URLs stay stable across re-runs. Re-runs after a slug-column migration backfill nulls automatically.
- **File overrides** are still the right place for source-specific ingest fixes (set names, TCGPlayer group mappings, image preferences).
- **DB overrides** are the durable admin layer. `card_overrides` JSON merge-patches ingested cards, `manual_cards` adds cards with `source='manual'`, `card_relationship_overrides` adds/removes relationship stubs, and `card_deletions` prevents re-ingest of deleted upstream cards.

## Adding a new override
1. Add the entry to the relevant JSON file in `src/overrides/`
2. If a new override field is needed, update the interface in `src/overrides/index.ts` and the consuming code in `pipeline/normalize.ts` or `pipeline/enrich.ts`

For admin-authored card edits, use the DB override tables rather than adding JSON overrides. The worker applies DB overrides after auto-linking and before `ingest_card_data_v2`, so admin edits win immediately and on every later ingest.

## Environment variables
| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | Required |
| `RIFTCODEX_BASE_URL` | Default: `https://api.riftcodex.com` |
| `RIFTCODEX_API_KEY` | Optional API key for RiftCodex |
| `UPSTREAM_TIMEOUT_MS` | HTTP timeout in ms (default: 30000) |
| `INGEST_SECRET` | Bearer token to protect `POST /ingest` (optional) |
