# packages/ingest-worker — Context for Claude

Cloudflare Worker that runs the card ingest on a schedule or via `POST /ingest`. RiftCodex is authoritative for cards and sets; TCGPlayer and Riot's official gallery only enrich or observe. It has **no connection to the API worker**.

## Source layout

```
src/
├── index.ts              CF Worker entry — scheduled, POST /ingest, queue consumer
├── ingest.ts             runIngest() orchestrator; Env type
├── supabase.ts           service-role client factory
├── utils.ts              logger + normalizeCardName (local copy — see below)
├── sources/
│   ├── riftcodex.ts          /sets + paginated /cards; raw → IngestPrinting
│   ├── riftbound-gallery.ts  Riot's official gallery — equipment + coverage
│   └── tcgcsv.ts             TCGPlayer groups, products, prices
├── pipeline/
│   ├── normalize.ts      normalizeSets / normalizePrintings + file overrides
│   ├── dedup.ts          collapse genuine duplicate RiftCodex printings
│   ├── oracles.ts        buildOracles() — group printings, emit deltas
│   ├── enrich.ts         TCGPlayer group matching, products, prices
│   ├── gallery.ts        official-gallery index + equipment
│   ├── link.ts           linkOracles() — oracle→oracle edges
│   ├── durable.ts        reads the two locks ingest must know about
│   ├── reconcile.ts      review queue
│   ├── db.ts             ingestCatalogue() — the ingest_catalogue RPC
│   └── retry.ts          opaque-failure retry for RPCs
├── images/               source selection, hashing, queue producer + consumer
└── overrides/            static JSON fixes (set names, TCGPlayer groups)
```

## Pipeline flow

```
fetchAllSets + fetchAllPages
  → normalizeSets / normalizePrintings → collapseDuplicates
  → TCGPlayer: fetchGroups → matchTcgGroupsToSets → fetchAllGroupResults → enrichPrintings
  → gallery: fetchGalleryCards → applyGalleryEquipment
  → buildOracles  (printings → oracles + printing deltas + divergence report)
  → linkOracles   (oracle → oracle edges)
  → loadDurablePrintings (seed admin-locked values back onto in-memory printings)
  → preparePrintingImageJobs
  → ingestCatalogue  (bounded batches, then a final prune call)
  → refreshRulingRuleMatches
  → reconciliation queue → enqueue image catalogue scan
```

TCGPlayer and gallery steps are each wrapped in their own try/catch: a failure is logged and the run continues on RiftCodex-only data. Neither source ever creates a set or a card.

## Why things are the way they are

