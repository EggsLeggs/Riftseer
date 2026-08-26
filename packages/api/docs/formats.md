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
  "count": 1,
  "formats": [
    {
      "object": "format",
      "id": "6f2a…",
      "code": "standard",
      "name": "Standard",
      "sort_order": 0,
      "active": true,
      "zone_rules": [
        { "zone": "legend", "min_count": 1, "max_count": 1, "copy_limit": null },
        { "zone": "main", "min_count": 40, "max_count": 40, "copy_limit": 3 },
        { "zone": "sideboard", "min_count": null, "max_count": 10, "copy_limit": 3 },
        { "zone": "runes", "min_count": 12, "max_count": 12, "copy_limit": null },
        { "zone": "battlefields", "min_count": 3, "max_count": 3, "copy_limit": 1 }
      ],
      "severity_overrides": {}
    }
  ]
}
```

`code` is the stable lowercase handle to key against — it never changes once a
format is created. `sort_order` is the intended display order (ascending); the
response is already sorted, so clients can render it as-is.

### Rules

`zone_rules` and `severity_overrides` are everything the format asserts about
deck construction, and they are public because **validation is not always the
API's to do**: a signed-out builder holds its deck in the browser, never posts
it, and runs the same `validateDeck` a saved deck gets on the server.

A `null` bound is unconstrained, an absent zone constrains nothing, and a format
with `zone_rules: []` constrains nothing at all. `copy_limit` counts copies of
one *oracle* across the zone's whole counting group — `legend`/`main`/
`sideboard` share one, `runes` and `battlefields` each have their own, and
`considering` is a scratch list counted by nothing.

`severity_overrides` are per-format departures from the default status→severity
mapping (`restricted` warns, `not_legal` and `banned` error). A status absent
from the object falls through to that default, so `{}` is the normal answer.

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
      "scope": "oracle",
      "note": "Banned in the 2026-07 update."
    }
  ]
}
```

Statuses are `legal`, `restricted`, `not_legal` and `banned` — the same set deck
validation uses. `note` is the admin's explanation and comes from whichever row
decided the status, so it is absent on a `default` entry.

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
