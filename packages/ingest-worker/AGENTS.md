# packages/ingest-worker

Cloudflare Worker that runs the card ingest on a schedule or via `POST /ingest`. RiftCodex is authoritative for cards and sets; TCGPlayer and Riot's official gallery only enrich or observe. It has **no connection to the API worker**.

## Source layout

- `src/index.ts` — Worker entry: scheduled handler, `POST /ingest`, queue consumer.
- `src/ingest.ts` — the `runIngest()` orchestrator.
- `src/env.ts` — the `Env` type. New optional secrets go here; new vars and bindings go in `wrangler.jsonc`.
- `src/supabase.ts` — service-role client factory. `src/utils.ts` — logger and `normalizeCardName`.
- `src/sources/` — `riftcodex.ts` (sets and paginated cards), `riftbound-gallery.ts` (equipment and coverage), `tcgcsv.ts` (TCGPlayer groups, products, prices).
- `src/pipeline/` — `normalize.ts`, `dedup.ts`, `oracles.ts`, `enrich.ts`, `gallery.ts`, `link.ts`, `durable.ts`, `reconcile.ts`, `db.ts`, `retry.ts`, plus shared `types.ts`.
- `src/images/` — `model.ts` (source selection and hashing), `catalog.ts` (job dedup and queueing), `processor.ts` (queue consumer), `types.ts`.
- `src/overrides/` — static JSON fixes for set names, TCGPlayer groups and per-card flags.
- `src/worker-configuration.d.ts` — generated bindings. Regenerate after every `wrangler.jsonc` change.

## Pipeline flow

`runIngest()` runs these in order. The order matters more than it looks — two steps sit where they do for a reason.

1. `fetchAllSets` and `fetchAllPages` in parallel.
2. `normalizeSets` / `normalizePrintings`, then `collapseDuplicates`.
3. `loadDurablePrintings` and `applyLockedProductLinks` — **before** enrichment, not after.
4. TCGPlayer: `fetchGroups` → `matchTcgGroupsToSets` → `fetchAllGroupResults` → `buildProductMap` → `enrichPrintings`.
5. `buildOracles` — printings into oracles, plus printing deltas and the divergence report.
6. Gallery: `fetchGalleryCards` → `buildGalleryIndex` → `applyGalleryEquipment`, applied **onto the oracles step 5 just built**.
7. `linkOracles` — oracle-to-oracle edges.
8. `preparePrintingImageJobs`.
9. `ingestCatalogue` — bounded batches, then one final call that prunes.
10. Reconciliation queue: build entries, then `syncReconciliationQueue`.
11. `refreshRulingRuleMatches`.
12. `enqueueCardImageCatalogJob`.

TCGPlayer, gallery and `applyLockedProductLinks` each sit in their own try/catch. A failure is logged and the run continues; none of them ever creates a set or a card.

## Why things are the way they are