- **`utils.ts` duplicates `normalizeCardName`** from `@riftseer/types` on purpose. `@riftseer/core` pulls in ioredis and Node built-ins that Cloudflare Workers cannot load. Never import `@riftseer/core` here.
- **Printing ids are `text`** — 24-char MongoDB ObjectIds from RiftCodex, not UUIDs.
- **There is no override overlay.** Admin edits live on the row they edit, protected by `locked_fields`, which the ingest RPC honours per column. `pipeline/durable.ts` exists only because ingest must *read* two of those locks before it runs: a confirmed `tcgplayer_id` (RiftCodex does not know it, and without seeding it back the enricher cannot match the product, so the printing stays priceless and the reconciler re-files the entry the admin just resolved) and an admin `image` (whose bytes may not be transcoded yet).
- **`ingest_catalogue` is called in bounded batches with pruning disabled**, then once more with the complete valid-id list and pruning on. A failed batch therefore leaves stale rows rather than deleting a catalogue it only half wrote, and the run is safely re-runnable. `INGEST_RPC_CARD_BATCH_SIZE` is 150 rather than 300 because 300 cards (~700 KiB) drew repeated opaque `internal error`s — half the work held open per transaction is half the window a dropped connection can land in.
- **Ingest RPCs retry opaque failures** (`pipeline/retry.ts`). Supabase intermittently answers a valid upsert with `internal error; reference = …` — a dropped connection, not a bad payload: two consecutive runs failed on *different* batches of identical data. Four attempts, 750ms/1.5s/3s. Only opaque failures qualify (`internal error`, `fetch failed`, timeouts, delimited 502/503/504); a constraint violation is deterministic and surfaces immediately.
- **`jsonb_to_recordset` maps by column name**, so a key sent under the wrong name does not error — the column arrives NULL and the field is silently dropped. Verify payload changes with a round trip that reads the rows back, not by reading the SQL.
- **Ingest writes no `meta_flags`.** That `is:` vocabulary is admin-authored; an admin edit locks the column, so ingest sending `[]` cannot clobber it.
- **One TCGPlayer product is applied to at most one printing.** Matching runs per collector-number candidate, most specific first (`113a` before `113`), and each candidate tries number+name then number alone — the latter guarded by `namesAgreeAllowingVariantSuffix`, because TCGPlayer marks variants in the *name* ("Ambessa The Wolf Alternate Art") while Vendetta's RiftCodex names both printings identically and marks the variant on the *number*. Doing the exact-name lookups first, or the bare number first, put alternate art on its base printing's product — publishing the wrong price and filing a rarity disagreement no admin could resolve. Contention is resolved per product: strongest tier, then least-variant printing, then lowest id; losers also **shed the contested `tcgplayer_id`**, so the reconciler never compares a printing against a product describing another.
- **Champion ↔ legend linking joins on the *character* tag**, never on any shared tag. A champion carries its region and species too — Poppy - Paragon is tagged `Yordle`, `Demacia`, `Poppy` — and RiftCodex puts a species tag on some legends the printed card does not carry: Heart of the Tempest reads `LEGEND | KENNEN` but arrives tagged `Yordle, Kennen`, which used to link every Yordle champion to Kennen. `characterTags()` intersects a card's tags with the character half of its own name (before the ` - ` or `, ` epithet separator — Origins–Unleashed use one, Vendetta the other). Matching the character half rather than the whole name matters: `Nidalee - Cat Form` and `Lillia - Fae Fawn` would otherwise claim `Cat` and `Fae` out of their epithets.
- **Relationships are oracle → oracle, written once.** `makes_token`, `character`, `signature`. The reverse of each is a query, not a second row, and there is no `related_printings` — siblings are `printings WHERE oracle_id = …`.
- **The official gallery** supplies the `[Equip]` section RiftCodex has no field for, and nothing else. `mightBonus` is the discriminator for "this is equipment": all 40 equipment cards have it and nothing else does, while one Spell carries a stray `effect` that keying off `effect` would publish as rules text. `0` is a real bonus — test presence, never truthiness. Gallery ids spell signatures `ogn-305-star-298` where RiftCodex writes `ogn-305*-298`; `normalizeGalleryId` folds them, without which 36 printings read as missing on every run.
- **`collector_number` prefixes.** RiftCodex types it as an integer, dropping the letter prefix that `T03` tokens, `SP3` special collections and `R01` runes print. `printedCollectorNumber()` restores it from the `riftbound_id` collector segment, and only when a prefix is actually present — the id zero-pads plain numbers (`ogn-042a-298`) where the card and every existing slug do not.
- **Slugs are pinned.** Oracle and printing slugs are computed here from `@riftseer/types/slug` and the RPC `coalesce`s on conflict, so a value persisted on first insert is never overwritten and public URLs stay stable. The derivation is pure, so a rebuild from the same upstream data regenerates identical slugs.
- **`keywords` is not sent.** A database trigger derives it from the oracle's rules text on every write, keeping ingest, admin patches and manual creation in sync without three call sites.
- **Image idempotency lives in `image_source_hash`.** An unchanged hash keeps the existing R2 objects; a changed hash queues new variants. Hosted URLs are *derived* from the printing id by `@riftseer/types/card-image` — the database stores only the hash and `image_hosted_at` — and public URLs carry `?v=<hash>` so a corrected image bypasses immutable caches.
- **The review queue prune is queue-wide**, so it runs only when *both* observers reported; pruning on one source's findings would delete the other's entries. Entries carry a fingerprint encoding the observed upstream value, so a dismissal sticks while a genuinely new disagreement resurfaces. Prices are never queued.

## Local development

```bash
# packages/ingest-worker/.dev.vars needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
bun run dev                                  # wrangler dev on :8787
curl -X POST http://localhost:8787/ingest
curl "http://localhost:8787/cdn-cgi/mf/scheduled"
```

Run **both** the API and this worker with the same `--persist-to` directory (the package `dev` scripts use `../../.wrangler/shared`). Miniflare R2 and Queues are per-process otherwise: an admin upload would land in the API's private bucket, the consumer would never see the object, and fetching `img.riftseer.com` would 404.

For a live admin-image end-to-end, run the API with `wrangler dev --remote` and do not run the local ingest worker. Per-binding `remote: true` on `CARD_IMAGES` is not enough — those puts fail with `503` / `put: Unspecified error` from the local proxy. Queues are unsupported in `--remote`, so an upload may land with `queued: false` and wait for the next production catalogue scan; prefer a real deploy for a full upload → queue → variants check.

Regenerate binding types after every `wrangler.jsonc` change:

```bash
wrangler types src/worker-configuration.d.ts --env-interface GeneratedEnv --include-runtime false
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Required |
| `RIFTCODEX_BASE_URL` | Default `https://api.riftcodex.com` |
| `RIFTCODEX_API_KEY` | Optional |
| `RIFTBOUND_GALLERY_BASE_URL` | Default `https://content.publishing.riotgames.com` |
| `UPSTREAM_TIMEOUT_MS` | HTTP timeout, default 30000 |
| `INGEST_SECRET` | Bearer token protecting `POST /ingest` (optional) |
| `CARD_IMAGE_BASE_URL` | Public R2 domain, default `https://img.riftseer.com` |
| `CARD_IMAGES` / `CARD_IMAGE_QUEUE` / `IMAGES` | R2, Queue and Cloudflare Images bindings |

## Adding a file override

Add the entry to the relevant JSON in `src/overrides/`; if a new field is needed, update the interface in `src/overrides/index.ts` and the consumer in `pipeline/normalize.ts` or `pipeline/enrich.ts`. File overrides are for source-specific ingest fixes. Admin-authored card edits go through the admin API instead — they write the row and lock the column, and ingest honours that automatically.
