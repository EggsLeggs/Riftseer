---
title: Deck
sidebar_label: Deck
sidebar_position: 7
---

`src/deck.ts` exports the `Deck` class — a rule-enforcing in-memory deck model. It holds full `Card` objects and validates every mutation against Riftbound deck-building rules. For storage or URL sharing, convert to `SimplifiedDeck` via `toSimplifiedDeck()`.

---

## Deck zones

| Zone | Property | Type | Limit |
| --- | --- | --- | --- |
| Legend | `legend` | `Card \| null` | 1 |
| Chosen champion | `chosenChampion` | `Card \| null` | 1 |
| Main deck | `cards` | `{ card, quantity }[]` | 40 total (3 copies per card) |
| Sideboard | `sideboard` | `{ card, quantity }[]` | 8 total |
| Runes | `runes` | `{ card, quantity }[]` | 12 total |
| Battlegrounds | `battlegrounds` | `Card[]` | 3 unique |

---

## Construction

```typescript
const deck = new Deck();
```

All zones start empty. A legend must be set before main deck cards, sideboard cards, or runes can be added.

---

## Adding cards

### `addCard(card, quantity?)`

General-purpose method. Dispatches to the appropriate zone based on `card.classification`:

- `type === "Legend"` → `addLegend(card)`
- `supertype === "Battleground"` → `addBattleground(card)` (quantity must be 1)
- `supertype === "Rune"` → `addRune(card, quantity)`
- Everything else → `addMainCard(card, quantity)`, overflow spills to sideboard

### `addLegend(card)`

Sets the legend. Throws if the card is not a Legend or a legend is already set.

### `addMainCard(card, quantity?, toSideboard?)`

Adds to the main deck (or sideboard when `toSideboard` is true). Validates:

- Card is not a Legend, Battleground, or Rune
- A legend has already been set
- Card domains are a subset of the legend's domains
- 3-copy limit across main + sideboard + champion slot
- 40-card main deck cap / 8-card sideboard cap

The first eligible Champion added to the main deck is automatically stored as `chosenChampion` (one copy is consumed for the champion slot; remaining copies go into `cards`).

### `addBattleground(card)`

Adds to `battlegrounds`. Throws if the card is not a Battleground, if 3 battlegrounds are already set, or if the same battleground is already present.

### `addRune(card, quantity?)`

Adds to `runes`. Validates domain match and enforces the 12-rune cap.

---

## Removing cards

### `removeCard(cardId, quantity?)`

General-purpose removal. Dispatches by type, same logic as `addCard`.

### `removeLegend(id)`

Removes the legend and **resets all dependent state** — `cards`, `sideboard`, `chosenChampion`, and `runes` are all cleared.

### `removeMainCard(cardId, quantity?)`

Removes from main deck first, then sideboard, then the `chosenChampion` slot.

### `removeBattleground(cardId)`

Removes a battleground by ID. Throws if not found.

### `removeRune(cardId, quantity?)`

Removes rune copies by ID. Removes the entry entirely when quantity reaches zero.

---

## Validation

### `getFinalisationIssues()`

Returns an array of `DeckIssue` values for rule violations that would prevent the deck from being tournament-legal. An empty array means the deck is valid.

```typescript
enum DeckIssue {
  NoLegend              = "NO_LEGEND",
  NoChosenChampion      = "NO_CHOSEN_CHAMPION",
  NotEnoughMainCards    = "NOT_ENOUGH_MAIN_CARDS",    // < 40
  NotEnoughBattlegrounds = "NOT_ENOUGH_BATTLEGROUNDS", // < 3
  NotEnoughRunes        = "NOT_ENOUGH_RUNES",          // < 12
}
```

---

## Serialisation

### `toSimplifiedDeck()`

Converts to `SimplifiedDeck` — the storage/transport format. Card IDs and quantities are encoded as `"cardId:quantity"` strings; battlegrounds are bare IDs.

### `Deck.fromSimplifiedDeck(simplified, cardLookup)`

Static async factory. Reconstructs a `Deck` from a `SimplifiedDeck` by resolving IDs via the provided `cardLookup` function. Validates all constraints after loading (same rules as the mutation methods).

```typescript
const deck = await Deck.fromSimplifiedDeck(simplified, (id) => provider.getCardById(id));
```

Throws `BadRequestError` for any constraint violation or lookup failure.

---

## Deck rules summary

| Rule | Limit |
| --- | --- |
| Legend | Required, exactly 1 |
| Chosen champion | Required, auto-assigned from first eligible Champion added |
| Main deck | Exactly 40 cards |
| Copies per card | Max 3 (across main + sideboard + champion slot) |
| Sideboard | Max 8 cards |
| Runes | Exactly 12 total |
| Battlegrounds | Exactly 3 unique |
| Domain matching | All card domains must be a subset of the legend's domains |
