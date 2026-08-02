---
title: Admin
sidebar_label: Admin
sidebar_position: 7
---

All admin endpoints are under `/api/v1/admin`. They require a valid Supabase
access token whose user UUID appears in the API Worker's comma-separated
`ADMIN_USER_IDS` variable.

```http
Authorization: Bearer <access_token>
```

Missing or invalid tokens return `401`. Authenticated users outside the
allowlist receive `403 ADMIN_REQUIRED`. Service credentials and Cloudflare
bindings never leave the API Worker.

## Persistence model

Admin mutations write the live oracle, printing, or set row and append an audit
entry in the same database transaction. Patched fields are added to that row's
`locked_fields`, which prevents ingest from overwriting the decision.

Manual records are ordinary rows with `source: "manual"`, and ingest does not
prune them. Deletes set `deleted_at`; restore endpoints clear it. There is no
separate override, manual-record, or deletion overlay.

The two card levels remain distinct:

- **Oracle:** rules identity, including name, type, stats, rules text, tags,
  domains, keywords, equipment data, token status, and relationships.
- **Printing:** one physical edition, including set, collector number,
  **rarity**, art, artist, flavour, finishes, marketplace data, and variant
  flags.

A printing delta is different from a lock. It records a genuine rules
difference on one printing, such as adding or removing a tag. It does not mean
that an admin merely corrected a printing-level field.

## Endpoint summary

Paths in the tables below are relative to `/api/v1/admin`.

### Audit and review

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/audit-log` | List mutations, newest first |
| `GET` | `/reconciliation` | List ingest review entries |
| `POST` | `/reconciliation/:id/confirm` | Apply a supported proposal and close it |
| `POST` | `/reconciliation/:id/dismiss` | Close an entry without changing card data |

### Oracles

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/oracles` | Create a manual rules object |
| `PATCH` | `/oracles/:id` | Patch rules fields and lock the submitted keys |
| `DELETE` | `/oracles/:id` | Soft-delete an oracle and all its printings |
| `POST` | `/oracles/:id/restore` | Restore an oracle and its printings |
| `GET` | `/oracles/:id/relationships` | Read outgoing and incoming oracle edges |
| `PUT` | `/oracles/:id/relationships` | Replace all outgoing oracle edges |

### Printings

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/printings` | Add a physical printing to an oracle |
| `PATCH` | `/printings/:id` | Patch printed fields; `set_code` moves sets |
| `DELETE` | `/printings/:id` | Soft-delete one printing |
| `POST` | `/printings/:id/restore` | Restore one printing |
| `POST` | `/printings/:id/regenerate-slug` | Deliberately repin its public slug |
| `GET` | `/printings/:id/deltas` | Read its admin-authored rules delta |
| `PUT` | `/printings/:id/deltas` | Set, replace, or clear that delta |
| `POST` | `/printings/:id/image` | Store an image source and queue variants |
| `GET` | `/printings/:id/legalities` | Read resolved format statuses and scopes |
| `PUT` | `/printings/:id/legalities` | Set or clear a printing- or oracle-level status |
| `GET` | `/printings/:id/rulings` | Read every ruling that reaches the printing |

### Catalogue administration

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/formats` | List active and retired formats |
| `POST` | `/formats` | Create a format |
| `PUT` | `/formats/order` | Replace format order |
| `PATCH` | `/formats/:code` | Patch name, order, or active state |
| `DELETE` | `/formats/:code` | Delete a format and its legality rows |
| `GET` | `/rulings` | List rulings and targets |
| `POST` | `/rulings/preview` | Evaluate a query target without storing it |
| `POST` | `/rulings` | Create a ruling and its targets |
| `PATCH` | `/rulings/:rulingId` | Patch a ruling or replace its targets |
| `DELETE` | `/rulings/:rulingId` | Delete a ruling and all targets |
| `POST` | `/sets` | Create a manual set |
| `PATCH` | `/sets/:setCode` | Patch and lock set fields |
| `DELETE` | `/sets/:setCode` | Soft-delete an empty set |

## Audit log

`GET /audit-log` accepts `limit`, `offset`, `action`, `target_type`,
`target_id`, and `actor_id`. The default page size is 50 and the maximum is
200. `target_type` values reflect the real row being changed: `oracle`,
`printing`, `set`, `format`, `ruling`, or `reconciliation`.

