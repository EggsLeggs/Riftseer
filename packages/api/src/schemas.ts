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
  id: t.String(),
  name: t.String(),
  name_normalized: t.String(),
  released_at: t.Optional(t.String()),
  collector_number: t.Optional(t.String()),
  external_ids: t.Optional(t.Any()),
  set: t.Optional(t.Any()),
  rulings: t.Optional(t.Any()),
  attributes: t.Optional(t.Any()),
  classification: t.Optional(t.Any()),
  text: t.Optional(t.Any()),
  artist: t.Optional(t.String()),
  artist_id: t.Optional(t.String()),
  metadata: t.Optional(t.Any()),
  media: t.Optional(t.Any()),
  purchase_uris: t.Optional(t.Any()),
  prices: t.Optional(t.Any()),
  is_token: t.Boolean(),
  all_parts: t.Array(RelatedCardSchema),
  used_by: t.Array(RelatedCardSchema),
  related_champions: t.Array(RelatedCardSchema),
  related_legends: t.Array(RelatedCardSchema),
  updated_at: t.Optional(t.String()),
  ingested_at: t.Optional(t.String()),
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
