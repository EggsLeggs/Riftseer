import { t } from "elysia";

export const RelatedCardSchema = t.Object({
  object: t.Literal("related_card"),
  id: t.String({ description: "UUID of the referenced card" }),
  name: t.String(),
  component: t.String({ description: "Relationship role, e.g. 'token', 'meld_part'" }),
  uri: t.Optional(t.String({ description: "API URI for the referenced card" })),
});

export const CardSchema = t.Object({
  object: t.Literal("card"),
  id: t.String({ description: "Stable UUID" }),
  name: t.String(),
  name_normalized: t.String({ description: "Lowercased, punctuation-stripped name used for search" }),
  released_at: t.Optional(t.String({ description: "ISO date string, e.g. 2024-01-15" })),
  collector_number: t.Optional(t.String()),
  external_ids: t.Optional(t.Object({
    riftcodex_id: t.Optional(t.String()),
    riftbound_id: t.Optional(t.String()),
    tcgplayer_id: t.Optional(t.String()),
  })),
  set: t.Optional(t.Object({
    set_code: t.String({ description: "Short set code, e.g. 'OGN'" }),
    set_id: t.Optional(t.String()),
    set_name: t.String({ description: "Human-readable set name, e.g. 'Origins'" }),
    set_uri: t.Optional(t.String()),
    set_search_uri: t.Optional(t.String()),
  })),
  rulings: t.Optional(t.Object({
    rulings_id: t.Optional(t.String()),
    rulings_uri: t.Optional(t.String()),
  })),
  attributes: t.Optional(t.Object({
    energy: t.Optional(t.Nullable(t.Number({ description: "Energy cost to play" }))),
    might: t.Optional(t.Nullable(t.Number({ description: "Defense-side stat" }))),
    power: t.Optional(t.Nullable(t.Number({ description: "Attack-side stat" }))),
  })),
  classification: t.Optional(t.Object({
    type: t.Optional(t.String({ description: "Card type, e.g. 'Unit', 'Gear', 'Spell'" })),
    supertype: t.Optional(t.Nullable(t.String({ description: "e.g. 'Champion'" }))),
    rarity: t.Optional(t.String({ description: "e.g. 'Common', 'Rare', 'Legendary'" })),
    tags: t.Optional(t.Array(t.String())),
    domains: t.Optional(t.Array(t.String({ description: "Domains/regions, e.g. ['Fury']" }))),
  })),
  text: t.Optional(t.Object({
    rich: t.Optional(t.String({ description: "Rules text with inline symbol tokens" })),
    plain: t.Optional(t.String({ description: "Plain-text rules text" })),
    flavour: t.Optional(t.String({ description: "Flavour/lore text" })),
  })),
  artist: t.Optional(t.String()),
  artist_id: t.Optional(t.String({ description: "UUID of the artist row" })),
  metadata: t.Optional(t.Object({
    finishes: t.Optional(t.Array(t.String({ description: "e.g. ['Normal', 'Foil']" }))),
    signature: t.Optional(t.Boolean()),
    overnumbered: t.Optional(t.Boolean()),
    alternate_art: t.Optional(t.Boolean()),
  })),
  media: t.Optional(t.Object({
    orientation: t.Optional(t.String({ description: "'portrait' or 'landscape'" })),
    accessibility_text: t.Optional(t.String()),
    media_urls: t.Optional(t.Object({
      small: t.Optional(t.String()),
      normal: t.Optional(t.String()),
      large: t.Optional(t.String()),
      png: t.Optional(t.String()),
    })),
  })),
  purchase_uris: t.Optional(t.Object({
    cardmarket: t.Optional(t.String()),
    tcgplayer: t.Optional(t.String()),
  })),
  prices: t.Optional(t.Object({
    usd: t.Optional(t.Nullable(t.Number())),
    usd_foil: t.Optional(t.Nullable(t.Number())),
    eur: t.Optional(t.Nullable(t.Number())),
    eur_foil: t.Optional(t.Nullable(t.Number())),
  })),
  is_token: t.Boolean(),
  all_parts: t.Array(RelatedCardSchema, { description: "Related token/part cards" }),
  used_by: t.Array(RelatedCardSchema, { description: "Cards that create or reference this card (tokens only)" }),
  related_champions: t.Array(RelatedCardSchema, { description: "Champion cards linked to this legend by a shared tag" }),
  related_legends: t.Array(RelatedCardSchema, { description: "Legend cards linked to this champion by a shared tag" }),
  updated_at: t.Optional(t.String({ description: "ISO datetime of last update" })),
  ingested_at: t.Optional(t.String({ description: "ISO datetime of last ingest" })),
});

export const CardRequestSchema = t.Object({
  raw: t.String(),
  name: t.String(),
  set: t.Optional(t.String()),
  collector: t.Optional(t.String()),
});

export const ResolvedCardSchema = t.Object({
  request: CardRequestSchema,
  card: t.Nullable(CardSchema),
  matchType: t.Union([
    t.Literal("exact"),
    t.Literal("fuzzy"),
    t.Literal("not-found"),
  ]),
  score: t.Optional(t.Number()),
});

export const ErrorSchema = t.Object({
  error: t.String(),
  code: t.String(),
});

export const SimplifiedDeckSchema = t.Object({
  id: t.Nullable(t.String({ description: "Deck ID" })),
  legend: t.Nullable(t.String({ description: "Legend card ID" })),
  mainDeck: t.Array(t.String({ description: "Card ID and quantity, e.g. '123e4567-e89b-12d3-a456-426614174000:2'" })),
  chosenChampionId: t.Nullable(t.String({ description: "Champion card ID" })),
  sideboard: t.Array(t.String({ description: "Card ID and quantity, e.g. '123e4567-e89b-12d3-a456-426614174000:2'" })),
  runes: t.Array(t.String({ description: "Card ID and quantity, e.g. '123e4567-e89b-12d3-a456-426614174000:2'" })),
  battlegrounds: t.Array(t.String({ description: "Battleground card ID" })),
}, { description: "Simplified deck format with card IDs and quantities" });

export const SimplifiedDeckRequestSchema = t.Object({
  cardsToAdd: t.Optional(
    t.Array(
      t.String({ description: "Cards to add to the shortform deck. Format: ID:quantity, e.g. '123e4567-e89b-12d3-a456-426614174000:2'" }),
    ),
  ),
  cardsToRemove: t.Optional(
    t.Array(
      t.String({ description: "Cards to remove from the shortform deck. Format: ID:quantity, e.g. '123e4567-e89b-12d3-a456-426614174000:2'" }),
    ),
  ),
});

export const SimplifiedDeckResponseSchema = t.Object({
  deck: SimplifiedDeckSchema,
  shortForm: t.String({ description: "Short form string for sharing, e.g. 'u:abc123'" }),
});
