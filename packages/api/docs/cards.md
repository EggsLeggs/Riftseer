---
title: Cards
sidebar_label: Cards
sidebar_position: 4
---

All card endpoints are under `/api/v1/cards`. For full request/response schemas, try them interactively in [Swagger](https://riftseerapi-production.up.railway.app/api/swagger#tag/cards).

---

## Endpoints at a glance

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/cards` | Search / browse — see [Search](./search.md) |
| `GET` | `/api/v1/cards/random` | Random card |
| `GET` | `/api/v1/cards/:id` | Single card by UUID |
| `GET` | `/api/v1/cards/:id/text` | Plain-text card summary |
| `POST` | `/api/v1/resolve` | Batch resolve card name strings |
| `GET` | `/api/v1/prices/tcgplayer` | TCGPlayer USD prices by card name |
| `GET` | `/api/v1/sets` | All sets with card counts |

---

## Card object

Every card endpoint returns the same card shape. Key fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID) | Stable identifier — safe to store |
| `name` | string | Display name |
| `name_normalized` | string | Lowercased, punctuation-stripped — used for search |
| `collector_number` | string | e.g. `OGN-001` |
| `set.set_code` | string | Short code, e.g. `OGN` |
| `attributes` | object | `energy`, `might`, `power` |
| `classification` | object | `type`, `supertype`, `rarity`, `tags`, `domains` |
| `text.plain` | string | Rules text, punctuation intact |
| `text.rich` | string | Rules text with inline symbol tokens |
| `is_token` | boolean | `true` for token cards |
| `all_parts` | array | Related tokens or meld parts |
| `related_champions` | array | Champions linked to this legend |
| `related_legends` | array | Legends linked to this champion |

Full schema in [Swagger](https://riftseerapi-production.up.railway.app/api/swagger#tag/cards).

---

## GET /api/v1/cards/random

Returns one card chosen at random from the full index. No parameters.

```
GET /api/v1/cards/random
```

---

## GET /api/v1/cards/:id

Fetch a single card by its stable UUID.

```
GET /api/v1/cards/123e4567-e89b-12d3-a456-426614174000
```

Returns 404 if no card with that ID exists.

---

## GET /api/v1/cards/:id/text

Returns a plain-text `text/plain` summary — name, type line, then rules text — suitable for copy-pasting into chat or a deck note.

```
GET /api/v1/cards/123e4567-e89b-12d3-a456-426614174000/text
```

Example output:

```
Sun Disc
Gear

Equipped Champion gains +2 Power and +2 Might.
```

---

## POST /api/v1/resolve

Batch-resolves up to 20 card name strings. Used by the Discord and Reddit bots for `[[Card Name]]` triggers; also useful for any client that needs to go from human-readable names to card objects in one round-trip.

```json
POST /api/v1/resolve
{
  "requests": ["Sun Disc", "Stalwart Poro", "[[Bard|OGN-001]]"]
}
```

Each entry in `results` has:

| Field | Type | Notes |
|---|---|---|
| `request` | object | The parsed request (`name`, `set`, `collector`) |
| `card` | Card \| null | Matched card, or `null` if not found |
| `matchType` | string | `"exact"`, `"fuzzy"`, or `"not-found"` |
| `score` | number? | Fuse.js score for fuzzy hits |

Requests accept plain names or `[[Name|SET-###]]` format — the same syntax the bots parse from messages.

---

## GET /api/v1/prices/tcgplayer

Returns USD market and low prices for a card by name, sourced from tcgcsv.com (cached for 1 hour).

```
GET /api/v1/prices/tcgplayer?name=Sun+Disc
```

Response:

```json
{
  "usdMarket": 1.25,
  "usdLow": 0.80,
  "url": "https://www.tcgplayer.com/..."
}
```

All fields are nullable — if a card has no TCGPlayer listing, all three return `null`.

---

## GET /api/v1/sets

Returns all known sets with a card count for each.

```
GET /api/v1/sets
```

Response:

```json
{
  "count": 3,
  "sets": [
    { "setCode": "OGN", "setName": "Origins", "cardCount": 250 }
  ]
}
```

To browse all cards in a set, use `GET /api/v1/cards?set=OGN` — see [Search](./search.md).
