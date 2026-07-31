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
| `target_type` | string (optional) | `card` or `set` |
| `target_id` | string (optional) | Card ID or set code |
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

## Errors

Errors always use:

```json
{ "error": "Human-readable message", "code": "MACHINE_CODE" }
```

Expected statuses are `400` (invalid mutation), `401`, `403`, `404`, `409`,
`500`, and `503`. Internal database messages and stack traces are not returned.
