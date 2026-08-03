import { t, type Static } from "elysia";
import { DECK_ZONES } from "@riftseer/types/deck";
import type {
  CardLegality,
  CardPrices,
  CardPurchaseUris,
  CardRequest,
  CardRuling,
  Format,
  Oracle,
  OracleDetail,
  OracleRef,
  Printing,
  ResolvedCard,
} from "@riftseer/types";

// ─── Drift guard ──────────────────────────────────────────────────────────────
//
// TypeBox cannot derive a schema from a TypeScript interface without a codegen
// step, so the shapes below are still written by hand — and this file has
// already drifted from the card model twice. The guard makes the third time a
// compile error.
//
// Both directions matter. Elysia cleans every response against these schemas,
// so a field the schema forgets is a field the API silently stops returning;
// a field the schema invents is one no handler can produce.

type Mirrors<Schema, Domain> = [Schema] extends [Domain]
  ? [Domain] extends [Schema]
    ? true
    : { schema_rejects_a_valid_value: Exclude<keyof Schema, keyof Domain> }
  : { schema_is_missing_or_mistypes: Exclude<keyof Domain, keyof Schema> };

/** Fails to satisfy its constraint — and so fails the build — on any drift. */
type Assert<T extends true> = T;

// ─── Oracle ───────────────────────────────────────────────────────────────────

export const OracleRefSchema = t.Object({
  object: t.Literal("oracle_ref"),
  id: t.String({ description: "UUID of the referenced oracle" }),
  name: t.String(),
  slug: t.String({ description: "Oracle-level public slug, e.g. `brush`" }),
  uri: t.Optional(t.String()),
  riftseer_uri: t.Optional(t.String()),
  image_small: t.Optional(t.String()),
});

const OracleTextSchema = t.Partial(
  t.Object({
    rich: t.String(),
    plain: t.String(),
    equipment: t.String({
      description:
        "The effect an `[Equip]` gear grants the unit it is attached to.",
    }),
  }),
);

const OracleRelationshipsSchema = t.Object({
  makes_tokens: t.Array(OracleRefSchema),
  used_by: t.Array(OracleRefSchema),
  characters: t.Array(OracleRefSchema),
  signatures: t.Array(OracleRefSchema),
});

// ─── Printing ─────────────────────────────────────────────────────────────────

export const CardSetSchema = t.Object({
  set_code: t.String(),
  set_id: t.Optional(t.String()),
  set_name: t.String(),
  set_uri: t.Optional(t.String()),
  set_search_uri: t.Optional(t.String()),
  published_on: t.Optional(t.String()),
  card_count: t.Optional(t.Number()),
  is_promo: t.Optional(t.Boolean()),
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
    tcgplayer: PriceEntrySchema,
    cardmarket: PriceEntrySchema,
  }),
);

export const CardPurchaseUrisSchema = t.Partial(
  t.Object({
    cardmarket: t.String(),
    tcgplayer: t.String(),
  }),
);

const PrintingImageSchema = t.Partial(
  t.Object({
    small: t.String(),
    normal: t.String(),
    large: t.String(),
    original: t.String(),
  }),
);

