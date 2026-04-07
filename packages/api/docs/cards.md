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
| `GET` | `/api/v1/cards/:id` | Single card by card ID |
| `GET` | `/api/v1/cards/:id/text` | Plain-text card summary |
| `POST` | `/api/v1/cards/resolve` | Batch resolve card name strings |

---

## Card object

Every card endpoint returns the same card shape. Key fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable identifier (RiftCodex ObjectId) — safe to store |
| `name` | string | Display name |
| `name_normalized` | string | Lowercased, punctuation-stripped — used for search |
| `collector_number` | string | e.g. `OGN-001` |
| `set.set_code` | string | Short code, e.g. `OGN` |
| `set.card_count` | number \| undefined | Total cards in this set |
| `attributes` | object | `energy`, `might`, `power` |
| `classification` | object | `type`, `supertype`, `rarity`, `tags`, `domains` |
| `text.plain` | string | Rules text, punctuation intact |
| `text.rich` | string | Rules text with inline symbol tokens |
| `prices` | object \| undefined | Opt-in — omitted by default; see [Prices](#prices) section |
| `purchase_uris` | object | Marketplace purchase URLs (`tcgplayer`, `cardmarket`) when available |
| `is_token` | boolean | `true` for token cards |
| `all_parts` | array | Related tokens or meld parts |
| `related_champions` | array | Champions linked to this legend |
| `related_legends` | array | Legends linked to this champion |
| `related_printings` | array | Array of `RelatedCard` objects — other printings/editions (alternate art, promos, etc.) of the same card |

---

## GET /api/v1/cards/random

Returns one card chosen at random from the full index.

| Parameter | Type | Notes |
| --- | --- | --- |
| `include` | string (optional) | Pass `prices` to include price data; omitted by default (no prices returned) |

```http
GET /api/v1/cards/random
GET /api/v1/cards/random?include=prices
```

---

## GET /api/v1/cards/:id

Fetch a single card by its stable card ID.

| Parameter | Type | Notes |
| --- | --- | --- |
| `include` | string (optional) | Pass `prices` to include price data; omitted by default (no prices returned) |

```http
GET /api/v1/cards/67f4064886be8495f7165dd7
GET /api/v1/cards/67f4064886be8495f7165dd7?include=prices
```

Returns 404 if no card with that ID exists.

---

## GET /api/v1/cards/:id/text

Returns a plain-text `text/plain` summary — name, type line, then rules text — suitable for copy-pasting into chat or a deck note.

```http
GET /api/v1/cards/67f4064886be8495f7165dd7/text
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
  "requests": ["Sun Disc", "Stalwart Poro", "[[Bard|OGN-001]]"],
  "include": "prices"
}
```

Pass `"include": "prices"` in the request body to include price data on resolved cards. Omit it (or pass any other value) to exclude prices.

Each entry in `results` has:

| Field | Type | Notes |
| --- | --- | --- |
| `request` | object | The parsed request (`name`, `set`, `collector`) |
| `card` | Card \| null | Matched card, or `null` if not found |
| `matchType` | string | `"exact"`, `"fuzzy"`, or `"not-found"` |

Requests accept plain names or `[[Name|SET-###]]` format — the same syntax the bots parse from messages.

---

## Prices

Prices are **opt-in** — the `prices` field is omitted by default. Pass `?include=prices` (or `"include": "prices"` for the resolve endpoint) to receive price data. `purchase_uris` is always included when available.

Price data is populated by the ingest pipeline from TCGPlayer via tcgcsv.com and stored in Supabase.

```json
{
  "prices": {
    "tcgplayer": {
      "normal": 1.25,
      "foil": 4.99,
      "low_normal": 1.1,
      "low_foil": null
    },
    "cardmarket": {
      "normal": null,
      "foil": null,
      "low_normal": null,
      "low_foil": null
    }
  },
  "purchase_uris": {
    "tcgplayer": "https://www.tcgplayer.com/...",
    "cardmarket": "https://www.cardmarket.com/..."
  }
}
```

All nested price fields are nullable. If a card has no listing for a given provider, those provider fields remain `null`.
