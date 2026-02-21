// ─── Card schema ───────────────────────────────────────────────────────────────
// Canonical nested card type. Mirrors Postgres schema in supabase/migrations.

/** A card referenced inside all_parts or used_by (e.g. a token). */
export interface RelatedCard {
  object: "related_card";
  /** UUID of the referenced card. */
  id: string;
  name: string;
  /** Relationship role, e.g. "token", "meld_part". */
  component: string;
  /** API URI for the referenced card, e.g. /api/v1/cards/:id */
  uri?: string;
}

export interface CardExternalIds {
  riftcodex_id?: string;
  riftbound_id?: string;
  tcgplayer_id?: string;
}

export interface CardSet {
  set_code: string;
  set_id?: string;
  set_name: string;
  set_uri?: string;
  set_search_uri?: string;
}

export interface CardRulings {
  rulings_id?: string;
  rulings_uri?: string;
}

export interface CardAttributes {
  /** Energy cost to play the card. */
  energy?: number | null;
  /** Might stat (unit's defense-side). */
  might?: number | null;
  /** Power stat (unit's attack-side). */
  power?: number | null;
}

export interface CardClassification {
  /** Card type line, e.g. "Unit", "Gear", "Spell". */
  type?: string;
  /** Optional supertype, e.g. "Champion". */
  supertype?: string | null;
  /** Rarity string, e.g. "Common", "Rare", "Legendary". */
  rarity?: string;
  /** Card tags, e.g. ["Poro"]. */
  tags?: string[];
  /** Domains/regions the card belongs to, e.g. ["Fury"]. */
  domains?: string[];
}

export interface CardText {
  /** Rich text with inline symbol tokens (e.g. :rb_exhaust:). */
  rich?: string;
  /** Plain-text rules text with symbols replaced by readable tokens. */
  plain?: string;
  /** Flavour / lore text if available. */
  flavour?: string;
}

export interface CardMetadata {
  /** Print finishes available, e.g. ["Normal", "Foil"]. */
  finishes?: string[];
  signature?: boolean;
  overnumbered?: boolean;
  alternate_art?: boolean;
}

export interface CardMediaUrls {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
}

export interface CardMedia {
  /** Display orientation: "portrait" (vertical) or "landscape" (horizontal). */
  orientation?: string;
  accessibility_text?: string;
  media_urls?: CardMediaUrls;
}

export interface CardPurchaseUris {
  cardmarket?: string;
  tcgplayer?: string;
}

export interface CardPrices {
  usd?: number | null;
  usd_foil?: number | null;
  eur?: number | null;
  eur_foil?: number | null;
}

export interface Card {
  object: "card";
  /** Stable UUID (matches Postgres cards.id). */
  id: string;
  name: string;
  /** Lowercased, punctuation-stripped name — used for in-memory index lookups. */
  name_normalized: string;
  released_at?: string;
  collector_number?: string;
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
  /** Related token/part cards produced or referenced by this card. */
  all_parts: RelatedCard[];
  /** Non-token cards that create or reference this card (populated on tokens). */
  used_by: RelatedCard[];
  updated_at?: string;
  ingested_at?: string;
}

// ─── Request / resolution types ───────────────────────────────────────────────

/** A parsed request from a [[Name|SET-123]] token. */
export interface CardRequest {
  /** The original text inside [[ ]]. */
  raw: string;
  /** Parsed card name (trimmed). */
  name: string;
  /** Optional set code parsed from the token. */
  set?: string;
  /** Optional collector number parsed from the token. */
  collector?: string;
}

/** The result of resolving a CardRequest against the provider's index. */
export interface ResolvedCard {
  request: CardRequest;
  /** The matched card, or null if not found. */
  card: Card | null;
  /** How the card was matched. */
  matchType: "exact" | "fuzzy" | "not-found";
  /** Fuse.js score when matchType === "fuzzy" (lower = better, 0 = perfect). */
  score?: number;
}

// ─── Search options ────────────────────────────────────────────────────────────

export interface CardSearchOptions {
  set?: string;
  collector?: string | number;
  /** Whether to fall back to fuzzy matching when no exact match is found. Default: true. */
  fuzzy?: boolean;
  /** Max results to return. Default: 10. */
  limit?: number;
}
