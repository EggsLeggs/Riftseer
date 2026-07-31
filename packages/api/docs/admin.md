---
title: Admin
sidebar_label: Admin
sidebar_position: 7
---

All admin endpoints are under `/api/v1/admin` and require a valid Supabase
access token whose user UUID appears in the API worker's comma-separated
`ADMIN_USER_IDS` variable.

```http
Authorization: Bearer <access_token>
```

Missing or invalid tokens return `401`. Authenticated users outside the
allowlist return `403` with `ADMIN_REQUIRED`. The Supabase service-role key and
Cloudflare bindings stay inside the API worker.

Every database mutation is immediate and durable: one RPC updates the live
`cards` or `sets` row, writes the corresponding override/manual/deletion record,
and appends `admin_audit_log` in the same transaction.

## Audit log

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/audit-log` | Read admin mutations, newest first |

| Parameter | Type | Notes |
| --- | --- | --- |
| `limit` | string (optional) | Page size, default `50`, clamped to `[1, 200]` |
| `offset` | string (optional) | 0-based offset, default `0` |
| `action` | string (optional) | Exact match, e.g. `card.patch` |
| `target_type` | string (optional) | `card`, `set`, `format`, `card_ruling`, or `reconciliation_entry` |
| `target_id` | string (optional) | Card ID, set code, format code, ruling ID, or review-entry ID |
| `actor_id` | string (optional) | Supabase user UUID |

```json
{
  "entries": [
    {
      "id": 42,
      "actor_id": "…",
      "action": "card.patch",
      "target_type": "card",
      "target_id": "67f4064886be8495f7165dd7",
      "detail": { "name": "Sun Disc" },
      "created_at": "2026-07-30T12:00:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

`detail` holds the submitted payload, so an edit can be traced or reverted by
hand. Entries are ordered by `created_at` then `id`, both descending — mutations
committed in one transaction share a timestamp, so the ID tiebreak is what keeps
paging stable. The log is append-only and has no write endpoint.

## Cards

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/cards` | Create a manual card from `{ id, definition }` |
| `PATCH` | `/cards/:id` | Apply `{ patch, note? }`; names are normalized server-side |
| `DELETE` | `/cards/:id` | Store `{ reason? }` deletion and remove the live row |
| `POST` | `/cards/:id/regenerate-slug` | Regenerate with the shared stable-slug rules |
| `POST` | `/cards/:id/move` | Move to `{ set_code }` |
| `GET` | `/cards/:id/relationships` | Read oracle- and printing-scoped overrides |
| `PUT` | `/cards/:id/relationships` | Replace relationship add/remove overrides |
| `POST` | `/cards/:id/image` | Upload a multipart `file` and optional `accessibility_text` |

Card patches support the editable scalar and nested groups: release/collector,
external IDs, attributes, classification, text, artist, metadata, media
accessibility/orientation, purchase URIs, prices, and token state. Use the
dedicated move, relationship, image, and regenerate-slug routes for those
protected fields.

Relationship overrides are dual-scoped, like legalities. `GET` returns
`oracle_entries` (shared by every printing of the card, including future ones)
and `printing_entries` (exceptions for this printing only). Live relationship
arrays stay on the card payload.

`PUT` takes `{ entries, apply_to_all_printings? }`. Entries have this shape:

```json
{
  "entries": [
    {
      "kind": "related_printings",
      "related_card_id": "card-id",
      "action": "add"
    }
  ],
  "apply_to_all_printings": true
}
```

- **`apply_to_all_printings: true`** (the default) stores oracle-scoped rows and
  clears every per-printing relationship exception in the oracle group, so the
  list genuinely applies to all printings — including ones ingest adds later.
- **`apply_to_all_printings: false`** replaces only this printing's exceptions;
  oracle-scoped rows are left alone. At ingest, printing overrides win over
  oracle ones.

Valid kinds are `all_parts`, `used_by`, `related_champions`,
`related_legends`, `related_signatures`, and `related_printings`. The related
target is always a concrete printing id.

Image uploads accept JPEG, PNG, WebP, AVIF, or GIF up to 20 MB. The API writes a
content-addressed source to the shared `riftseer-cards` R2 bucket, persists an
admin media override, and sends a job to `riftseer-card-images`. A `202`
response includes `queued`; if it is false, the durable source is still picked
up by the next ingest catalogue scan.

## Sets

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/sets` | Create `{ set_code, definition }` as a manual set |
| `PATCH` | `/sets/:setCode` | Apply `{ patch, note? }` durably |
| `DELETE` | `/sets/:setCode` | Delete an empty set with optional `{ reason }` |

Set deletion returns `409 SET_NOT_EMPTY` while any live cards still reference
the set. Set codes are normalized to uppercase.

## Formats

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/formats` | List every format, including retired ones |
| `POST` | `/formats` | Create `{ code, name, sort_order?, active? }` |
| `PUT` | `/formats/order` | Rewrite `sort_order` from `{ codes }` |
| `PATCH` | `/formats/:code` | Apply `{ patch }` — `name`, `sort_order`, `active` |
| `DELETE` | `/formats/:code` | Delete the format and cascade its legality rows |

Codes are accepted in either case and stored lowercase; they must match
`^[a-z0-9][a-z0-9_-]*$`. A code is **immutable** after creation — it is the
public handle API clients use, so `PATCH` cannot change it. Omitting
`sort_order` on create appends the format to the end of the list.

`GET /formats` adds `legality_count` and `override_count` to each row so a UI can
warn before a delete discards stored statuses. `DELETE` reports what it removed:

```json
{ "ok": true, "code": "standard", "legalities_removed": 4, "overrides_removed": 2 }
```

`PUT /formats/order` expects the **complete** ordered list. An unknown code
returns `404 FORMAT_NOT_FOUND` rather than silently reordering a subset, so a
stale client list fails loudly. Set `active: false` to retire a format instead of
deleting it: its statuses are kept and it disappears from `GET /api/v1/formats`
and from card-detail payloads.

## Card legalities

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/cards/:id/legalities` | Read both layers plus the resolved status |
| `PUT` | `/cards/:id/legalities` | Set or clear one format's status |

Legality is stored against the card's `oracle_key`, not the printing, so it is
shared by every printing by default. Read precedence is **printing override →
card-level row → default `legal`**. Only non-legal statuses are stored: a card
with no rows is legal everywhere.

`GET` returns every format with the two layers exposed separately, so an editor
can tell an inherited status from a printing-specific one:

```json
{
  "card_id": "67f4064886be8495f7165dd7",
  "oracle_key": "sun disc",
  "entries": [
    {
      "format_id": "…",
      "format_code": "standard",
      "format_name": "Standard",
      "format_active": true,
      "oracle_status": "banned",
      "printing_status": "legal",
      "effective_status": "legal"
    }
  ]
}
```

`PUT` takes `{ format_code, status, apply_to_all_printings? }`. `status` is
`legal`, `not_legal`, `banned`, or `default`:

- **`default`** deletes the stored row, returning the card to legal.
- **`apply_to_all_printings: true`** writes the card-level row *and* clears every
  per-printing override for that format across the card's printings, so the
  status genuinely applies to all of them. At this level `legal` is stored as a
  deletion, because absence already means legal.
- **`apply_to_all_printings: false`** (the default) writes only this printing's
  override. Here an explicit `legal` **is** meaningful — it exempts one printing
  from a card-wide ban.

## Card rulings and notes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/cards/:id/rulings` | Read the entries visible on this printing |
| `POST` | `/cards/:id/rulings` | Add `{ type, text, dated?, source?, apply_to_all_printings? }` |
| `PATCH` | `/cards/:id/rulings/:rulingId` | Apply `{ patch }` |
| `DELETE` | `/cards/:id/rulings/:rulingId` | Remove an entry |

`type` is `ruling` (an official rules answer) or `note` (editorial).
`apply_to_all_printings` defaults to **true**, because a ruling normally
describes the card rather than one printing. Setting it to `false` scopes the
entry to the printing in the path.

`GET` returns everything visible on this printing, oldest first. Each entry
carries how it got there:

| Field | Meaning |
| --- | --- |
| `scope` | `printing`, `oracle`, or `rule` — which target kind matched |
| `all_printings` | True when shared by every printing of the card |
| `shared` | True when the ruling has several targets or any rule target |
| `target_count` | How many targets the ruling carries in total |

Entries scoped to a *sibling* printing are omitted — they are not visible here
and are edited from that printing.

The ruling routes are nested under the card on purpose. Both `PATCH` and
`DELETE` verify the entry actually applies to the path card and return
`404 RULING_NOT_FOUND` otherwise, so a mistyped card ID cannot reach an
unrelated card's ruling.

A `shared` entry cannot be retargeted from here: `apply_to_all_printings` on a
ruling with several targets returns `409 RULING_IS_SHARED`, because "applies to
every printing" has no single meaning for a ruling covering several cards.
`DELETE` on a shared entry **detaches** it from this card rather than destroying
it, and responds with `detached: true`. Both are managed from the rulings
endpoints below.

## Rulings

Card-independent CRUD. Unlike the per-card routes, these can point one ruling at
several printings at once, or at a search query that keeps matching new cards.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/rulings` | List rulings with their targets (`q`, `kind`, `limit`, `offset`) |
| `POST` | `/rulings/preview` | Evaluate `{ query, limit? }` without storing anything |
| `POST` | `/rulings` | Create `{ type, text, dated?, source?, targets }` |
| `PATCH` | `/rulings/:rulingId` | Apply `{ patch }` |
| `DELETE` | `/rulings/:rulingId` | Delete the ruling and every target it carries |

A **target** is one of:

```jsonc
{ "kind": "oracle",   "oracle_key": "sun disc" }  // every printing of the card
{ "kind": "printing", "card_id": "…" }            // exactly one printing
{ "kind": "query",    "query": "t:unit kw:deathknell" }
```

`targets` **replaces** the whole list, like `PUT /cards/:id/relationships` —
omitting it on a `PATCH` leaves targeting alone. At least one target is required
(`400 RULING_TARGETS_REQUIRED`).

Query targets are parsed by the API with the same parser the search bar uses
(see [`search.md`](./search.md)), and the resulting AST is stored alongside the
source text. A query that fails to parse returns `400 RULING_RULE_INVALID` naming
the offending rule; a query that parses to *nothing* returns
`400 RULING_RULE_EMPTY` rather than being stored, because an empty AST renders as
`true` and would silently attach the ruling to the entire catalogue. Nothing is
written until every rule in the request has parsed.

Query targets are **materialised**: matches are recomputed when the ruling is
saved, for every active rule at the end of each ingest, and for a single card
whenever an admin creates, patches, moves, deletes or re-links it (or confirms a
review entry against it). That last one closes the gap between ingest runs — a
manual card carrying `[Deathknell]` joins a `kw:deathknell` rule immediately
rather than at the next cron. The per-card rematch is advisory: it runs after the
write has committed, so a failure there never fails the edit. That refresh is what
makes a rule cover cards released after it was written. `match_count` on each
query target reports what it currently covers, so a rule that matches nothing is
visible immediately rather than at the next card page load.

`POST /rulings/preview` runs the same parse and the same evaluator without
storing anything, returning `{ query, total, sample }` — it backs the rule
editor's live "matches N cards" readout, and never mutates.

## Ingest review queue

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/reconciliation` | List entries, defaulting to pending |
| `POST` | `/reconciliation/:id/confirm` | Apply the proposal as a durable card override |
| `POST` | `/reconciliation/:id/dismiss` | Close the entry without touching a card |

Two sources observe us, and ingest files what neither can act on:

- **`unmatched_product`** (TCGPlayer) — a product in a mapped group that no card
  claims. Obvious sealed products (boxes, sleeves, playmats) are filtered out.
- **`missing_card`** (gallery) — Riot's official card gallery lists a printing
  we hold no card for. RiftCodex stays authoritative for what exists, so an
  admin creates the card and confirms against it, or dismisses. Nine exist
  today: Unleashed's `T01`–`T08` tokens and Vendetta's Recruit (NX).
- **`field_diff`** (either) — a value disagrees. TCGPlayer proposes
  `collector_number`, `released_at` and `rarity`; the gallery adds `type`,
  `energy`, `might`, `power` and `text`. Names are excluded from both — they are
  stylistic on each side and RiftCodex is authoritative — and **prices are never
  queued**, since they change every run and are applied automatically.
  TCGPlayer is the *only* source that reports a Showcase printing as Showcase:
  RiftCodex and the gallery both give it the base card's rarity, so a rarity
  diff raised against an alternate-art, overnumbered or signature printing is
  usually TCGPlayer being right.

`source` says which upstream raised the entry and therefore which half of
`payload` is populated: `product` for `tcgplayer`, `gallery` for `gallery`. The
gallery covers the numbered sets only, so it never testifies about a promo
printing. Confirming a `text` diff is not supported — the two sources hold the
same rules in different markup, so the compared form is not the stored form.

| Parameter | Type | Notes |
| --- | --- | --- |
| `limit` | string (optional) | Page size, default `50`, clamped to `[1, 200]` |
| `offset` | string (optional) | 0-based offset, default `0` |
| `status` | string (optional) | `pending` (default), `confirmed`, or `dismissed` |
| `kind` | string (optional) | `unmatched_product`, `field_diff`, or `missing_card` |
| `source` | string (optional) | `tcgplayer` or `gallery` |

```json
{
  "entries": [
    {
      "id": "…",
      "kind": "unmatched_product",
      "source": "tcgplayer",
      "fingerprint": "product:652952",
      "status": "pending",
      "payload": {
        "product": {
          "product_id": 652952,
          "name": "Sett Brawler Alternate Art",
          "url": "https://www.tcgplayer.com/product/652952/…",
          "image_url": null,
          "collector_number": "164a",
          "group_id": 24344,
          "set_code": "OGN"
        },
        "card_id": "67f4064886be8495f7165dd7",
        "card_name": "Sett, Brawler"
      },
      "proposed_card_id": "67f4064886be8495f7165dd7",
      "note": null,
      "resolved_by": null,
      "resolved_at": null,
      "created_at": "2026-08-01T00:00:00Z",
      "last_seen_at": "2026-08-01T06:00:00Z"
    }
  ],
  "total": 1,
  "counts": { "pending": 1, "confirmed": 0, "dismissed": 0 },
  "limit": 50,
  "offset": 0
}
```

`counts` covers every status regardless of the filter, so a UI can label its
tabs from one request.

`POST …/confirm` takes optional `{ card_id, note }`. `card_id` overrides
`proposed_card_id` and is **required** when ingest made no suggestion —
otherwise the call returns `400 CARD_REQUIRED`. The API builds the patch and
applies it through the same RPC that backs `PATCH /cards/:id`, so the change is
live immediately and stored in `card_overrides`:

- **`unmatched_product`** → `external_ids.tcgplayer_id` and
  `purchase_uris.tcgplayer`. This is what makes the link persist: the next ingest
  overlays the override, matches the product by ID, and the entry does not
  return.
- **`missing_card`** → `external_ids.riftbound_id` from the gallery payload, so
  later ingests recognise the printing. The admin create form prefills the rest
  from the same payload.
- **`field_diff`** → the single proposed field.

`POST …/dismiss` takes optional `{ note }` and never touches a card. Both are
durable — later ingests refresh only *pending* rows and prune only pending rows,
so a resolved entry is never reopened.

Only pending entries can be resolved; a second call returns
`409 REVIEW_ENTRY_RESOLVED`. An unknown ID returns `404 REVIEW_ENTRY_NOT_FOUND`.

## Errors

Errors always use:

```json
{ "error": "Human-readable message", "code": "MACHINE_CODE" }
```

Expected statuses are `400` (invalid mutation), `401`, `403`, `404`, `409`,
`500`, and `503`. Internal database messages and stack traces are not returned.
