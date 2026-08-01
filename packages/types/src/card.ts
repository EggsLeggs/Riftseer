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
  /** Absolute public site URL for the referenced card. Computed at response time. */
  riftseer_uri?: string;
  /** Set code for printing siblings — populated on related_printings stubs. */
  set_code?: string;
  collector_number?: string;
  /** Release date used to order printings (from set or card). */
  published_on?: string;
  alternate_art?: boolean;
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
  /** ISO date the set was published, e.g. "2024-11-15". */
  published_on?: string;
  /** Total number of cards in this set. */
  card_count?: number;
}

// ─── Rulings, legalities and formats ──────────────────────────────────────────

/**
 * A tournament / play format, e.g. `{ code: "standard", name: "Standard" }`.
 * Formats are system-wide and admin-managed; `sort_order` fixes display order
 * and `active` hides a retired format without deleting its legality rows.
 */
export interface Format {
  object: "format";
  id: string;
  code: string;
  name: string;
  sort_order: number;
  active: boolean;
}

/**
 * Legality status for one card in one format. Absence of any stored row means
 * `legal` — only non-legal statuses are persisted.
 */
export type CardLegalityStatus = "legal" | "not_legal" | "banned";

/**
 * A card's resolved legality in one format.
 *
 * Read precedence is printing override → oracle-level row → default `legal`.
 * `scope` says which of those decided this entry, so an editor can show whether
 * the status came from the shared card or from this specific printing.
 */
export interface CardLegality {
  object: "card_legality";
  format_id: string;
  format_code: string;
  format_name: string;
  status: CardLegalityStatus;
  /** Which layer decided `status`. */
  scope: "printing" | "oracle" | "default";
  updated_at?: string;
}

/**
 * An official ruling or an editorial note attached to a card.
 *
 * A ruling is written once and pointed at any number of targets — a single
 * printing, a whole card (its oracle group), or a saved search query that keeps
 * matching cards as new ones are released. `scope` reports which of those
 * brought this entry onto the card being viewed.
 */
export interface CardRuling {
  object: "card_ruling";
  id: string;
  type: "ruling" | "note";
  text: string;
  /** ISO date the ruling was issued, e.g. "2026-03-14". */
  dated?: string;
  /** Free-text provenance, e.g. a rules-team URL or document name. */
  source?: string;
  /**
   * How this entry reached the card:
   * - `printing` — written for this exact printing
   * - `oracle` — written for the card, shared by every printing
   * - `rule` — matched by a query-scoped ruling (e.g. "every unit with
   *   [Deathknell]"), so it applies until the card stops matching
   *
   * A ruling reachable by several targets reports the most specific one.
   */
  scope?: "printing" | "oracle" | "rule";
  created_at?: string;
  updated_at?: string;
}

export interface CardAttributes {
  /** Energy cost to play the card. */
  energy?: number | null;
  /** Might stat (unit's defense-side). */
  might?: number | null;
  /** Power stat (unit's attack-side). */
  power?: number | null;
  /**
   * Might an `[Equip]` Gear grants the unit it is attached to. Present only on
   * equipment, where `0` is a real printed value — absent means "not
   * equipment", not "grants nothing".
   */
  might_bonus?: number | null;
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
  /**
   * The effect an `[Equip]` Gear grants the unit it is attached to, in the same
   * vocabulary as `plain`. Sits alongside `attributes.might_bonus`; an
   * equipment whose bonus is its whole effect has the bonus and no text here.
   */
  equipment?: string;
}

export interface CardMetadata {
  /** Print finishes available, e.g. ["Normal", "Foil"]. */
  finishes?: string[];
  signature?: boolean;
  overnumbered?: boolean;
  alternate_art?: boolean;
  /**
   * Printed on a numbered track separate from the main set, e.g. Vendetta's
   * `SP1`–`SP6` showcase champions. Like `overnumbered` and `alternate_art`,
   * this describes the printing rather than the card.
   */
  special_collection?: boolean;
}

export interface CardMediaUrls {
  small?: string;
  normal?: string;
  large?: string;
  /** Original source bytes re-hosted without transcoding. */
  original?: string;
  png?: string;
}