```json
{
  "entries": [
    {
      "id": 42,
      "actor_id": "00000000-0000-0000-0000-0000000000aa",
      "action": "printing.patch",
      "target_type": "printing",
      "target_id": "67f4064886be8495f7165dd7",
      "detail": { "rarity": "Showcase" },
      "created_at": "2026-08-01T12:00:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

Entries are append-only and ordered by `created_at`, then `id`, descending.

## Oracles

Create an oracle with a `definition` containing `name` and any rules fields:

```json
{
  "definition": {
    "name": "Sun Disc",
    "card_type": "Gear",
    "energy": 2,
    "might_bonus": 0,
    "text_rich": "[Equip] ...",
    "tags": ["Relic"],
    "domains": ["Order"]
  }
}
```

Editable oracle fields are `name`, `card_type`, `supertype`, `is_token`,
`energy`, `might`, `power`, `might_bonus`, `equipment_text`, `text_rich`,
`text_plain`, `tags`, `domains`, and `meta_flags`. A patch is wrapped in
`{ "patch": { ... } }`. Omitted keys stay unchanged and explicit `null` clears
nullable values. Name changes also update the normalized lookup key, but never
move the pinned public slug.

Oracle deletion hides the oracle and all its printings. Restoration clears the
soft-delete state and rebuilds the resolved projection.

### Relationships

Relationships are directed oracle-to-oracle edges stored once. The only kinds
are:

| Kind | Direction |
| --- | --- |
| `makes_token` | Producer oracle → token oracle |
| `character` | Legend oracle → champion oracle |
| `signature` | Character oracle → signature-card oracle |

`used_by` is the reverse view of `makes_token`; it is not a fourth stored kind.
There are no printing-scoped relationship exceptions.

`GET /oracles/:id/relationships` returns `{ oracle_id, outgoing, incoming }`.
`PUT` replaces the complete outgoing list:

```json
{
  "entries": [
    {
      "kind": "makes_token",
      "to_oracle_id": "3d8f2da9-9d2b-4a2c-a34d-6f08b54c9571"
    }
  ]
}
```

Self-edges and duplicate kind/target pairs are rejected.

## Printings

Create a printing with a caller-supplied text ID, an existing oracle UUID, a
set code, and physical-card fields:

```json
{
  "id": "67f4064886be8495f7165dd7",
  "oracle_id": "3d8f2da9-9d2b-4a2c-a34d-6f08b54c9571",
  "set_code": "OGN",
  "definition": {
    "collector_number": "042a",
    "rarity": "Showcase",
    "artist": "Jane Doe",
    "is_alternate_art": true,
    "finishes": ["Normal", "Foil"]
  }
}
```

Editable printing fields are `set_code`, `collector_number`, `released_at`,
`rarity`, `flavour_text`, `finishes`, `artist`, `is_signature`,
`is_alternate_art`, `is_overnumbered`, `is_special_collection`,
`tcgplayer_id`, `tcgplayer_url`, and `cardmarket_url`. `set_code` on the normal
patch route replaces the old move endpoint.

Printing slugs are generated on creation and otherwise pinned. Regeneration is
an explicit link-breaking operation. Deletion and restoration affect only the
printing in the path.

### Printing deltas

`GET /printings/:id/deltas` returns `delta: null` when the printing fully
inherits its oracle. Only an admin-authored delta is exposed by this editor.

`PUT` accepts `{ "delta": { ... } }`. Array fields use paired additions and
removals: `tags`, `domains`, `keywords`, and `meta_flags`. Scalar fields use
`*_override`; `cleared_fields` explicitly blanks a scalar because `null` in an
override column means inherit. A null, omitted, or empty delta clears the row.

```json
{
  "delta": {
    "tags_added": ["Elite"],
    "tags_removed": ["Sentinel"],
    "energy_override": 4,
    "cleared_fields": ["power"]
  }
}
```

### Images

Image uploads are multipart requests with a required `file` and optional
`accessibility_text`. JPEG, PNG, WebP, AVIF, and GIF files up to 20 MB are
accepted after content sniffing. The API stores a content-addressed source in
R2, locks that source on the printing, and queues variant generation. A `202`
response reports `queued`; when false, the durable source remains eligible for
the next ingest scan.

## Legalities

Legality precedence is **printing row → oracle row → legal by default**.
`GET /printings/:id/legalities` returns one entry per active format with
`status` and `scope` (`printing`, `oracle`, or `default`).

`PUT /printings/:id/legalities` accepts:

```json
{
  "format_code": "standard",
  "status": "banned",
  "apply_to_all_printings": true
}
```

Statuses are `legal`, `not_legal`, `banned`, or `default`. `default` deletes the
stored row. Without `apply_to_all_printings`, the route writes a printing
exception. With it, the route writes the owning oracle's status and clears all
printing exceptions for that oracle and format. At oracle scope, `legal` is
represented by no row; at printing scope it can be an explicit exception to an
oracle ban.

## Rulings

`GET /printings/:id/rulings` is read-only. It returns rulings that reach the
printing through a printing target, its oracle, or a materialized query rule.
Shared rulings are edited centrally because one ruling can affect many cards.

Central ruling targets use real IDs:

```jsonc
{ "kind": "oracle", "oracle_id": "3d8f2da9-9d2b-4a2c-a34d-6f08b54c9571" }
{ "kind": "printing", "printing_id": "67f4064886be8495f7165dd7" }
{ "kind": "query", "query": "t:unit kw:deathknell" }
```

Create a ruling with `{ type, text, dated?, source?, targets }`. `type` is
`ruling` or `note`. On patch, `targets` replaces the whole target list; omitting
it preserves the current targets. At least one target is required.

Query targets use the same parser and SQL evaluator as card search. Invalid or
empty queries are rejected before any write. `POST /rulings/preview` evaluates
`{ query, limit? }` without storing it. Saved query targets are materialized
when the ruling changes, after ingest, and inside card mutations that can change
whether a printing matches.

## Formats

Format codes are normalized to lowercase and are immutable after creation.
Create with `{ code, name, sort_order?, active? }`; patch with
`{ "patch": { "name"?, "sort_order"?, "active"? } }`.

`PUT /formats/order` takes the complete ordered code list as `{ "codes": [] }`.
Unknown codes are rejected. Deleting a format cascades its oracle and printing
legality rows and reports their counts. Retiring with `active: false` preserves
those rows while removing the format from public active-format responses.

## Sets

Create a manual set with `{ set_code, definition }`. Patch with
`{ "patch": { ... } }`; submitted fields are locked against ingest. Set codes
are normalized to uppercase. A set can only be soft-deleted after every
printing has been moved or deleted.

## Reconciliation queue

`GET /reconciliation` accepts `limit`, `offset`, `status`, `kind`, and `source`.
It defaults to pending entries. Kinds are:

| Kind | Meaning |
| --- | --- |
| `unmatched_product` | A TCGPlayer product is not linked to a printing |
| `field_diff` | TCGPlayer or the gallery disagrees with a stored field |
| `missing_printing` | The gallery reports a physical printing not present locally |
| `unmatched_oracle` | A new printing cannot be assigned safely to a rules object |

Prices are never review proposals. Confirmable printing fields are collector
number, release date, and rarity. Confirmable oracle fields are card type,
energy, might, and power. Rules-text disagreements require a manual edit and
dismissal because the observed markup is not the stored representation.

`POST /reconciliation/:id/confirm` accepts optional `printing_id`, `oracle_id`,
and `note`, using the proposed IDs when omitted. Confirming a supported field
applies the normal patch path, so the field becomes locked. Confirming an
unmatched product locks its TCGPlayer ID and URL on the printing. Missing-row
entries carry no patch: create the oracle or printing first, then confirm to
record the reviewed gap. `dismiss` accepts an optional note and never changes
card data.

Only pending entries can be resolved. Confirmed and dismissed fingerprints stay
closed; a genuinely changed upstream observation receives a new fingerprint.

## Errors

Errors use a stable envelope:

```json
{ "error": "Human-readable message", "code": "MACHINE_CODE" }
```

Expected statuses are `400`, `401`, `403`, `404`, `409`, `500`, and `503`.
Database messages and stack traces are not returned.
