import { t } from "elysia";

export const RelatedCardSchema = t.Object({
  object: t.Literal("related_card"),
  id: t.String({ description: "ID of the referenced card" }),
  name: t.String(),
  component: t.String({ description: "Relationship role, e.g. 'token', 'meld_part'" }),
  uri: t.Optional(t.String({ description: "API URI for the referenced card" })),
  riftseer_uri: t.Optional(
    t.String({ description: "Absolute public site URL for the referenced card" }),
  ),
});

const PriceEntrySchema = t.Partial(
  t.Object({
    normal: t.Nullable(t.Number()),
    foil: t.Nullable(t.Number()),
    low_normal: t.Nullable(t.Number()),
    low_foil: t.Nullable(t.Number()),
  }),
);

export const CardPricesSchema = t.Partial(
  t.Object({
    tcgplayer: t.Optional(PriceEntrySchema),
    cardmarket: t.Optional(PriceEntrySchema),
  }),
);

export const CardPurchaseUrisSchema = t.Partial(
  t.Object({
    cardmarket: t.String(),
    tcgplayer: t.String(),
  }),
);

export const CardSchema = t.Object({
  object: t.Literal("card"),
  id: t.String(),
  name: t.String(),
  name_normalized: t.String(),
  released_at: t.Optional(t.String()),
  collector_number: t.Optional(t.String()),
  external_ids: t.Optional(t.Partial(t.Object({
    riftcodex_id: t.String(),
    riftbound_id: t.String(),
    tcgplayer_id: t.String(),
  }))),
  set: t.Optional(t.Object({
    set_code: t.String(),
    set_id: t.Optional(t.String()),
    set_name: t.String(),
    set_uri: t.Optional(t.String()),
    set_search_uri: t.Optional(t.String()),
    published_on: t.Optional(t.String()),
    card_count: t.Optional(t.Number()),
  })),
  rulings: t.Optional(t.Partial(t.Object({
    rulings_id: t.String(),
    rulings_uri: t.String(),
  }))),
  attributes: t.Optional(t.Partial(t.Object({
    energy: t.Nullable(t.Number()),
    might: t.Nullable(t.Number()),
    power: t.Nullable(t.Number()),
  }))),
  classification: t.Optional(t.Partial(t.Object({
    type: t.String(),
    supertype: t.Nullable(t.String()),
    rarity: t.String(),
    tags: t.Array(t.String()),
    domains: t.Array(t.String()),
  }))),
  text: t.Optional(t.Partial(t.Object({
    rich: t.String(),
    plain: t.String(),
    flavour: t.String(),
  }))),
  artist: t.Optional(t.String()),
  artist_id: t.Optional(t.String()),
  metadata: t.Optional(t.Partial(t.Object({
    finishes: t.Array(t.String()),
    signature: t.Boolean(),
    overnumbered: t.Boolean(),
    alternate_art: t.Boolean(),
  }))),
  media: t.Optional(t.Partial(t.Object({
    orientation: t.String(),
    accessibility_text: t.String(),
    media_urls: t.Optional(t.Partial(t.Object({
      small: t.String(),
      normal: t.String(),
      large: t.String(),
      png: t.String(),
    }))),
  }))),
  purchase_uris: t.Optional(CardPurchaseUrisSchema),
  prices: t.Optional(CardPricesSchema),
  is_token: t.Boolean(),
  all_parts: t.Array(RelatedCardSchema),
  used_by: t.Array(RelatedCardSchema),
  related_champions: t.Array(RelatedCardSchema),
  related_legends: t.Array(RelatedCardSchema),
  related_signatures: t.Array(RelatedCardSchema),
  related_printings: t.Array(RelatedCardSchema),
  public_slug: t.Optional(
    t.String({
      description:
        "Stable public URL path for the printing (no leading slash), e.g. 'ogn/12a/signature/sun-disc'.",
    }),
  ),
  riftseer_uri: t.Optional(
    t.String({
      description:
        "Absolute public site URL for this card (e.g. https://riftseer.com/card/ogn/12a/sun-disc).",
    }),
  ),
  updated_at: t.Optional(t.String()),
  ingested_at: t.Optional(t.String()),
});

export const CardPrintingSummarySchema = t.Object({
  object: t.Literal("card_printing"),
  id: t.String(),
  name: t.String(),
  public_slug: t.Optional(t.String()),
  riftseer_uri: t.Optional(t.String()),
  set_code: t.Optional(t.String()),
  set_name: t.Optional(t.String()),
  collector_number: t.Optional(t.String()),
  collector_label: t.Optional(
    t.String({
      description:
        "Collector number with its variant marker, e.g. '12a' (alternate art) or '21★' (signature).",
    }),
  ),
  rarity: t.Optional(t.String()),
  type: t.Optional(t.String()),
  energy: t.Optional(t.Nullable(t.Number())),
  power: t.Optional(t.Nullable(t.Number())),
  is_token: t.Boolean(),
  alternate_art: t.Optional(t.Boolean()),
  signature: t.Optional(t.Boolean()),
  image_small: t.Optional(t.String()),
  prices: t.Optional(CardPricesSchema),
  purchase_uris: t.Optional(CardPurchaseUrisSchema),
  is_current: t.Optional(
    t.Boolean({ description: "True for the printing being viewed." }),
  ),
});

export const CardDetailSchema = t.Object({
  object: t.Literal("card_detail"),
  card: CardSchema,
  printings: t.Array(CardPrintingSummarySchema, {
    description: "All printings including the current one, oldest set first.",
  }),
  tokens: t.Array(CardPrintingSummarySchema, {
    description: "Token cards this card creates.",
  }),
  used_by: t.Array(CardPrintingSummarySchema, {
    description:
      "Cards that create this token — one preferred printing per card.",
  }),
  champions: t.Array(CardPrintingSummarySchema, {
    description: "Champions sharing a tag with this legend, one row per character.",
  }),
  legends: t.Array(CardPrintingSummarySchema, {
    description: "Legends sharing a tag with this champion, one row per character.",
  }),
  signatures: t.Array(CardPrintingSummarySchema, {
    description:
      "Signature cards tied to this legend/champion by a shared character tag, one row per signature.",
  }),
  purchase: CardPurchaseUrisSchema,
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
