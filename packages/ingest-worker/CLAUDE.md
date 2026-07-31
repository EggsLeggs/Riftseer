# packages/ingest-worker — Context for Claude

## Purpose
Cloudflare Worker that runs the full card data ingestion pipeline on a schedule (cron) or via an authenticated HTTP POST. It treats RiftCodex as the authoritative card/set source, enriches those records from TCGPlayer and Riot's official card gallery, overlays durable DB admin overrides, and upserts/prunes everything in Supabase. Card upserts use bounded atomic RPC batches; pruning is enabled only in a final RPC after all batches succeed. The same Worker produces and consumes a Cloudflare Queue that re-hosts card images in R2. It has **no connection to the API worker**.

## Source layout
```
src/
├── index.ts              # CF Worker entry — scheduled + POST /ingest handlers
├── ingest.ts             # runIngest() orchestrator; Env type
├── env.ts                # generated Wrangler bindings + optional-secret additions
├── supabase.ts           # service-role Supabase client factory
├── images/
│   ├── types.ts          # versioned, validated CardImageJob payload
│   ├── model.ts          # source selection, source hashing, R2 keys/URLs
│   ├── catalog.ts        # preserve hosted media + queue job producer
│   └── processor.ts      # queue consumer: fetch, transform, upload, publish
├── utils.ts              # logger + normalizeCardName (local copy — see note below)
├── sources/
│   ├── riftcodex.ts      # Fetch /sets + paginated /cards; rawToCard mapper
│   ├── riftbound-gallery.ts # Riot's official card gallery — equipment + coverage
│   └── tcgcsv.ts         # Fetch TCGPlayer groups, products, prices
├── pipeline/
│   ├── types.ts          # IngestSet — internal set type
│   ├── normalize.ts      # normalizeSets / normalizeCards + overrides
│   ├── dedup.ts          # collapse genuine duplicate RiftCodex printings
│   ├── enrich.ts         # TCGPlayer group matching + product/price/image enrichment
│   ├── gallery.ts        # Official-gallery index + equipment application
│   ├── link.ts           # linkTokens, linkChampionsLegends, linkSignatures, linkRelatedPrintings
│   ├── overrides-db.ts   # DB override overlay (manual cards, patches, relationships, deletions)
│   ├── reconcile.ts      # Review queue — unmatched products, missing cards, field diffs
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
6b. fetchGalleryCards + buildGalleryIndex + applyGalleryEquipment  (pipeline/gallery.ts) ← non-fatal if fails
7. linkTokens + linkChampionsLegends + linkSignatures + linkRelatedPrintings  (pipeline/link.ts)
8. overlayDbSetOverrides + overlayDbOverrides  (pipeline/overrides-db.ts)
9. backfillLinkedPrices + buildReconciliationEntries + buildGalleryReconciliationEntries + syncReconciliationQueue  (pipeline/reconcile.ts)
10. prepareCardImageJobs — preserve unchanged R2 URLs; hash changed sources
11. ingestCardData → ingest_card_data_v2 RPC  (pipeline/db.ts)
12. refreshRulingRuleMatches → refresh_ruling_rule_matches RPC  (pipeline/db.ts)
13. enqueue a catalogue scan → riftseer-card-images; the consumer fans out pending card jobs
```
Steps 4–6 (TCGPlayer enrichment) and step 6b (official gallery) are each wrapped in their own try/catch; failure is logged as a warning and the pipeline continues with RiftCodex-only data. Neither source ever creates sets or cards. Step 9 runs whichever half of the queue its source reported, and is itself wrapped in a try/catch — the review queue is advisory and must never cost an ingest.

The queue **prune** is the exception to that per-source independence: it deletes every pending row this run did not re-observe, so it runs only when *both* sources reported. Pruning on one source's findings would silently delete the other's entries.

Step 6b runs *before* the override overlay, unlike step 9, so an admin-written `text.equipment` survives every ingest like any other card edit.

Step 9 runs **after** the override overlay, on the final cards, on purpose:

- An admin-confirmed `external_ids.tcgplayer_id` lands via `card_overrides`, which the overlay applies at step 8. Detecting against pre-override cards would re-file the same "unmatched product" on every run despite the confirmation.
- Those links arrive too late for `enrichCards`, so `backfillLinkedPrices` applies prices and the purchase URI for them. It touches nothing else — media is already final and an admin image override must survive.
- Entries are identified by a `fingerprint` that encodes the observed upstream value, so a dismissal sticks while a genuinely *new* disagreement re-surfaces.

The queue consumer downloads a maximum 20 MB source image, detects orientation
with the Cloudflare Images binding, writes the original plus 200/400/1000px WebP
variants to `cards/<id>/`, then calls `apply_card_hosted_media`. That RPC updates
`cards.media` only while its source hash still matches the queued job, so delayed
jobs cannot overwrite a newer upstream image.

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

R2 and Queues use Wrangler's local simulation. The Images binding is configured
as a remote binding, so local image transformation requires Cloudflare login and
uses the account's Images transformations.

## Image infrastructure

