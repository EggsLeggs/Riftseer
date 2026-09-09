# apps/ingest-worker

Cloudflare Worker that runs the card ingest on a schedule (`0 */6 * * *`) or via `POST /ingest`. RiftCodex is authoritative for cards and sets; TCGPlayer and Riot's official gallery only enrich or observe. It has no connection to the API worker. Vocabulary is the root `CONTEXT.md`.

## Pipeline flow

`runIngest()` in `src/ingest.ts` runs these in order. Two steps sit where they do for a reason.

1. `fetchAllSets` and `fetchAllPages` in parallel.
2. `normalizeSets` / `normalizePrintings`, then `collapseDuplicates`.
3. `loadDurablePrintings` and `applyLockedProductLinks`, before enrichment, not after.
4. TCGPlayer: `fetchGroups`, `matchTcgGroupsToSets`, `fetchAllGroupResults`, `buildProductMap`, `enrichPrintings`.
5. `buildOracles`: printings into oracles, plus printing deltas and the divergence report.
6. Gallery: `fetchGalleryCards`, `buildGalleryIndex`, `applyGalleryEquipment`, applied onto the oracles step 5 just built.
7. `linkOracles`: oracle-to-oracle edges.
8. `preparePrintingImageJobs`.
9. `ingestCatalogue`: bounded batches, then one final call that prunes.
10. Reconciliation queue: build entries, then `syncReconciliationQueue`.
11. `refreshRulingRuleMatches`.
12. `enqueueCardImageCatalogJob`.

TCGPlayer, gallery and `applyLockedProductLinks` each sit in their own try/catch. A failure is logged and the run continues; none of them ever creates a set or a card.

## Why things are the way they are

- Durable state is seeded at step 3, not later. `applyLockedProductLinks` must put a confirmed `tcgplayer_id` onto printings before enrichment, or the enricher cannot match the product, the printing stays priceless and the reconciler re-files the entry an admin just resolved. The other lock it reads is an admin `image`, whose bytes may not be transcoded yet.
- `src/utils.ts` duplicates `normalizeCardName` from `@riftseer/types` on purpose. `@riftseer/core` pulls in ioredis and Node built-ins Workers cannot load; never import it here.
- Printing ids are `text`: 24-char MongoDB ObjectIds from RiftCodex, not UUIDs.
- There is no override overlay. Admin edits live on the row they edit, protected by `locked_fields`, which the ingest RPC honours per column.
- `ingest_catalogue` runs in bounded batches with pruning disabled, then once more with the complete valid-id list and pruning on. A failed batch leaves stale rows rather than deleting a catalogue it only half wrote, and the run is safely re-runnable. Relationships and the prune list go only in that final call; batches always send `p_relationships: null` and `p_prune: false`.
- `INGEST_RPC_CARD_BATCH_SIZE` is 150, not 300. At 300 cards (~700 KiB) Supabase returned repeated opaque `internal error`s, and half the work held open per transaction is half the window a dropped connection can land in.
- Ingest RPCs retry opaque failures in `src/pipeline/retry.ts`: four attempts, 750ms/1.5s/3s, because two consecutive runs once failed on different batches of identical data. Only opaque failures qualify (`internal error`, `fetch failed`, timeouts, delimited 502/503/504). A constraint violation is deterministic and surfaces immediately.
- `jsonb_to_recordset` maps by column name, so a key sent under the wrong name does not error: the column arrives NULL and the field is silently dropped. Verify payload changes with a round trip that reads the rows back, not by reading the SQL.
- Ingest writes no `meta_flags`. That `is:` vocabulary is admin-authored, and an admin edit locks the column.
- One TCGPlayer product is applied to at most one printing. Matching runs per collector-number candidate, most specific first (`113a` before `113`), each trying number+name then number alone. The bare-number pass is guarded by `namesAgreeAllowingVariantSuffix`, because TCGPlayer marks variants in the name while Vendetta marks them on the number. Exact-name-first or bare-number-first put alternate art on its base printing's product, publishing the wrong price and filing a rarity disagreement no admin could resolve. Contention resolves per product: strongest tier, then least-variant printing, then lowest id, and losers shed the contested `tcgplayer_id`.
- Champion to legend linking joins on the character tag, never any shared tag. RiftCodex puts a species tag on some legends the printed card does not carry (Heart of the Tempest reads `LEGEND | KENNEN` but arrives tagged `Yordle, Kennen`), which linked every Yordle champion to Kennen. `characterTags()` intersects a card's tags with the character half of its own name, before the epithet separator (a dash or a comma), so `Nidalee - Cat Form` cannot claim `Cat`.
- Relationships are oracle to oracle, written once: `makes_token`, `character`, `signature`. The reverse of each is a query, and siblings are `printings WHERE oracle_id = …`.
- The official gallery supplies the `[Equip]` section RiftCodex has no field for, and nothing else. `mightBonus` is the discriminator: all 40 equipment cards have it and nothing else does, while one Spell carries a stray `effect` that keying off `effect` would publish as rules text. `0` is a real bonus; test presence, never truthiness.
- Gallery ids spell signatures `ogn-305-star-298` where RiftCodex writes `ogn-305*-298`. `normalizeGalleryId` folds them; without it 36 printings read as missing every run.
- RiftCodex types `collector_number` as an integer, dropping the prefix on `T03` tokens, `SP3` special collections and `R01` runes. `printedCollectorNumber()` restores it from the `riftbound_id` collector segment, only when a prefix is actually present; the id zero-pads plain numbers (`ogn-042a-298`) where the card and every existing slug do not. `galleryPrintedCollectorNumber()` is the gallery-side equivalent.
- Slugs are pinned. The RPC `coalesce`s on conflict, so a value persisted on first insert is never overwritten.
- `keywords` is not sent. A database trigger derives it from the oracle's rules text on every write.
- Image idempotency lives in `image_source_hash`: an unchanged hash keeps the existing R2 objects, a changed hash queues new variants. Hosted URLs derive from the printing id in `@riftseer/types/card-image`, and public URLs carry `?v=<hash>` so a corrected image bypasses immutable caches.
- R2 outlives the rows that point at it. `image_hosted_at` is the only record that a printing is published, and a schema rebuild resets it while every object survives — which is how 1304 printings served upstream Riot URLs for five weeks with their art already hosted. So an image job HEADs the four objects first and, when all of them name the current hash, publishes without downloading anything; it rebuilds only when the set is incomplete or built from an older source. `hasCompleteCurrentImageSet` counts `original` too: keys are stable across source changes, so finding a key proves nothing about the bytes under it.
- Publishing needs an orientation and nothing in the queue reads pixels, so a row without `image_orientation` is rebuilt rather than adopted. Ingest writes it from RiftCodex on every run.
- `POST /images/reconcile` re-sends the catalogue scan on its own. Step 12 is the last thing an ingest does, so a run that dies in step 9 takes image hosting with it and nothing revives it until a whole ingest goes green. A stall has no other symptom: nothing breaks, the art just stays upstream, so `POST /ingest` reports `imageCatalogEnqueued` and a failed enqueue logs at error.
- The review queue prune is queue-wide, so it runs only when both observers reported; pruning on one source's findings would delete the other's entries. Entries carry a fingerprint of the observed upstream value, so a dismissal sticks while a genuinely new disagreement resurfaces. Prices are never queued.