export interface CardMedia {
  /** Display orientation: "portrait" (vertical) or "landscape" (horizontal). */
  orientation?: string;
  accessibility_text?: string;
  media_urls?: CardMediaUrls;
  /** Best upstream image selected for the current printing. */
  source_url?: string;
  /** SHA-256 of source_url, used to make image hosting idempotent. */
  source_hash?: string;
  /** Provenance of source_url. Admin images are not replaced by ingest. */
  source_provider?: "riftcodex" | "tcgplayer" | "admin";
}

export interface CardPurchaseUris {
  cardmarket?: string;
  tcgplayer?: string;
}

export interface CardPriceEntry {
  normal?: number | null;
  foil?: number | null;
  low_normal?: number | null;
  low_foil?: number | null;
}

export interface CardPrices {
  tcgplayer?: CardPriceEntry;
  cardmarket?: CardPriceEntry;
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
  /**
   * Name-derived grouping key shared by every printing of this card — see
   * `oracleKeyForName` in `./oracle.ts`. Rulings and format legalities hang off
   * this key so they are authored once and inherited by all printings.
   */
  oracle_key?: string;
  /**
   * `[Keyword]` tags carried by this printing's rules text, as base keys
   * (`"deflect"`, not `"Deflect 3"`) — see `extractCardKeywords` in
   * `./keywords.ts`. Derived at ingest and stored so `kw:` search filters and
   * keyword-scoped ruling rules can be indexed rather than scanning text.
   */
  keywords?: string[];
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
  /**
   * Provenance of the row: "riftcodex" (ingested from upstream, eligible for the
   * ingest prune) or "manual" (admin-authored, never pruned). Defaults to
   * "riftcodex" when unset.
   */
  source?: "riftcodex" | "manual";
  /** Related token/part cards produced or referenced by this card. */
  all_parts: RelatedCard[];
  /** Non-token cards that create or reference this card (populated on tokens). */
  used_by: RelatedCard[];
  /** Champion cards linked to this legend by a shared tag (populated on legends). */
  related_champions: RelatedCard[];
  /** Legend cards linked to this champion by a shared tag (populated on champions). */
  related_legends: RelatedCard[];
  /**
   * Signature cards (supertype "Signature") tied to this legend/champion by a
   * shared character tag (populated on legends and champions). The reverse link
   * lives on the signature card's related_legends / related_champions.
   */
  related_signatures: RelatedCard[];
  /** Other printings/art variants of the same card. */
  related_printings: RelatedCard[];
  /**
   * Stable public URL path (no leading slash), e.g. "ogn/12a/signature/sun-disc".
   * Set on first ingest and never overwritten so links don't drift.
   */
  public_slug?: string;
  /**
   * Absolute public site URL, e.g. "https://riftseer.com/card/ogn/12a/signature/sun-disc".
   * Computed at response time from public_slug + the configured site origin.
   */
  riftseer_uri?: string;
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

/** The result of resolving a CardRequest against the card provider. */
export interface ResolvedCard {
  request: CardRequest;
  /** The matched card, or null if not found. */
  card: Card | null;
  /** How the card was matched. */
  matchType: "exact" | "fuzzy" | "not-found";
  /** Optional relevance score when matchType === "fuzzy" (if the provider supplies one). */
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
  /** Skip this many matching cards before returning results (0-based). Default: 0. */
  offset?: number;
  /** When true, skip deduplication and return all printings. Default: false. */
  unique?: boolean;
}

/** Paged name search: `cards` is one page; `total` is the full match count. */
export interface CardSearchResult {
  cards: Card[];
  /** Total matches for this query (across all pages), after name-dedup ranking. */
  total: number;
}

// ─── Deck interfaces ────────────────────────────────────────────────────────────

export interface SimplifiedDeck {
    id: string | null;
    legendId: string | null;
    chosenChampionId: string | null;
    /** The following 3 arrays contain strings of form "cardId:quantity" */
    mainDeck: string[];
    sideboard: string[];
    runes: string[];
    /** This one just contains the ids since battlegrounds are unique */
    battlegrounds: string[];
}
