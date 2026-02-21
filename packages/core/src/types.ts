// ─── Normalised card shape ─────────────────────────────────────────────────────
// This is the canonical Card type used everywhere in the app.
// Provider implementations map their raw upstream schemas to this type.

export interface Card {
  /** Stable unique identifier (UUID from RiftCodex, or Riot's ID later). */
  id: string;
  /** Display name as it appears on the card. */
  name: string;
  /** Lower-cased, punctuation-stripped name for index lookups. */
  normalizedName: string;
  /** Short set code, e.g. "OGN", "SFD". */
  setCode?: string;
  /** Human-readable set name, e.g. "Origins". */
  setName?: string;
  /** Collector/print number within the set. */
  collectorNumber?: string;
  /** Primary card art image URL (hosted by Riot CDN). */
  imageUrl?: string;
  /** Plain-text card rules text (symbols replaced with tokens like :rb_exhaust:). */
  text?: string;
  /** Optional effect text (e.g. for Equipment/Gear: bonus while equipped). */
  effect?: string;
  /** Energy cost to play the card. */
  cost?: number;
  /** Card type line, e.g. "Unit", "Gear", "Spell". */
  typeLine?: string;
  /** Optional supertype, e.g. "Champion". */
  supertype?: string | null;
  /** Rarity string: "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary". */
  rarity?: string;
  /** Domains/regions the card belongs to, e.g. ["Fury"]. */
  domains?: string[];
  /** Might stat (unit's defense-side stat). */
  might?: number | null;
  /** Power stat (unit's attack-side stat). */
  power?: number | null;
  /** Card tags, e.g. ["Poro"]. */
  tags?: string[];
  /** Artist who illustrated the card. */
  artist?: string;
  /** Whether this is an alternate art printing. */
  alternateArt?: boolean;
  /** Whether this is an overnumbered printing (collector number beyond the base set count). */
  overnumbered?: boolean;
  /** Whether this is a signed/autographed printing. */
  signature?: boolean;
  /** Display orientation: "portrait" (vertical) or "landscape" (horizontal, e.g. Battlefields). */
  orientation?: string;
  /** Provider-specific raw data (for debugging; not sent to clients by default). */
  raw?: Record<string, unknown>;
}

// ─── V2 nested Card schema ─────────────────────────────────────────────────────
// Introduced in MR4 alongside the existing flat Card type.
// API responses will flip to CardV2 in MR7 once the Supabase provider (MR6) is live.
// Mirrors the Postgres schema in supabase/migrations/20260221000000_initial_schema.sql.

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

export interface CardV2ExternalIds {
  riftcodex_id?: string;
  riftbound_id?: string;
  tcgplayer_id?: string;
}

export interface CardV2Set {
  set_code: string;
  set_id?: string;
  set_name: string;
  set_uri?: string;
  set_search_uri?: string;
}

export interface CardV2Rulings {
  rulings_id?: string;
  rulings_uri?: string;
}

export interface CardV2Attributes {
  /** Energy cost to play the card. */
  energy?: number | null;
  /** Might stat (unit's defense-side). */
  might?: number | null;
  /** Power stat (unit's attack-side). */
  power?: number | null;
}

export interface CardV2Classification {
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

export interface CardV2Text {
  /** Rich text with inline symbol tokens (e.g. :rb_exhaust:). */
  rich?: string;
  /** Plain-text rules text with symbols replaced by readable tokens. */
  plain?: string;
  /** Flavour / lore text if available. */
  flavour?: string;
}

export interface CardV2Metadata {
  /** Print finishes available, e.g. ["Normal", "Foil"]. */
  finishes?: string[];
  signature?: boolean;
  overnumbered?: boolean;
  alternate_art?: boolean;
}

export interface CardV2MediaUrls {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
}

export interface CardV2Media {
  /** Display orientation: "portrait" (vertical) or "landscape" (horizontal). */
  orientation?: string;
  accessibility_text?: string;
  media_urls?: CardV2MediaUrls;
}

export interface CardV2PurchaseUris {
  cardmarket?: string;
  tcgplayer?: string;
}

export interface CardV2Prices {
  usd?: number | null;
  usd_foil?: number | null;
  eur?: number | null;
  eur_foil?: number | null;
}

/** Nested card shape used by the Supabase provider (MR6+) and the ingestion pipeline (MR5+). */
export interface CardV2 {
  object: "card";
  /** Stable UUID (matches Postgres cards.id). */
  id: string;
  name: string;
  /** Lowercased, punctuation-stripped name — used for in-memory index lookups. */
  name_normalized: string;
  released_at?: string;
  collector_number?: string;
  external_ids?: CardV2ExternalIds;
  set?: CardV2Set;
  rulings?: CardV2Rulings;
  attributes?: CardV2Attributes;
  classification?: CardV2Classification;
  text?: CardV2Text;
  artist?: string;
  artist_id?: string;
  metadata?: CardV2Metadata;
  media?: CardV2Media;
  purchase_uris?: CardV2PurchaseUris;
  prices?: CardV2Prices;
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
  card: CardV2 | null;
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