export const PrintingSchema = t.Object({
  object: t.Literal("printing"),
  id: t.String({ description: "RiftCodex Mongo ObjectId" }),
  oracle_id: t.String({ description: "UUID of the oracle this prints" }),

  set: t.Optional(CardSetSchema),
  collector_number: t.Optional(t.String()),
  collector_label: t.Optional(
    t.String({ description: "Display form, e.g. `21★` or `12a`" }),
  ),
  rarity: t.Optional(
    t.String({
      description:
        "Printing-level: TCGPlayer treats Showcase as a rarity while RiftCodex reports the base card's.",
    }),
  ),
  released_at: t.Optional(t.String()),
  artist: t.Optional(t.String()),
  artist_id: t.Optional(t.String()),
  flavour_text: t.Optional(t.String()),

  finishes: t.Array(t.String()),
  signature: t.Boolean(),
  alternate_art: t.Boolean(),
  overnumbered: t.Boolean(),
  special_collection: t.Boolean(),

  image: t.Optional(PrintingImageSchema),
  image_orientation: t.Optional(t.String()),
  image_alt_text: t.Optional(t.String()),

  prices: t.Optional(CardPricesSchema),
  purchase_uris: t.Optional(CardPurchaseUrisSchema),

  external_ids: t.Optional(
    t.Partial(
      t.Object({
        riftcodex_id: t.String(),
        riftbound_id: t.String(),
        tcgplayer_id: t.String(),
        cardmarket_id: t.String(),
      }),
    ),
  ),

  public_slug: t.String({
    description:
      "Stable public URL path, no leading slash — e.g. `ogn/12a/signature/sun-disc`.",
  }),
  riftseer_uri: t.Optional(t.String()),
  differs_from_oracle: t.Optional(
    t.Boolean({
      description:
        "True when this printing carries a delta from its oracle. The resolved values are already applied.",
    }),
  ),

  source: t.Optional(t.UnionEnum(["riftcodex", "manual"])),
  updated_at: t.Optional(t.String()),
  ingested_at: t.Optional(t.String()),
});

export const OracleSchema = t.Object({
  object: t.Literal("oracle"),
  id: t.String({ description: "Stable UUID" }),
  oracle_key: t.String({
    description: "Name-derived lookup key. Not the identity — `id` is.",
  }),
  slug: t.String({ description: "Oracle-level public URL segment" }),
  name: t.String(),
  name_normalized: t.String(),

  card_type: t.Optional(t.String()),
  supertype: t.Optional(t.Nullable(t.String())),
  is_token: t.Boolean(),

  energy: t.Optional(t.Nullable(t.Number())),
  might: t.Optional(t.Nullable(t.Number())),
  power: t.Optional(t.Nullable(t.Number())),
  might_bonus: t.Optional(
    t.Nullable(
      t.Number({
        description:
          "Equipment only, where `0` is a real printed value. Test presence, never truthiness.",
      }),
    ),
  ),

  text: t.Optional(OracleTextSchema),

  keywords: t.Array(t.String(), {
    description: "`[Keyword]` base keys (`deflect`, not `Deflect 3`).",
  }),
  tags: t.Array(t.String()),
  domains: t.Array(t.String()),
  meta_flags: t.Array(t.String(), {
    description: "Searchable `is:` flags that are not printed on the card.",
  }),

  relationships: t.Optional(OracleRelationshipsSchema),

  preferred_printing: t.Optional(PrintingSchema),
  printings: t.Optional(t.Array(PrintingSchema)),

  source: t.Optional(t.UnionEnum(["riftcodex", "manual"])),
  riftseer_uri: t.Optional(t.String()),
  updated_at: t.Optional(t.String()),
});

// ─── Rulings, legalities, formats ─────────────────────────────────────────────

export const LegalityStatusSchema = t.UnionEnum([
  "legal",
  "restricted",
  "not_legal",
  "banned",
]);

const ViolationSeveritySchema = t.UnionEnum(["none", "warning", "error"]);

const FormatZoneRuleSchema = t.Object({
  zone: t.UnionEnum([...DECK_ZONES]),
  min_count: t.Nullable(t.Number()),
  max_count: t.Nullable(t.Number()),
  copy_limit: t.Nullable(t.Number({
    description: "Copies of one oracle across this zone's whole counting group.",
  })),
});

export const FormatSchema = t.Object({
  object: t.Literal("format"),
  id: t.String(),
  code: t.String({ description: "Stable lowercase handle, e.g. `standard`" }),
  name: t.String(),
  sort_order: t.Number({ description: "Display order, ascending" }),
  active: t.Boolean({
    description: "False for retired formats; they are omitted from public lists.",
  }),
  zone_rules: t.Array(FormatZoneRuleSchema, {
    description:
      "What this format demands of each zone. An empty array constrains nothing. " +
      "Public because a signed-out builder validates its deck in the browser.",
  }),
  severity_overrides: t.Partial(
    t.Object({
      legal: ViolationSeveritySchema,
      restricted: ViolationSeveritySchema,
      not_legal: ViolationSeveritySchema,
      banned: ViolationSeveritySchema,
    }),
    {
      description:
        "Per-format departures from the default status→severity mapping. " +
        "A status absent here falls through to the default.",
    },
  ),
});