- **Durable state is seeded at step 3, not later.** `applyLockedProductLinks` must put a confirmed `tcgplayer_id` onto printings before enrichment, or the enricher cannot match the product.
- Without it the printing stays priceless and the reconciler re-files the entry an admin just resolved. The other lock it reads is an admin `image`, whose bytes may not be transcoded yet.
- **`utils.ts` duplicates `normalizeCardName`** from `@riftseer/types` on purpose. `@riftseer/core` pulls in ioredis and Node built-ins Workers cannot load. Never import `@riftseer/core` here.
- **Printing ids are `text`** — 24-char MongoDB ObjectIds from RiftCodex, not UUIDs.
- **There is no override overlay.** Admin edits live on the row they edit, protected by `locked_fields`, which the ingest RPC honours per column.
- **`ingest_catalogue` runs in bounded batches with pruning disabled**, then once more with the complete valid-id list and pruning on.
- A failed batch leaves stale rows rather than deleting a catalogue it only half wrote, and the run is safely re-runnable.
- Relationships and the prune list go only in that final call. Batches always send `p_relationships: null` and `p_prune: false`.
- `INGEST_RPC_CARD_BATCH_SIZE` is 150, not 300. At 300 cards (~700 KiB) Supabase returned repeated opaque `internal error`s.
- Half the work held open per transaction is half the window a dropped connection can land in.
- **Ingest RPCs retry opaque failures** in `pipeline/retry.ts`: four attempts, 750ms/1.5s/3s. Two consecutive runs once failed on *different* batches of identical data.
- Only opaque failures qualify — `internal error`, `fetch failed`, timeouts, delimited 502/503/504. A constraint violation is deterministic and surfaces immediately.
- **`jsonb_to_recordset` maps by column name**, so a key sent under the wrong name does not error. The column arrives NULL and the field is silently dropped.
- Verify payload changes with a round trip that reads the rows back, not by reading the SQL.
- **Ingest writes no `meta_flags`.** That `is:` vocabulary is admin-authored, and an admin edit locks the column.
- **One TCGPlayer product is applied to at most one printing.** Matching runs per collector-number candidate, most specific first (`113a` before `113`), each trying number+name then number alone.
- The bare-number pass is guarded by `namesAgreeAllowingVariantSuffix`, because TCGPlayer marks variants in the *name* while Vendetta marks them on the *number*.
- Doing exact-name lookups first, or bare number first, put alternate art on its base printing's product — publishing the wrong price and filing a rarity disagreement no admin could resolve.
- Contention resolves per product: strongest tier, then least-variant printing, then lowest id. Losers also shed the contested `tcgplayer_id`.
- **Champion ↔ legend linking joins on the *character* tag**, never any shared tag. A champion carries its region and species too.
- RiftCodex puts a species tag on some legends the printed card does not carry: Heart of the Tempest reads `LEGEND | KENNEN` but arrives tagged `Yordle, Kennen`, which linked every Yordle champion to Kennen.
- `characterTags()` intersects a card's tags with the character half of its own name, before the ` - ` or `, ` epithet separator.
- Matching the character half matters: `Nidalee - Cat Form` and `Lillia - Fae Fawn` would otherwise claim `Cat` and `Fae`.
- **Relationships are oracle → oracle, written once**: `makes_token`, `character`, `signature`. The reverse of each is a query, and siblings are `printings WHERE oracle_id = …`.
- **The official gallery** supplies the `[Equip]` section RiftCodex has no field for, and nothing else.
- `mightBonus` is the discriminator for equipment: all 40 equipment cards have it and nothing else does, while one Spell carries a stray `effect` that keying off `effect` would publish as rules text.
- `0` is a real bonus — test presence, never truthiness.
- Gallery ids spell signatures `ogn-305-star-298` where RiftCodex writes `ogn-305*-298`. `normalizeGalleryId` folds them; without it 36 printings read as missing every run.
- **`collector_number` prefixes.** RiftCodex types it as an integer, dropping the prefix `T03` tokens, `SP3` special collections and `R01` runes print.
- `printedCollectorNumber()` restores it from the `riftbound_id` collector segment, and only when a prefix is actually present.
- The id zero-pads plain numbers (`ogn-042a-298`) where the card and every existing slug do not. `galleryPrintedCollectorNumber()` is the gallery-side equivalent.
- **Slugs are pinned.** The RPC `coalesce`s on conflict, so a value persisted on first insert is never overwritten and public URLs stay stable.
- **`keywords` is not sent.** A database trigger derives it from the oracle's rules text on every write.
- **Image idempotency lives in `image_source_hash`.** An unchanged hash keeps the existing R2 objects; a changed hash queues new variants.
- Hosted URLs are derived from the printing id by `@riftseer/types/card-image`, and public URLs carry `?v=<hash>` so a corrected image bypasses immutable caches.
- **The review queue prune is queue-wide**, so it runs only when *both* observers reported. Pruning on one source's findings would delete the other's entries.
- Entries carry a fingerprint encoding the observed upstream value, so a dismissal sticks while a genuinely new disagreement resurfaces. Prices are never queued.

## Local development

```bash
# packages/ingest-worker/.dev.vars needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
bun run dev                                  # wrangler dev on :8787
curl http://localhost:8787/                  # reports the host it would write to
curl -X POST http://localhost:8787/ingest
curl "http://localhost:8787/cdn-cgi/mf/scheduled"
```

- Run **both** the API and this worker with the same `--persist-to` directory; the package `dev` scripts use `../../.wrangler/shared`.
- Miniflare R2 and Queues are per-process otherwise: an admin upload lands in the API's private bucket and the consumer never sees the object.
- For a live admin-image end-to-end, run the API with `wrangler dev --remote` and do not run this worker locally.
- Per-binding `remote: true` on `CARD_IMAGES` is not enough — those puts fail with `503` or `put: Unspecified error` from the local proxy.
- Queues are unsupported in `--remote`, so an upload may land with `queued: false`. Prefer a real deploy for a full upload → queue → variants check.

```bash
wrangler types src/worker-configuration.d.ts --env-interface GeneratedEnv --include-runtime false
```

## Environment

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — required secrets.
- `RIFTCODEX_BASE_URL` — default `https://api.riftcodex.com`. `RIFTCODEX_API_KEY` — optional secret.
- `RIFTBOUND_GALLERY_BASE_URL` — default `https://content.publishing.riotgames.com`.
- `UPSTREAM_TIMEOUT_MS` — default `30000`.
- `INGEST_SECRET` — optional. Guards `POST /ingest` with a constant-time compare; unset means the route is unauthenticated.
- `CARD_IMAGE_BASE_URL` — default `https://img.riftseer.com`.
- `CARD_IMAGES` — R2 bucket `riftseer-cards`. `CARD_IMAGE_QUEUE` — queue `riftseer-card-images`, DLQ `riftseer-card-images-dlq`. `IMAGES` — Cloudflare Images.
- Production cron is `0 */6 * * *`.

## Adding a file override

Add the entry to the relevant JSON in `src/overrides/`. A new field also needs the interface in `src/overrides/index.ts` and its consumer in `pipeline/normalize.ts` or `pipeline/enrich.ts`.

File overrides are for source-specific ingest fixes. Admin-authored card edits go through the admin API instead — they write the row and lock the column, and ingest honours that automatically.
