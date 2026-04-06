---
title: Cards
sidebar_label: Cards
sidebar_position: 4
---

Card endpoints live under `/api/v1/cards`.

---

## Endpoints at a glance

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/cards` | Search / browse — see [Search](./search.md) |
| `GET` | `/api/v1/cards/random` | Random card |
| `GET` | `/api/v1/cards/:id` | Single card by UUID |
| `GET` | `/api/v1/cards/:id/text` | Plain-text card summary |
| `POST` | `/api/v1/cards/resolve` | Batch resolve card name strings |

---

## Card object

Every card endpoint returns the same card shape. Key fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string (UUID) | Stable identifier — safe to store |
| `name` | string | Display name |
| `name_normalized` | string | Lowercased, punctuation-stripped — used for search |
| `collector_number` | string | e.g. `OGN-001` |
| `set.set_code` | string | Short code, e.g. `OGN` |
| `attributes` | object | `energy`, `might`, `power` |
| `classification` | object | `type`, `supertype`, `rarity`, `tags`, `domains` |
| `text.plain` | string | Rules text, punctuation intact |
| `text.rich` | string | Rules text with inline symbol tokens |
| `prices` | object | `usdMarket`, `usdLow`, `usdFoilMarket`, `usdFoilLow` — populated by the ingest pipeline from TCGPlayer |
| `purchase_uris` | object | `tcgplayer` URL for direct purchase |
| `is_token` | boolean | `true` for token cards |
| `all_parts` | array | Related tokens or meld parts |
| `related_champions` | array | Champions linked to this legend |
| `related_legends` | array | Legends linked to this champion |

---

## GET /api/v1/cards/random

Returns one card chosen at random from the full index. No parameters.

```http
GET /api/v1/cards/random
```

---

## GET /api/v1/cards/:id

Fetch a single card by its stable UUID.

```http
GET /api/v1/cards/123e4567-e89b-12d3-a456-426614174000
```

Returns 404 if no card with that ID exists.

---

## GET /api/v1/cards/:id/text

Returns a plain-text `text/plain` summary — name, type line, then rules text — suitable for copy-pasting into chat or a deck note.

```http
GET /api/v1/cards/123e4567-e89b-12d3-a456-426614174000/text
```

Example output:

```text
Sun Disc
Gear

Equipped Champion gains +2 Power and +2 Might.
```

---

## POST /api/v1/cards/resolve

Batch-resolves up to 20 card name strings. Used by the Discord and Reddit bots for `[[Card Name]]` triggers; also useful for any client that needs to go from human-readable names to card objects in one round-trip.

```json
POST /api/v1/cards/resolve
{
  "requests": ["Sun Disc", "Stalwart Poro", "[[Bard|OGN-001]]"]
}
```

Each entry in `results` has:

| Field | Type | Notes |
| --- | --- | --- |
| `request` | object | The parsed request (`name`, `set`, `collector`) |
| `card` | Card \| null | Matched card, or `null` if not found |
| `matchType` | string | `"exact"`, `"fuzzy"`, or `"not-found"` |

Requests accept plain names or `[[Name|SET-###]]` format — the same syntax the bots parse from messages.

---

## Prices

Prices (`usdMarket`, `usdLow`, `usdFoilMarket`, `usdFoilLow`) and the `purchase_uris.tcgplayer` URL are embedded directly on the card object. They are populated during the ingest pipeline from TCGPlayer via tcgcsv.com and stored in Supabase — no separate price endpoint is needed.

All price fields are nullable. If a card has no TCGPlayer listing the fields will be `null`.
