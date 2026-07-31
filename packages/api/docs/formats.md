---
title: Formats
sidebar_label: Formats
sidebar_position: 8
---

Play formats are the columns of a card's legality table. They are admin-managed
and system-wide — see [Admin](./admin.md) for the write endpoints.

---

## Endpoints at a glance

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/formats` | List the active formats in display order |

---

## GET /api/v1/formats

```http
GET /api/v1/formats
```

Response:

```json
{
  "count": 2,
  "formats": [
    {
      "object": "format",
      "id": "6f2a…",
      "code": "standard",
      "name": "Standard",
      "sort_order": 0,
      "active": true
    }
  ]
}
```

`code` is the stable lowercase handle to key against — it never changes once a
format is created. `sort_order` is the intended display order (ascending); the
response is already sorted, so clients can render it as-is.

Retired formats (`active: false`) are omitted here and from card payloads, but
their stored statuses are kept — reactivating a format brings its legalities
back. Admins see retired formats via `GET /api/v1/admin/formats`.

An empty list means no formats are available — either none are configured, or
the read failed and the route degraded to `200` with `formats: []` rather than
`500`. Either way card pages have no legality table to show.

---

## Legalities

Legality lives on the card, not here. Every card-detail response carries one
`legalities` entry per format listed above, already resolved:

```http
GET /api/v1/cards/detail?slug=ogn/21/sun-disc
```

```json
{
  "legalities": [
    {
      "object": "card_legality",
      "format_id": "6f2a…",
      "format_code": "standard",
      "format_name": "Standard",
      "status": "banned",
      "scope": "oracle"
    }
  ]
}
```

**Absence of a stored status means legal.** Only non-legal statuses are
persisted, so a format with nothing recorded still appears with
`status: "legal"` and `scope: "default"`.

Statuses are keyed on the card's `oracle_key`, so they are shared by every
printing by default. A single printing can carry an exception — `scope` reports
which layer decided the value:

| `scope` | Meaning |
| --- | --- |
| `printing` | This printing overrides the card-wide value |
| `oracle` | Shared by every printing of the card |
| `default` | Nothing stored — legal |

See [Cards](./cards.md#get-apiv1cardsdetail) for the rest of the card-detail
payload, and [Card Types](../types/card-types) for the `Format` and
`CardLegality` type definitions.