Create the resources once before the first deployment:

```bash
wrangler r2 bucket create riftseer-cards
wrangler queues create riftseer-card-images
wrangler queues create riftseer-card-images-dlq
```

In the Cloudflare dashboard, attach `img.riftseer.com` as the
`riftseer-cards` bucket's custom domain, enable a Cache Everything rule for
`img.riftseer.com/cards/*`, and keep the public `r2.dev` URL disabled. The
`CARD_IMAGE_BASE_URL` Wrangler variable must match that custom domain.

Local `wrangler dev` for day-to-day work: run **both** the API and the ingest
worker with the same `--persist-to` directory (the package `dev` scripts use
`../../.wrangler/shared`). Miniflare R2 and Queues are otherwise per-process —
an admin upload would land in the API's private bucket, the consumer would never
see the object, and fetching `img.riftseer.com` would 404. The consumer also
reads hosted admin sources straight from the R2 binding (`hostedObjectKeyFromUrl`)
rather than over HTTP, so shared local state is enough.

For a **live** admin-image E2E (real R2 + production image consumer): run the
API with `bun run dev:remote` (`wrangler dev --remote`) and do **not** run the
local ingest worker. Per-binding `remote: true` on `CARD_IMAGES` is not enough —
those puts fail with `503` / `put: Unspecified error` from the local proxy;
full `--remote` executes the Worker on Cloudflare where R2 writes work. Note that
Queues are not supported in `wrangler dev --remote`, so the upload may land in
R2/DB with `queued: false` and wait for the next production ingest catalogue
scan to enqueue variant generation — prefer a production deploy for a full
upload→queue→variants check.

Generate and validate binding types after every `wrangler.jsonc` change:

```bash
wrangler types src/worker-configuration.d.ts \
  --env-interface GeneratedEnv --include-runtime false
wrangler types src/worker-configuration.d.ts \
  --env-interface GeneratedEnv --include-runtime false --check
```

