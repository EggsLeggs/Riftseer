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
| `target_type` | string (optional) | `card`, `set`, `format`, or `card_ruling` |
| `target_id` | string (optional) | Card ID, set code, format code, or ruling ID |
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
| `PUT` | `/cards/:id/relationships` | Replace relationship add/remove overrides |
| `POST` | `/cards/:id/image` | Upload a multipart `file` and optional `accessibility_text` |

Card patches support the editable scalar and nested groups: release/collector,
external IDs, attributes, classification, text, artist, metadata, media
accessibility/orientation, purchase URIs, prices, and token state. Use the
dedicated move, relationship, image, and regenerate-slug routes for those
protected fields.

Relationship entries have this shape:

```json
{
  "entries": [
    {
      "kind": "related_printings",
      "related_card_id": "card-id",
      "action": "add"
    }
  ]
}
```

Valid kinds are `all_parts`, `used_by`, `related_champions`,
`related_legends`, `related_signatures`, and `related_printings`.

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

`type` is `ruling` (an official rules answer) or `note` (editorial). Entries are
keyed on the card's `oracle_key`; `apply_to_all_printings` defaults to **true**,
because a ruling normally describes the card rather than one printing. Setting it
to `false` scopes the entry to the printing in the path.

`GET` returns the card-wide entries plus any scoped to this printing, oldest
first, with `card_id: null` marking the card-wide ones. Entries scoped to a
*sibling* printing are omitted — they are not visible here and are edited from
that printing.

The ruling routes are nested under the card on purpose. A ruling belongs to an
oracle group rather than to one printing, so both `PATCH` and `DELETE` verify the
entry is in the path card's group and return `404 RULING_NOT_FOUND` otherwise —
a mistyped card ID cannot reach an unrelated card's ruling.

## Errors

Errors always use:

```json
{ "error": "Human-readable message", "code": "MACHINE_CODE" }
```

Expected statuses are `400` (invalid mutation), `401`, `403`, `404`, `409`,
`500`, and `503`. Internal database messages and stack traces are not returned.
