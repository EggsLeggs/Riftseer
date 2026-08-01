---
title: Cards
sidebar_label: Cards
sidebar_position: 4
---

Riftseer separates a card's rules identity from its physical editions:

- An **oracle** is the rules object: name, type line, stats, rules text, keywords, tags, domains, and relationships. Its `id` is a UUID.
- A **printing** is one physical card: set, collector number, rarity, art, artist, flavour text, finishes, prices, purchase links, and printing flags. Its `id` is a RiftCodex MongoDB ObjectId.

A search or random-card response is normally oracle-shaped and embeds the edition to display as `preferred_printing`. Endpoints that identify a physical edition return a printing directly or return it beside its oracle.

---

## Endpoints at a glance

| Method | Path                      | Description                                                         |
| ------ | ------------------------- | ------------------------------------------------------------------- |
| `GET`  | `/api/v1/cards`           | Search or browse oracles and printings — see [Search](./search.md). |
| `GET`  | `/api/v1/cards/random`    | Random oracle with its preferred printing.                          |
| `GET`  | `/api/v1/cards/detail`    | Complete oracle page payload, viewed through one printing.          |
| `GET`  | `/api/v1/cards/:id`       | Oracle by UUID.                                                     |
| `GET`  | `/api/v1/cards/:id/text`  | Plain-text oracle summary.                                          |
| `GET`  | `/api/v1/cards/by-slug/*` | Oracle by oracle slug or printing slug.                             |
| `POST` | `/api/v1/cards/resolve`   | Batch-resolve names to oracle-plus-printing pairs.                  |
| `GET`  | `/api/v1/printings/:id`   | One physical printing by ObjectId.                                  |

---

## Oracle object

Oracle responses have `object: "oracle"`. Important fields:

| Field                           | Type                        | Notes                                                                |
| ------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| `id`                            | string                      | Stable oracle UUID and the card's identity.                          |
| `oracle_key`                    | string                      | Stable name-derived lookup key. It is not identity.                  |
| `slug`                          | string                      | Oracle-level public slug, for example `sun-disc`.                    |
| `name`, `name_normalized`       | string                      | Display and normalized search names.                                 |
| `card_type`                     | string \| undefined         | Base type, for example `Unit`, `Gear`, or `Spell`.                   |
| `supertype`                     | string \| null \| undefined | Optional type modifier, for example `Champion`.                      |
| `is_token`                      | boolean                     | Token status, independent of `card_type`.                            |
| `energy`, `might`, `power`      | number \| null \| undefined | Oracle-level play stats.                                             |
| `might_bonus`                   | number \| null \| undefined | `[Equip]` bonus. `0` is a real value; test presence, not truthiness. |
| `text.rich`, `text.plain`       | string \| undefined         | Rules text with symbol tokens or readable plain text.                |
| `text.equipment`                | string \| undefined         | Effect granted by an `[Equip]` gear.                                 |
| `keywords`                      | string[]                    | Normalized keyword base keys, for example `deflect`.                 |
| `tags`, `domains`, `meta_flags` | string[]                    | Oracle classification and searchable metadata.                       |
| `relationships`                 | object \| undefined         | Oracle-to-oracle relationship arrays; populated on detail reads.     |
| `preferred_printing`            | Printing \| undefined       | The edition to display. Search embeds the edition that matched.      |
| `printings`                     | Printing[] \| undefined     | All editions when a read includes them.                              |
| `source`                        | string \| undefined         | `riftcodex` or `manual`.                                             |
| `riftseer_uri`                  | string \| undefined         | Absolute oracle page URL, computed when `SITE_ORIGIN` is configured. |

`relationships` contains four arrays:

| Field          | Meaning                                                               |
| -------------- | --------------------------------------------------------------------- |
| `makes_tokens` | Token oracles created by this card.                                   |
| `used_by`      | Cards that create this token; the reverse of `makes_tokens`.          |
| `characters`   | Other oracle roles for the same character, such as legend ↔ champion. |
| `signatures`   | Signature cards and their linked legend/champion oracles.             |

Each entry is an `OracleRef`: `{ object: "oracle_ref", id, name, slug, uri?, riftseer_uri?, image_small? }`. Relationships are oracle-level edges and are not overridden per printing.

---

## Printing object

Printing responses have `object: "printing"`. Important fields:

