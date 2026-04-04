---
title: Sets
sidebar_label: Sets
sidebar_position: 6
---

All set endpoints are under `/api/v1/sets`. For full request/response schemas, try them interactively in [Swagger](https://riftseerapi-production.up.railway.app/api/swagger#tag/sets).

---

## Endpoints at a glance

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/sets` | List all sets with card counts |

---

## GET /api/v1/sets

Returns all known card sets with a card count for each.

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

All fields are always present. `cardCount` reflects the number of cards currently in the index for that set.

To browse all cards in a set, use `GET /api/v1/cards?set=OGN` — see [Search](./search.md).