## Important notes
- **`utils.ts` duplicates `normalizeCardName`** from `@riftseer/types`. This is intentional: `@riftseer/core` pulls in ioredis and Node.js built-ins that are incompatible with Cloudflare Workers. Do not import from `@riftseer/core` here.
- **Card IDs are `text`** (MongoDB ObjectIds — 24-char hex from RiftCodex), not UUIDs.
- **Supabase RPC** `ingest_card_data_v2` handles FK resolution (set_code → set_id, artist name → artist_id), upsert, admin deletion enforcement, and stale RiftCodex-card pruning. The worker sends bounded, individually atomic card batches with pruning disabled, then sends the complete valid-ID list in a final prune call. See `supabase/migrations/20260729000000_ingest_v2_and_overrides.sql` for the current definition.
- **Image publish RPC** `apply_card_hosted_media` is service-role-only and hash-guarded. See `supabase/migrations/20260730001503_phase2_card_image_hosting.sql`.
- **Official gallery** (`sources/riftbound-gallery.ts`) supplies the `[Equip]` section RiftCodex has no field for — `attributes.might_bonus` and `text.equipment` — and nothing else. `mightBonus` is the discriminator for "this is equipment": every one of the 40 equipment cards has it and nothing else does, while one Spell carries a stray `effect` that keying off `effect` would publish as rules text. Equipment is applied by **oracle key** (`pipeline/gallery.ts`), because the gallery covers the numbered sets only and the JDG/OPP printings of an equipment card must inherit it. It is also the source of `missing_card` review entries. Gallery ids spell signatures `ogn-305-star-298` where RiftCodex writes `ogn-305*-298`; `normalizeGalleryId` folds them, without which 36 printings read as missing on every run.
- **Review queue RPC** `ingest_reconciliation_queue` mirrors the card RPC's batching: bounded entry batches upsert with pruning disabled, then one final call carries the complete fingerprint list. Only **pending** rows are refreshed or pruned — a confirmed or dismissed row is never touched, which is what makes an admin's decision durable. See `supabase/migrations/20260801000000_phase6_reconciliation_queue.sql`.
- **`oracle_key` assignment** also lives in `pipeline/db.ts`, computed with `oracleKeyForName()` from `@riftseer/types/oracle` from each card's *final* name, after every override is applied — so a rename moves the card into the right oracle group. Rulings and format legalities are keyed on it, and `linkRelatedPrintings` groups by the same key. Automatic linking runs *before* the override overlay, so `applyDbOverrides` re-runs `linkRelatedPrintings` once a patch or manual card has changed the set of final names — without that pass a renamed card would ship pre-rename siblings under its post-rename key. Explicit relationship overrides are applied after the rebuild and still win: oracle-scoped rows (`oracle_key` set) expand to every printing with that key — including printings that join later — then printing-scoped rows win as exceptions. The migration carries a SQL mirror (`card_oracle_key()`) for the backfill; keep the two in step.
- **Ingest RPCs retry opaque failures** (`pipeline/retry.ts`, used by both `ingestCardData` and `syncReconciliationQueue`). Supabase intermittently answers a valid upsert with `internal error; reference = …` — a dropped connection, not a bad payload: two consecutive runs failed on *different* batches of identical data, batch 4 then batch 3. Every batch is its own transaction and re-sending one is idempotent, so `callRpcWithRetry` gives each call 4 attempts with 750ms/1.5s/3s backoff. Only opaque failures qualify (`internal error`, `fetch failed`, timeouts, 502/503/504); a constraint violation or bad argument is deterministic and surfaces immediately. `INGEST_RPC_CARD_BATCH_SIZE` is 150 rather than 300 for the same reason — half the work held open per transaction, half the window a dropped connection can land in.
- **One TCGPlayer product is applied to at most one printing.** Matching runs per collector-number candidate, most specific first (`113a` before `113`), and each candidate tries number+name then number alone — the latter guarded by `namesAgreeAllowingVariantSuffix`, because TCGPlayer marks variants in the *name* ("Ambessa The Wolf Alternate Art") while Vendetta's RiftCodex names both printings identically and marks the variant on the *number*. Doing all the exact-name lookups first, or trying the bare number first, put the alternate art on its base printing's product — publishing the wrong price and filing a rarity disagreement no admin could resolve. Whatever contention survives is resolved per product: strongest tier, then the least variant printing, then the lowest id; the losers also **shed the contested `tcgplayer_id`**, including one RiftCodex itself asserted, so the reconciler never compares a printing against a product describing another. Only the two PR Viktor - Leader promos still contend, and legitimately — both print `OGN • 246/298` against a single product.
- **Champion ↔ legend linking joins on the *character* tag**, never on any shared tag. A champion carries its region and species too — Poppy - Paragon is tagged `Yordle`, `Demacia`, `Poppy` — and RiftCodex puts a species tag on some legends that the printed card does not carry: Heart of the Tempest reads `LEGEND | KENNEN` but arrives tagged `Yordle, Kennen`, which used to link every Yordle champion to Kennen. `characterTags()` in `pipeline/link.ts` intersects a card's tags with the character half of its own name (before the ` - ` or `, ` epithet separator — Origins–Unleashed use one, Vendetta the other). Matching the character half rather than the whole name matters: `Nidalee - Cat Form` and `Lillia - Fae Fawn` would otherwise claim the `Cat` and `Fae` species tags out of their epithets. Legends stay indexed on every tag, because the lookup key is always the champion's character tag. `linkSignatures` needs no such filter — no signature carries more than one tag that appears on a Legend.
- **Rule-scoped rulings** are re-materialised by `refreshRulingRuleMatches` after the card upsert — it reads `cards`, so it must follow it. A ruling can target a saved search query instead of a card, and this refresh is what makes such a rule cover printings that did not exist when it was written. Advisory, like the review queue: a failure is logged and swallowed, never costing an ingest that already committed.
- **`cards.keywords` is not sent in the payload.** A DB trigger derives it from the card's rules text on every write, which keeps ingest, admin patches and manual cards in sync without three separate call sites. See `20260802000000_phase7_keywords_and_ruling_rules.sql`.
- **`public_slug` assignment** lives in `pipeline/db.ts`. Slug logic comes from `@riftseer/types/slug` (zero-dep, also used by tests). Each card's slug is `<set>/<collector>(/signature)?/<name>`, with `a` appended to numeric collectors for alternate art and a `-2`, `-3`, … suffix on the name segment for collisions. Cards with no collector number get the sentinel segment `x`. The RPC `coalesce`s on conflict so the value persisted on first insert is **never overwritten** — public URLs stay stable across re-runs. Re-runs after a slug-column migration backfill nulls automatically.
- **Image idempotency** lives in `media.source_hash`. An unchanged hash carries the existing R2 URLs through ingest; a changed hash queues new variants. Public URLs carry `?v=<hash>` so corrected images bypass immutable caches.
- **File overrides** are still the right place for source-specific ingest fixes (set names, TCGPlayer group mappings, image preferences).
- **DB overrides** are the durable admin layer. `card_overrides` JSON merge-patches ingested cards, `manual_cards` adds cards with `source='manual'`, `card_relationship_overrides` adds/removes relationship stubs (oracle-scoped via `oracle_key` or printing-scoped via `card_id`), and `card_deletions` prevents re-ingest of deleted upstream cards. Sets use the parallel `set_overrides`, `manual_sets`, and `set_deletions` tables before the ingest RPC.

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
| `RIFTBOUND_GALLERY_BASE_URL` | Default: `https://content.publishing.riotgames.com` |
| `UPSTREAM_TIMEOUT_MS` | HTTP timeout in ms (default: 30000) |
| `INGEST_SECRET` | Bearer token to protect `POST /ingest` (optional) |
| `CARD_IMAGE_BASE_URL` | Public R2 custom domain (default: `https://img.riftseer.com`) |
| `CARD_IMAGES` | R2 binding for the `riftseer-cards` bucket |
| `CARD_IMAGE_QUEUE` | Queue producer binding for `riftseer-card-images` |
| `IMAGES` | Cloudflare Images binding used by the queue consumer |
