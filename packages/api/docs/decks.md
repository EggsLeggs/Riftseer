---
title: Decks
sidebar_label: Decks
sidebar_position: 5
---

The deck endpoints allow clients to build, share, and modify decks using a compact encoded string — the **short form**. For full request/response schemas, see [API reference](https://eggsleggs.github.io/Riftseer/api-reference/#tag/decks).

---

## The short form

A short form is a base64url-encoded binary string that represents the full state
of a deck. It is the primary identifier — there is no separate deck ID or
database row. Decks are entirely stateless: the short form *is* the deck.

Every encoded card ID is a physical printing's stable text ObjectId, not an
oracle UUID. Existing short forms depend on those IDs remaining unchanged.

Encoding and decoding is handled by `DeckSerializerV1` in `packages/core/src/serialiser.ts`. The format uses a compact binary layout with XOR obfuscation. Clients treat it as an opaque string.

---

## Endpoints at a glance

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/decks/u` | Create a new deck, get back a short form |
| `GET` | `/api/v1/decks/u/:shortForm` | Decode a short form to full deck data |
| `POST` | `/api/v1/decks/u/:shortForm` | Add or remove cards from an existing short form |

---

## Deck structure

A decoded deck has the following slots:

| Field | Type | Notes |
| --- | --- | --- |
| `legend` | string \| null | Card ID of the legend |
| `chosenChampionId` | string \| null | Card ID of the chosen champion |
| `mainDeck` | string[] | `id:qty` entries, max 40 cards |
| `sideboard` | string[] | `id:qty` entries |
| `runes` | string[] | `id:qty` entries |
| `battlegrounds` | string[] | Card IDs (no quantity) |

Card entries in `mainDeck`, `sideboard`, and `runes` use the format
`<printing-id>:<quantity>`, for example
`67f4064886be8495f7165dd7:2`.

---

## POST /api/v1/decks/u — Create

Create a new deck from a list of card IDs and quantities.

```json
POST /api/v1/decks/u
{
  "cardsToAdd": [
    "67f4064886be8495f7165dd7:1",
    "67f4064886be8495f7165abc:3"
  ]
}
```

The API resolves each printing and reads its owning oracle's `card_type`,
`supertype`, and domains to determine the deck slot. It returns the full deck
object and the short form string.

`cardsToRemove` is not valid on a new deck and returns 400. Both create and
update endpoints require authentication; decoding an existing short form is
public.

---

## GET /api/v1/decks/u/:shortForm — Decode

Decode a short form string back into a full deck object.

```http
GET /api/v1/decks/u/abc123XYZ...
```

Returns the same `{ deck, shortForm }` shape. Returns 404 if the short form is structurally valid but references unknown cards, and 400 if the string is malformed.

---

## POST /api/v1/decks/u/:shortForm — Update

Add or remove cards from an existing deck. Pass the current short form as the path param and the changes in the body.

```json
POST /api/v1/decks/u/abc123XYZ...
{
  "cardsToAdd": ["67f4064886be8495f7165abc:2"],
  "cardsToRemove": ["67f4064886be8495f7165dd7:1"]
}
```

At least one of `cardsToAdd` or `cardsToRemove` must be present. Returns the updated deck and a new short form — the original short form is unchanged.

---

## Flow diagram

```mermaid
sequenceDiagram
    participant Client
    participant API as Decks Routes
    participant Provider as SimplifiedDeckProviderImpl
    participant Serializer as DeckSerializerV1

    Client->>API: POST /api/v1/decks/u { cardsToAdd }
    API->>Provider: addCards([{id, qty}...], undefined)
    Provider->>Provider: resolve each card ID
    Provider->>Provider: build Deck (legend, main, runes...)
    Provider->>Serializer: serialize(SimplifiedDeck)
    Serializer-->>Provider: shortForm (base64url)
    Provider-->>API: { deck, shortForm }
    API-->>Client: 200 OK

    Client->>API: GET /api/v1/decks/u/:shortForm
    API->>Provider: getDeckFromShortForm(shortForm)
    Provider->>Serializer: deserialize(shortForm)
    Serializer-->>Provider: SimplifiedDeck
    Provider-->>API: { deck, shortForm }
    API-->>Client: 200 OK
```
