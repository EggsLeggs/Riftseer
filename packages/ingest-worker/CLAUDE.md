# packages/ingest-worker — Context for Claude

## Purpose
Cloudflare Worker that runs the full card data ingestion pipeline on a schedule (cron) or via an authenticated HTTP POST. It fetches data from RiftCodex and TCGPlayer, links relationships, and upserts everything to Supabase atomically. It has **no connection to the API worker**.

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
│   ├── enrich.ts         # reconcileSets, clearDuplicateImages, buildProductMap, enrichCards
│   ├── link.ts           # linkTokens, linkChampionsLegends, linkRelatedPrintings
│   └── db.ts             # ingestCardData() — calls ingest_card_data Postgres RPC
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
3. clearDuplicateImages  (pipeline/enrich.ts)
4. fetchGroups  (sources/tcgcsv.ts)           ← non-fatal if fails
5. reconcileSets  (pipeline/enrich.ts)         ← non-fatal if fails
6. fetchAllGroupResults  (sources/tcgcsv.ts)   ← non-fatal if fails
7. buildProductMap + enrichCards  (pipeline/enrich.ts)  ← non-fatal if fails
8. linkTokens + linkChampionsLegends + linkRelatedPrintings  (pipeline/link.ts)
9. ingestCardData RPC  (pipeline/db.ts)
```
Steps 4–7 (TCGPlayer enrichment) are wrapped in a try/catch; failure is logged as a warning and the pipeline continues with RiftCodex-only data.

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
- **Supabase RPC** `ingest_card_data` handles FK resolution (set_code → set_id, artist name → artist_id) inside the transaction. See `supabase/migrations/20260407160000_fix_ingest_rpc_id_cast.sql`.
- **Overrides** are the right place to patch upstream data issues — prefer JSON overrides over code changes for set names, group mappings, and image preferences.

## Adding a new override
1. Add the entry to the relevant JSON file in `src/overrides/`
2. If a new override field is needed, update the interface in `src/overrides/index.ts` and the consuming code in `pipeline/normalize.ts` or `pipeline/enrich.ts`

## Environment variables
| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | Required |
| `RIFTCODEX_BASE_URL` | Default: `https://api.riftcodex.com` |
| `RIFTCODEX_API_KEY` | Optional API key for RiftCodex |
| `UPSTREAM_TIMEOUT_MS` | HTTP timeout in ms (default: 30000) |
| `INGEST_SECRET` | Bearer token to protect `POST /ingest` (optional) |