## Local development

```bash
# .dev.vars needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; .dev.vars.local pins docker
bun run dev                                  # wrangler dev on :8787
curl http://localhost:8787/                  # reports the host it would write to
curl -X POST http://localhost:8787/ingest
curl -X POST http://localhost:8787/images/reconcile   # re-send the catalogue scan alone
curl "http://localhost:8787/cdn-cgi/mf/scheduled"
wrangler types src/worker-configuration.d.ts --env-interface GeneratedEnv --include-runtime false   # after every wrangler.jsonc change
```

- Run both the API and this worker with the same `--persist-to` directory; the package `dev` scripts use `../../.wrangler/shared`. Miniflare R2 and Queues are per-process otherwise, so an admin upload lands in the API's private bucket and the consumer never sees the object.
- For a live admin-image end-to-end, run the API with `wrangler dev --remote` and do not run this worker locally. Per-binding `remote: true` on `CARD_IMAGES` is not enough; those puts fail with `503` or `put: Unspecified error` from the local proxy. Queues are unsupported in `--remote`, so prefer a real deploy for a full upload, queue, variants check.
- `INGEST_SECRET` is optional and guards `POST /ingest` and `POST /images/reconcile` with a constant-time compare; unset means those routes are unauthenticated. Optional secrets are typed by hand in `src/env.ts` because `wrangler types` only emits what the config declares.

## Adding a file override

Add the entry to the relevant JSON in `src/overrides/`. A new field also needs the interface in `src/overrides/index.ts` and its consumer in `src/pipeline/normalize.ts` or `src/pipeline/enrich.ts`. File overrides are for source-specific ingest fixes; admin-authored card edits go through the admin API, which writes the row and locks the column.

## Two schedules, two halves

The pipeline does not fit in one invocation. A Worker gets 50 subrequests and
running everything costs about 54, so every cron run died at `ingest_catalogue
batch 7/9` — three batches a day stale, and steps 10-12 never reached, which is
why no card art was ever hosted.

- `0 */6 * * *` runs `catalogue`: RiftCodex, the gallery, slugs, the ten upsert
  RPCs, rulings and the image-catalogue enqueue. About 34 subrequests. This is
  the run that must succeed, so it keeps the headroom.
- `40 3 * * *` runs `prices`: TCGPlayer enrichment and reconciliation, written
  through `apply_printing_enrichment` rather than the catalogue. About 41.

`CRON_MODES` in `src/index.ts` maps expression to mode, and
`bun run check:wrangler` fails on a `triggers.crons` entry the map does not
name — otherwise a renamed schedule silently runs catalogue work and prices
stop refreshing with nothing to show for it.

Reconciliation belongs to the `prices` run because its queue prune is
queue-wide: it drops every pending row the run did not re-observe, so syncing
on one source's findings would delete the other's. Only the `prices` run sees
both TCGPlayer and the gallery.

`apply_printing_enrichment` mirrors the lock semantics of `ingest_catalogue`
for the columns it writes. Change one and change the other.