| Field                                                              | Type                 | Notes                                                                                   |
| ------------------------------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------- |
| `id`                                                               | string               | Stable RiftCodex MongoDB ObjectId. Existing deck encodings depend on it.                |
| `oracle_id`                                                        | string               | UUID of the rules object this edition prints.                                           |
| `set`                                                              | object \| undefined  | `set_code`, `set_name`, IDs, links, publication date, count, and promo status.          |
| `collector_number`                                                 | string \| undefined  | Raw printed number, including prefixes such as `T03`, `SP3`, or `R01`.                  |
| `collector_label`                                                  | string \| undefined  | Display label, including a variant marker when applicable.                              |
| `rarity`                                                           | string \| undefined  | **Printing-level.** Alternate or showcase editions can disagree with the base printing. |
| `released_at`                                                      | string \| undefined  | Printing release date.                                                                  |
| `artist`, `flavour_text`                                           | string \| undefined  | Physical-edition credits and flavour copy.                                              |
| `finishes`                                                         | string[]             | Available finishes, for example `Normal` and `Foil`.                                    |
| `signature`, `alternate_art`, `overnumbered`, `special_collection` | boolean              | Printing flags.                                                                         |
| `image`                                                            | object \| undefined  | `small`, `normal`, `large`, and `original` image URLs.                                  |
| `image_orientation`, `image_alt_text`                              | string \| undefined  | Display metadata for the art.                                                           |
| `prices`                                                           | object \| undefined  | Opt-in marketplace prices.                                                              |
| `purchase_uris`                                                    | object \| undefined  | TCGPlayer and Cardmarket links when available.                                          |
| `external_ids`                                                     | object \| undefined  | RiftCodex, Riftbound, TCGPlayer, and Cardmarket identifiers.                            |
| `public_slug`                                                      | string               | Pinned printing URL path, for example `ogn/12a/signature/sun-disc`.                     |
| `riftseer_uri`                                                     | string \| undefined  | Absolute printing page URL. Prefer this over constructing a URL.                        |
| `differs_from_oracle`                                              | boolean \| undefined | This printing has a rules delta; returned oracle fields are already resolved.           |

---

## GET /api/v1/cards

Search returns one row per oracle by default:

```json
{
  "unique": "oracle",
  "count": 1,
  "total": 1,
  "offset": 0,
  "limit": 10,
  "cards": [
    {
      "object": "oracle",
      "name": "Sun Disc",
      "preferred_printing": { "object": "printing", "rarity": "Rare" }
    }
  ],
  "printings": []
}
```

Pass `unique=prints` to populate `printings` instead. The matching printing is always preserved: in oracle mode it becomes `preferred_printing`; in print mode it is the result row. See [Search](./search.md) for the full query language and parameters.

---

## GET /api/v1/cards/random

Returns one random oracle with `preferred_printing` populated.

| Parameter | Type              | Notes                                                      |
| --------- | ----------------- | ---------------------------------------------------------- |
| `include` | string (optional) | Pass `prices` to include prices on the preferred printing. |

```http
GET /api/v1/cards/random
GET /api/v1/cards/random?include=prices
```

---

## GET /api/v1/cards/detail

Returns the complete public card-page model. Provide exactly one lookup parameter:

| Parameter  | Type              | Notes                                                                     |
| ---------- | ----------------- | ------------------------------------------------------------------------- |
| `oracle`   | string (optional) | Oracle UUID.                                                              |
| `printing` | string (optional) | Printing ObjectId; views its oracle through this edition.                 |
| `slug`     | string (optional) | Oracle slug (`sun-disc`) or printing slug (`ogn/12a/signature/sun-disc`). |
| `include`  | string (optional) | Pass `prices` to include prices across returned printings.                |

```http
GET /api/v1/cards/detail?oracle=3d8f2da9-9d2b-4a2c-a34d-6f08b54c9571
GET /api/v1/cards/detail?printing=67f4064886be8495f7165dd7
GET /api/v1/cards/detail?slug=ogn/21/sun-disc&include=prices
```

Response fields:

| Field        | Type              | Notes                                                            |
| ------------ | ----------------- | ---------------------------------------------------------------- |
| `object`     | `"oracle_detail"` |                                                                  |
| `oracle`     | Oracle            | Rules object with relationships populated.                       |
| `printing`   | Printing          | Requested edition, or the oracle's preferred edition.            |
| `printings`  | Printing[]        | Every edition of the oracle, oldest set first.                   |
| `tokens`     | OracleRef[]       | Tokens this oracle creates.                                      |
| `used_by`    | OracleRef[]       | Oracles that create this token.                                  |
| `characters` | OracleRef[]       | Other roles for the same character.                              |
| `signatures` | OracleRef[]       | Linked signature cards or owners.                                |
| `purchase`   | object            | Resolved TCGPlayer/Cardmarket links with search fallbacks.       |
| `rulings`    | CardRuling[]      | Printing-, oracle-, and query-rule-scoped entries, oldest first. |
| `legalities` | CardLegality[]    | One resolved entry per active format.                            |

