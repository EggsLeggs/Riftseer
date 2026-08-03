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
  oracle_key?: string;             // Name-derived group shared by every printing
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
  source?: "riftcodex" | "manual";  // Row provenance used by ingest/admin tooling
  all_parts: RelatedCard[];         // Tokens or meld parts produced by this card
  used_by: RelatedCard[];           // Cards that create or reference this card (populated on tokens)
  related_champions: RelatedCard[]; // Champions linked to this legend
  related_legends: RelatedCard[];   // Legends linked to this champion
  related_signatures: RelatedCard[];
  related_printings: RelatedCard[];
  public_slug?: string;
  riftseer_uri?: string;
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
  supertype?: string | null;// e.g. "Champion", "Signature", "Token"
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
  media_urls?: CardMediaUrls; // { small, normal, large, original, png }
  source_url?: string;        // Best upstream image selected for this printing
  source_hash?: string;       // SHA-256(source_url), used for idempotent hosting
  source_provider?: "riftcodex" | "tcgplayer" | "admin";
}
```

After the image queue succeeds, `small`, `normal`, and `large` are WebP objects
served from the configured R2 custom domain. `original` points to the unchanged
source bytes. The URLs include a source-hash version query, so upstream image
corrections bypass immutable browser and CDN caches.

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

## Oracle grouping: rulings, legalities and formats

Rulings and format legalities describe a **card**, not a printing, so they are
keyed on `Card.oracle_key` rather than `Card.id`. `oracleKeyForName()` in
`src/oracle.ts` is the single source of truth for that derivation — take the
first face, strip trailing parentheticals, then normalize:

```typescript
import { oracleKeyForName } from "@riftseer/types/oracle";

oracleKeyForName("Recruit (271) // Buff");               // "recruit"
oracleKeyForName("Ambessa, Matriarch of War (Signature)"); // "ambessa matriarch of war"
```

The ingest worker stamps `cards.oracle_key` on every upsert and
`linkRelatedPrintings` groups by the same key, so a printing's siblings are
exactly the printings that share its rulings. A SQL mirror
(`card_oracle_key()`) exists for the migration backfill and must stay in step
with this function.

### Format

```typescript
interface Format {
  object: "format";
  id: string;
  code: string;      // Stable lowercase handle, e.g. "standard"
  name: string;
  sort_order: number; // Display order, ascending
  active: boolean;    // False for retired formats — hidden from public payloads
}
```

### CardLegality

One format's status for the printing being viewed. **Absence means legal** —
only non-legal statuses are stored — and `scope` reports which layer decided it
(printing override → oracle row → default).

```typescript
type CardLegalityStatus = "legal" | "not_legal" | "banned";

interface CardLegality {
  object: "card_legality";
  format_id: string;
  format_code: string;
  format_name: string;
  status: CardLegalityStatus;
  scope: "printing" | "oracle" | "default";
  updated_at?: string;
}
```

### CardRuling

An official ruling or an editorial note. `card_id` absent means it applies to
every printing; set, it applies only to that printing.

```typescript
interface CardRuling {
  object: "card_ruling";
  id: string;
  type: "ruling" | "note";
  text: string;
  dated?: string;   // ISO date the ruling was issued
  source?: string;  // Free-text provenance
  card_id?: string;
  created_at?: string;
  updated_at?: string;
}
```

Both arrive on `CardDetail` as `rulings` and `legalities`, already resolved and
ordered by the API — see [@riftseer/api — Cards](../api/cards).

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

Deck types live in `src/deck.ts`, `src/deck-validate.ts` and `src/deck-text.ts`, not here. A deck is a persisted, account-owned row; the old `SimplifiedDeck` wire type and its binary short form are gone.

See [Deck model](./deck-model) for the zone vocabulary, `zoneForCard()`, `validateDeck()` and the text interchange format.

---

## Adding a field

If a new field needs to be added to `Card`:

1. Update `packages/types/src/card.ts`
2. Update `packages/ingest-worker/src/riftcodex.ts` (`rawToCard`)
3. Update the row mapping in `packages/core/src/providers/supabase.ts` (`dbRowToCard`)
4. Update the field table in `packages/api/docs/cards.md`
5. Check `PrivacyPage.tsx` if the field affects what data is stored or shown