export const CardLegalitySchema = t.Object({
  object: t.Literal("card_legality"),
  format_id: t.String(),
  format_code: t.String(),
  format_name: t.String(),
  status: LegalityStatusSchema,
  scope: t.UnionEnum(["printing", "oracle", "default"], {
    description:
      "Which layer decided the status: this printing's override, the oracle row, or the default (legal).",
  }),
  note: t.Optional(
    t.Nullable(
      t.String({
        description:
          "The admin's explanation, from whichever row decided the status.",
      }),
    ),
  ),
  updated_at: t.Optional(t.String()),
});

export const CardRulingSchema = t.Object({
  object: t.Literal("card_ruling"),
  id: t.String(),
  type: t.UnionEnum(["ruling", "note"]),
  text: t.String(),
  dated: t.Optional(t.String()),
  source: t.Optional(t.String()),
  scope: t.Optional(
    t.UnionEnum(["printing", "oracle", "rule"], {
      description:
        "How the entry reached the card: this printing, the oracle, or a query-scoped rule.",
    }),
  ),
  created_at: t.Optional(t.String()),
  updated_at: t.Optional(t.String()),
});

// ─── Detail and resolution ────────────────────────────────────────────────────

export const OracleDetailSchema = t.Object({
  object: t.Literal("oracle_detail"),
  oracle: OracleSchema,
  printing: PrintingSchema,
  printings: t.Array(PrintingSchema, {
    description: "Every printing of this oracle, oldest set first.",
  }),
  tokens: t.Array(OracleRefSchema),
  used_by: t.Array(OracleRefSchema),
  characters: t.Array(OracleRefSchema),
  signatures: t.Array(OracleRefSchema),
  purchase: CardPurchaseUrisSchema,
  rulings: t.Array(CardRulingSchema),
  legalities: t.Array(CardLegalitySchema, {
    description:
      "One entry per active format, already resolved through printing → oracle → default legal.",
  }),
});

export const CardRequestSchema = t.Object({
  raw: t.String(),
  name: t.String(),
  set: t.Optional(t.String()),
  collector: t.Optional(t.String()),
});

export const ResolvedCardSchema = t.Object({
  request: CardRequestSchema,
  oracle: t.Nullable(OracleSchema),
  printing: t.Nullable(PrintingSchema),
  matchType: t.UnionEnum(["exact", "fuzzy", "not-found"]),
  score: t.Optional(t.Number()),
});

export const ErrorSchema = t.Object({
  error: t.String(),
  code: t.String(),
});

// ─── Drift assertions ─────────────────────────────────────────────────────────

type _MirrorsOracleRef = Assert<
  Mirrors<Static<typeof OracleRefSchema>, OracleRef>
>;
type _MirrorsPrinting = Assert<Mirrors<Static<typeof PrintingSchema>, Printing>>;
type _MirrorsOracle = Assert<Mirrors<Static<typeof OracleSchema>, Oracle>>;
type _MirrorsPrices = Assert<Mirrors<Static<typeof CardPricesSchema>, CardPrices>>;
type _MirrorsPurchase = Assert<
  Mirrors<Static<typeof CardPurchaseUrisSchema>, CardPurchaseUris>
>;
type _MirrorsFormat = Assert<Mirrors<Static<typeof FormatSchema>, Format>>;
type _MirrorsLegality = Assert<
  Mirrors<Static<typeof CardLegalitySchema>, CardLegality>
>;
type _MirrorsRuling = Assert<Mirrors<Static<typeof CardRulingSchema>, CardRuling>>;
type _MirrorsDetail = Assert<
  Mirrors<Static<typeof OracleDetailSchema>, OracleDetail>
>;
type _MirrorsRequest = Assert<
  Mirrors<Static<typeof CardRequestSchema>, CardRequest>
>;
type _MirrorsResolved = Assert<
  Mirrors<Static<typeof ResolvedCardSchema>, ResolvedCard>
>;

