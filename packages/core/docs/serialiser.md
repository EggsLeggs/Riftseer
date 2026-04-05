---
title: Deck Serialiser
sidebar_label: Serialiser
sidebar_position: 8
---

`src/serialiser.ts` defines the `DeckSerializer` interface and its only implementation, `DeckSerializerV1`. It converts a `SimplifiedDeck` to and from a compact, URL-safe string used as the deck's `shortForm` identifier.

---

## `DeckSerializer` interface

```typescript
interface DeckSerializer {
  serializeDeck(deck: SimplifiedDeck): string;
  deserializeDeck(serialized: string): SimplifiedDeck;
}
```

---

## `DeckSerializerV1`

The current implementation encodes a `SimplifiedDeck` as a compact binary buffer, XOR-obfuscates it with a fixed rotating key, then base64url-encodes the result. The output is opaque and URL-safe with no padding characters.

### Binary format (V1)

```
[1 byte]  FORMAT_VERSION (= 1)
[1 byte]  flags  (bit 0 = hasLegendId, bit 1 = hasChampionId)
[string]  legendId          (omitted when flag bit 0 is clear)
[string]  chosenChampionId  (omitted when flag bit 1 is clear)
[1 byte]  mainDeck entry count
  per entry: [string id][1 byte qty]
[1 byte]  sideboard entry count
  per entry: [string id][1 byte qty]
[1 byte]  runes entry count
  per entry: [string id][1 byte qty]
[1 byte]  battlegrounds entry count
  per entry: [string id]

Where [string] = [1 byte length][N bytes UTF-8], max 255 bytes per ID.
```

The buffer is XOR'd with a fixed 16-byte rotating key before encoding. This is not cryptographic — it makes the output non-trivially readable without the source.

---

## Usage

```typescript
import { DeckSerializerV1 } from "@riftseer/core";

const serializer = new DeckSerializerV1();

// Encode
const shortForm = serializer.serializeDeck(simplifiedDeck);
// → compact base64url string, e.g. "AQH_cGFsYWRpbg..."

// Decode
const deck = serializer.deserializeDeck(shortForm);
```

---

## Constraints

| Constraint | Limit |
|---|---|
| Max ID length | 255 UTF-8 bytes |
| Max entries per section | 255 |
| Quantity per card | 1–255 |

---

## Error handling

`deserializeDeck` throws `BadRequestError` (from `src/errors.ts`) for:
- Base64url decode failure
- Unsupported format version
- Unexpected end of data
- Empty card ID in any section
- Zero quantity for a card
- Trailing bytes after decoding

`serializeDeck` throws if any ID exceeds 255 bytes or a section has more than 255 entries.

---

## Versioning

The first byte of every encoded buffer is the format version. `deserializeDeck` rejects any version other than `1`. When a new format is needed, a `DeckSerializerV2` class should be introduced rather than modifying `DeckSerializerV1`.
