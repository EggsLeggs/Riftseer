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
| `GET` | `/api/v1/cards/detail` | Full card page payload — card plus expanded printings, tokens and related cards |
| `GET` | `/api/v1/cards/:id` | Single card by card ID |
| `GET` | `/api/v1/cards/:id/text` | Plain-text card summary |
| `GET` | `/api/v1/cards/by-slug/*` | Single card by `public_slug` (set / collector / name path) |
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
| `oracle_key` | string \| undefined | Name-derived key shared by every printing of this card. Rulings and format legalities are keyed on it, not on `id` |
| `attributes` | object | `energy`, `might`, `power` |
| `classification` | object | `type`, `supertype`, `rarity`, `tags`, `domains` |
| `text.plain` | string | Rules text, punctuation intact |
| `text.rich` | string | Rules text with inline symbol tokens |
| `media` | object \| undefined | Hosted image URLs (`small`, `normal`, `large`, `original`), detected orientation, upstream `source_url`, `source_hash`, and source provider. Hosted URLs use the R2 custom domain after queue processing. |
| `prices` | object \| undefined | Opt-in — omitted by default; see [Prices](#prices) section |
| `purchase_uris` | object | Marketplace purchase URLs (`tcgplayer`, `cardmarket`) when available |
| `is_token` | boolean | `true` for token cards |
| `source` | string \| undefined | Row provenance: `riftcodex` for ingested cards, `manual` for admin-authored cards |
| `all_parts` | array | Related tokens or meld parts |
| `related_champions` | array | Champions linked to this legend (also the legend/champion a signature card belongs to) |
| `related_legends` | array | Legends linked to this champion (also the legend a signature card belongs to) |
| `related_signatures` | array | Signature cards (supertype `Signature`, e.g. "Daisy!") tied to this legend/champion by a shared character tag |
| `related_printings` | array | Array of `RelatedCard` objects — other printings/editions (alternate art, promos, etc.) of the same card |
| `public_slug` | string \| undefined | Stable public URL path for this printing — e.g. `ogn/12a/signature/sun-disc`. Persisted on first ingest and never overwritten, so URLs do not drift. |
| `riftseer_uri` | string \| undefined | Absolute public site URL — `${SITE_ORIGIN}/card/${public_slug}`. Computed at response time and also added to every entry in the related-card arrays. Use this instead of building URLs client-side. |

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

## GET /api/v1/cards/detail

Everything the public card page needs in one request. The card's related-card
stubs are expanded into full rows, then sorted and deduplicated server-side, so
clients never have to fan out into per-related-card lookups.

Look up by `id` **or** `slug` — exactly one is required.

| Parameter | Type | Notes |
| --- | --- | --- |
| `id` | string (optional) | Card ID. Mutually exclusive with `slug` |
| `slug` | string (optional) | `public_slug` path, e.g. `ogn/12a/signature/sun-disc`. Mutually exclusive with `id` |
| `include` | string (optional) | Pass `prices` to include price data on the card **and** on every printing |

```http
GET /api/v1/cards/detail?id=67f4064886be8495f7165dd7
GET /api/v1/cards/detail?slug=ogn/21/sun-disc&include=prices
```

Response:

| Field | Type | Notes |
| --- | --- | --- |
| `object` | `"card_detail"` | |
| `card` | Card | The requested printing, same shape as `/cards/:id` |
| `printings` | CardPrintingSummary[] | All printings **including** the current one, oldest set first. The current row has `is_current: true` |
| `tokens` | CardPrintingSummary[] | Token cards this card creates (from `all_parts`) |
| `used_by` | CardPrintingSummary[] | Cards that create this token — one preferred printing per card |
| `champions` | CardPrintingSummary[] | Champions sharing a tag with this legend, collapsed to one row per character |
| `legends` | CardPrintingSummary[] | Legends sharing a tag with this champion, collapsed to one row per character |
| `signatures` | CardPrintingSummary[] | Signature cards tied to this legend/champion by a shared character tag, collapsed to one row per signature |
| `purchase` | object | Resolved `tcgplayer` / `cardmarket` links — the stored purchase URI when trusted, else the product page, else a name search |
| `rulings` | CardRuling[] | Rulings and notes visible on this printing — the card-wide entries plus any scoped to this printing, oldest first |
| `legalities` | CardLegality[] | One entry per active format, in format order, already resolved |

`rulings` and `legalities` are keyed on the card's `oracle_key`, so they are
shared by every printing unless an entry is scoped to one. Both are
supplementary: if the lookup fails they come back empty and the rest of the
payload is unaffected.

Each `CardRuling` is `{ object, id, type, text, dated?, source?, card_id? }`,
where `type` is `ruling` or `note` and `card_id` is present only on entries
scoped to this printing.

Each `CardLegality` is
`{ object, format_id, format_code, format_name, status, scope, updated_at? }`.
`status` is `legal`, `not_legal`, or `banned`; **absence of a stored status means
legal**, so every active format appears here even when nothing is recorded.
`scope` says which layer decided the status — `printing` (this printing's
override), `oracle` (shared by the card), or `default` (nothing stored). Formats
themselves are listed by [`GET /api/v1/formats`](./formats).

Each `CardPrintingSummary` carries just enough to render a row and link to it:

| Field | Type | Notes |
| --- | --- | --- |
| `object` | `"card_printing"` | |
| `id`, `name` | string | |
| `public_slug`, `riftseer_uri` | string \| undefined | Link targets |
| `set_code`, `set_name` | string \| undefined | |
| `collector_number` | string \| undefined | Raw value |
| `collector_label` | string \| undefined | With variant marker — `12a` for alternate art, `21★` for signature |
| `rarity`, `type` | string \| undefined | |
| `energy`, `power` | number \| null \| undefined | Play cost from `attributes` |
| `is_token` | boolean | |
| `alternate_art`, `signature` | boolean \| undefined | |
| `image_small` | string \| undefined | Smallest available art URL |
| `prices`, `purchase_uris` | object \| undefined | `prices` requires `include=prices` |
| `is_current` | boolean \| undefined | Only present (and `true`) on the printing being viewed |

Returns `400` when neither `id` nor `slug` is given (or when both are), and
`404` when the card does not exist. Related IDs that no longer resolve are omitted rather
than returned as empty rows.

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

## GET /api/v1/cards/by-slug/*

Look up a single printing by its persisted `public_slug`.  The wildcard
captures the full path (with slashes), so the route is shaped to match the
public site URL:

```http
GET /api/v1/cards/by-slug/ogn/12a/signature/sun-disc
GET /api/v1/cards/by-slug/ogn/21/sun-disc?include=prices
```

| Parameter | Type | Notes |
| --- | --- | --- |
| `*` (path) | string | Slug path, no leading slash |
| `include` | string (optional) | Pass `prices` to include price data |

Returns `404` when no card has the given slug. The Next.js card detail page
uses this endpoint to render multi-segment URLs that mirror `public_slug`, for
example `/card/ogn/21/sun-disc` or `/card/ogn/12a/signature/sun-disc` — i.e.
`/card/<segment>/<segment>/…`, not a single opaque slug token.

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