Each `CardRuling` is `{ object, id, type, text, dated?, source?, scope?, created_at?, updated_at? }`. Its `scope` is `printing`, `oracle`, or `rule`.

Each `CardLegality` is `{ object, format_id, format_code, format_name, status, scope, updated_at? }`. Status is `legal`, `not_legal`, or `banned`; scope is `printing`, `oracle`, or `default`. Resolution precedence is printing row → oracle row → legal by default.

The endpoint returns 400 unless exactly one lookup parameter is supplied, 404 when the oracle does not exist, and 404 when it has no printing.

---

## GET /api/v1/cards/:id

Fetches one oracle by its UUID. This endpoint does not accept a printing ID.

| Parameter | Type              | Notes                                                  |
| --------- | ----------------- | ------------------------------------------------------ |
| `include` | string (optional) | Pass `prices` to include prices on embedded printings. |

```http
GET /api/v1/cards/3d8f2da9-9d2b-4a2c-a34d-6f08b54c9571
```

Returns 404 when the oracle UUID does not exist.

---

## GET /api/v1/cards/:id/text

Returns a `text/plain` summary of an oracle: name, type line, then rules text.

```http
GET /api/v1/cards/3d8f2da9-9d2b-4a2c-a34d-6f08b54c9571/text
```

```text
Sun Disc
Gear

Equipped Champion gains +2 Power and +2 Might.
```

---

## GET /api/v1/cards/by-slug/\*

The wildcard accepts either an oracle slug or a multi-segment printing slug:

```http
GET /api/v1/cards/by-slug/sun-disc
GET /api/v1/cards/by-slug/ogn/12a/signature/sun-disc?include=prices
```

Both forms return an oracle. A printing slug places that edition in `preferred_printing`; an oracle slug uses the oracle's preferred edition.

| Parameter  | Type              | Notes                                            |
| ---------- | ----------------- | ------------------------------------------------ |
| `*` (path) | string            | Oracle or printing slug without a leading slash. |
| `include`  | string (optional) | Pass `prices` to include printing prices.        |

Returns 404 when neither slug exists.

---

## GET /api/v1/printings/:id

Returns one physical printing by its ObjectId. Use `/api/v1/cards/:id` for the oracle rules object.

| Parameter | Type              | Notes                            |
| --------- | ----------------- | -------------------------------- |
| `include` | string (optional) | Pass `prices` to include prices. |

```http
GET /api/v1/printings/67f4064886be8495f7165dd7?include=prices
```

Returns 404 when the printing does not exist.

---

## POST /api/v1/cards/resolve

Batch-resolves up to 20 request strings. Each lookup identifies an oracle and chooses the requested printing, or the oracle's preferred printing when no edition was specified.

```json
POST /api/v1/cards/resolve
{
  "requests": ["Sun Disc", "Bard|OGN-001", "Card Name|VEN-SP3"],
  "include": "prices"
}
```

Request strings use the content inside a card token: `Name`, `Name|SET`, or `Name|SET-collector`. Collector prefixes such as `T03`, `SP3`, and `R01` are supported. The Discord and Reddit bots pass the inner text parsed from `[[Name|SET-collector]]` mentions.

Each result contains:

| Field       | Type                | Notes                                                           |
| ----------- | ------------------- | --------------------------------------------------------------- |
| `request`   | CardRequest         | Parsed `raw`, `name`, optional `set`, and optional `collector`. |
| `oracle`    | Oracle \| null      | Matched rules object.                                           |
| `printing`  | Printing \| null    | Requested or preferred physical edition.                        |
| `matchType` | string              | `exact`, `fuzzy`, or `not-found`.                               |
| `score`     | number \| undefined | Relevance score for a fuzzy match.                              |

The response is `{ count, results }`. More than 20 entries returns HTTP 400 with `code: "TOO_MANY_REQUESTS"`.

---

## Prices

Prices are printing-level and opt-in. Pass `?include=prices`, or `"include": "prices"` in a resolve body. Without it, `prices` is omitted. `purchase_uris` remains available when known.

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

Every nested price is nullable. Price data comes from TCGPlayer through TCGCSV enrichment and does not affect oracle identity or rules.
