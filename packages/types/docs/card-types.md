---
title: Card Types
sidebar_label: Card Types
sidebar_position: 2
---

All canonical card types live in `src/card.ts`. They mirror the Postgres schema in `supabase/migrations/` and are the single source of truth for the card shape across the whole monorepo.

---

## Card

The main card object returned by all API endpoints.

```typescript
interface Card {
  object: "card";
  id: string;                      // Stable UUID (matches Postgres cards.id)
  name: string;
  name_normalized: string;         // Lowercased, punctuation-stripped — used for search
  released_at?: string;
  collector_number?: string;       // e.g. "OGN-001"
  external_ids?: CardExternalIds;
  set?: CardSet;
  rulings?: CardRulings;
  attributes?: CardAttributes;
  classification?: CardClassification;
  text?: CardText;
  artist?: string;
  artist_id?: string;
  metadata?: CardMetadata;
  media?: CardMedia;
  purchase_uris?: CardPurchaseUris;
  prices?: CardPrices;
  is_token: boolean;
  all_parts: RelatedCard[];         // Tokens or meld parts produced by this card
  used_by: RelatedCard[];           // Cards that create or reference this card (populated on tokens)
  related_champions: RelatedCard[]; // Champions linked to this legend
  related_legends: RelatedCard[];   // Legends linked to this champion
  updated_at?: string;
  ingested_at?: string;
}
```

---

## Sub-interfaces

### CardAttributes

```typescript
interface CardAttributes {
  energy?: number | null;  // Energy cost to play the card
  might?: number | null;   // Defense-side stat
  power?: number | null;   // Attack-side stat
}
```

### CardClassification

```typescript
interface CardClassification {
  type?: string;            // e.g. "Unit", "Gear", "Spell"
  supertype?: string | null;// e.g. "Champion", "Rune", "Battleground"
  rarity?: string;          // e.g. "Common", "Rare", "Legendary"
  tags?: string[];          // e.g. ["Poro"]
  domains?: string[];       // e.g. ["Fury"]
}
```

### CardText

```typescript
interface CardText {
  rich?: string;    // Rules text with inline symbol tokens (e.g. :rb_exhaust:)
  plain?: string;   // Rules text with symbols replaced by readable tokens
  flavour?: string; // Flavour / lore text if available
}
```

### CardSet

```typescript
interface CardSet {
  set_code: string;    // Short code, e.g. "OGN"
  set_id?: string;
  set_name: string;
  set_uri?: string;
  set_search_uri?: string;
}
```

### CardMedia

```typescript
interface CardMedia {
  orientation?: string;       // "portrait" or "landscape"
  accessibility_text?: string;
  media_urls?: CardMediaUrls; // { small, normal, large, png }
}
```

### CardMetadata

```typescript
interface CardMetadata {
  finishes?: string[];    // e.g. ["Normal", "Foil"]
  signature?: boolean;
  overnumbered?: boolean;
  alternate_art?: boolean;
}
```

### CardPrices

```typescript
interface CardPrices {
  usd?: number | null;
  usd_foil?: number | null;
  eur?: number | null;
  eur_foil?: number | null;
}
```

### CardExternalIds

```typescript
interface CardExternalIds {
  riftcodex_id?: string;
  riftbound_id?: string;
  tcgplayer_id?: string;
}
```

### CardRulings

```typescript
interface CardRulings {
  rulings_id?: string;
  rulings_uri?: string;
}
```

### CardPurchaseUris

```typescript
interface CardPurchaseUris {
  cardmarket?: string;
  tcgplayer?: string;
}
```

### RelatedCard

Referenced inside `all_parts`, `used_by`, `related_champions`, and `related_legends`:

```typescript
interface RelatedCard {
  object: "related_card";
  id: string;
  name: string;
  component: string; // e.g. "token", "meld_part"
  uri?: string;      // API URI for the referenced card
}
```

---

## Request and resolution types

### CardRequest

A parsed `[[Name|SET-123]]` token:

```typescript
interface CardRequest {
  raw: string;        // Original text inside [[ ]]
  name: string;       // Parsed card name
  set?: string;       // Optional set code
  collector?: string; // Optional collector number
}
```

### ResolvedCard

The result of resolving a `CardRequest` against the provider:

```typescript
interface ResolvedCard {
  request: CardRequest;
  card: Card | null;
  matchType: "exact" | "fuzzy" | "not-found";
  score?: number; // Fuse.js score when matchType === "fuzzy" (lower = better)
}
```

### CardSearchOptions

Options for `searchByName`:

```typescript
interface CardSearchOptions {
  set?: string;
  collector?: string | number;
  fuzzy?: boolean; // Default true — set false for exact-only
  limit?: number;  // Default 10
}
```

---

## Deck types

### SimplifiedDeck

The serialisable, storage-friendly form of a deck. Card quantities are encoded as `"cardId:quantity"` strings.

```typescript
interface SimplifiedDeck {
  id: string | null;
  legendId: string | null;
  chosenChampionId: string | null;
  mainDeck: string[];      // "cardId:quantity" entries
  sideboard: string[];     // "cardId:quantity" entries
  runes: string[];         // "cardId:quantity" entries
  battlegrounds: string[]; // Card IDs only (always quantity 1)
}
```

See [@riftseer/core — Deck](../core/deck) for the richer in-memory `Deck` class, and [@riftseer/core — Serialiser](../core/serialiser) for how `SimplifiedDeck` is encoded for URL sharing.

---

## Adding a field

If a new field needs to be added to `Card`:

1. Update `packages/types/src/card.ts`
2. Update `packages/ingest-worker/src/riftcodex.ts` (`rawToCard`)
3. Update the row mapping in `packages/core/src/providers/supabase.ts` (`dbRowToCard`)
4. Update the field table in `packages/api/docs/cards.md`
5. Check `PrivacyPage.tsx` if the field affects what data is stored or shown
