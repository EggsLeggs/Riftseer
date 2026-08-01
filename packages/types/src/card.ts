// ─── Card schema ───────────────────────────────────────────────────────────────
//
// Two levels, mirroring supabase/migrations/20260810000000_oracle_printing_baseline.sql.
//
//   Oracle    The rules object. Not a physical card. Everything true of the
//             card regardless of which piece of cardboard you hold.
//   Printing  One physical card: art, artist, flavour, rarity, collector
//             number, set, finishes, marketplace data.
//
// A field belongs to exactly one of them. If you find yourself wanting to put
// a printing field on the oracle "for convenience", that is the mistake this
// split exists to stop.

/**
 * A reference to another oracle — the shape relationships travel in.
 *
 * This replaces the six denormalised stub arrays the flat card model carried,
 * four of which were reverse views of the other two.
 */
export interface OracleRef {
  object: "oracle_ref";
  /** UUID of the referenced oracle. */
  id: string;
  name: string;
  /** Oracle-level public slug, e.g. "brush". */
  slug: string;
  /** API URI, e.g. /api/v1/cards/:id */
  uri?: string;
  /** Absolute public site URL. Computed at response time, never persisted. */
  riftseer_uri?: string;
  /** Small image of the referenced oracle's preferred printing, when known. */
  image_small?: string;
}

export interface CardSet {
  set_code: string;
  set_id?: string;
  set_name: string;
  set_uri?: string;
  set_search_uri?: string;
  /** ISO date the set was published, e.g. "2024-11-15". */
  published_on?: string;
  /** Total number of printings in this set. */
  card_count?: number;
  is_promo?: boolean;
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
 * `legal` — only non-legal statuses are persisted at oracle level.
 */
export type CardLegalityStatus = "legal" | "not_legal" | "banned";

/**
 * A resolved legality in one format.
 *
 * Read precedence is printing row → oracle row → default `legal`. `scope` says
 * which of those decided this entry, so an editor can show whether the status
 * came from the card or from this specific printing.
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
 * An official ruling or an editorial note.
 *
 * A ruling is written once and pointed at any number of targets — a single
 * printing, a whole oracle, or a saved search query that keeps matching cards
 * as new ones are released. `scope` reports which of those brought this entry
 * onto the card being viewed.
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

// ─── Oracle ───────────────────────────────────────────────────────────────────

export interface OracleText {
  /** Rich text with inline symbol tokens (e.g. :rb_exhaust:). */
  rich?: string;
  /** Plain-text rules text with symbols replaced by readable tokens. */
  plain?: string;
  /**
   * The effect an `[Equip]` Gear grants the unit it is attached to, in the
   * same vocabulary as `plain`. Sits alongside `might_bonus`; an equipment
   * whose bonus is its whole effect has the bonus and no text here.
   */
  equipment?: string;
}

/** The kinds of edge an oracle can have. Each is stored once, not per printing. */
export interface OracleRelationships {
  /** Token oracles this card creates. */
  makes_tokens: OracleRef[];
  /** Cards that create this token — the reverse of `makes_tokens`. */
  used_by: OracleRef[];
  /**
   * The same character in another role: a legend's champions, or a champion's
   * legends. One undirected pairing, read from whichever side you are on.
   */
  characters: OracleRef[];
  /**
   * Signature cards tied to this legend/champion, or — read from the signature
   * card — the legend/champion it belongs to.
   */
  signatures: OracleRef[];
}

export interface Oracle {
  object: "oracle";
  /** Stable UUID. Printings reference this, not the name-derived key. */
  id: string;
  /**
   * Name-derived lookup slug — see `oracleKeyForName` in `./oracle.ts`. Stable
   * and unique, but NOT the identity: it is how ingest guesses which oracle a
   * new printing belongs to, and nothing more.
   */
  oracle_key: string;
  /** Oracle-level public URL segment, e.g. "brush". Pinned on creation. */
  slug: string;
  name: string;
  /** Lowercased, punctuation-stripped name — used for exact-match lookup. */
  name_normalized: string;

  /** Card type line, e.g. "Unit", "Gear", "Spell", "Legend". */
  card_type?: string;
  /** Optional supertype, e.g. "Champion", "Rune", "Battleground". */
  supertype?: string | null;
  /**
   * A token has a `card_type` (Unit, Gear, Battlefield) *and* is a token, so
   * this is orthogonal to `card_type` rather than a value of it.
   */
  is_token: boolean;

  /** Energy cost to play the card. */
  energy?: number | null;
  /** Might stat (unit's defence side). */
  might?: number | null;
  /** Power stat (unit's attack side). */
  power?: number | null;
  /**
   * Might an `[Equip]` Gear grants the unit it is attached to. Present only on
   * equipment, where `0` is a real printed value — absent means "not
   * equipment", not "grants nothing". Test presence, never truthiness.
   */
  might_bonus?: number | null;

  text?: OracleText;

  /**
   * `[Keyword]` tags carried by the rules text, as base keys (`"deflect"`, not
   * `"Deflect 3"`) — see `extractCardKeywords` in `./keywords.ts`. Derived by a
   * database trigger, so ingest, admin patches and manual creation stay in
   * sync without each remembering to recompute it.
   */
  keywords: string[];
  /** Card tags, e.g. ["Poro", "Sentinel"]. */
  tags: string[];
  /** Domains the card belongs to, e.g. ["Fury"]. */
  domains: string[];
  /**
   * Searchable `is:` flags that are not printed on the card. Extensible
   * without a schema change per flag.
   */
  meta_flags: string[];

  relationships?: OracleRelationships;

  /**
   * The printing to show when the caller did not ask for a specific one.
   * Computed by ingest from a deterministic ranking, overridable by an admin.
   */
  preferred_printing?: Printing;
  /** Every printing of this card, oldest set first. Included on detail reads. */
  printings?: Printing[];

  /**
   * Provenance: "riftcodex" (ingested upstream, eligible for the ingest prune)
   * or "manual" (admin-authored, never pruned).
   */
  source?: "riftcodex" | "manual";
  /** Absolute public site URL. Computed at response time, never persisted. */
  riftseer_uri?: string;
  updated_at?: string;
}

// ─── Printing ─────────────────────────────────────────────────────────────────

export interface PrintingImage {
  small?: string;
  normal?: string;
  large?: string;
  /** Original source bytes re-hosted without transcoding. */
  original?: string;
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

export interface Printing {
  object: "printing";
  /** RiftCodex Mongo ObjectId. Deck short-forms in the wild encode these. */
  id: string;
  /** The oracle this is a printing of. */
  oracle_id: string;

  set?: CardSet;
  collector_number?: string;
  /** Display form of the collector number, e.g. "21★" or "12a". */
  collector_label?: string;
  /**
   * Rarity is printing-level: TCGPlayer treats Showcase as a rarity while
   * RiftCodex and the official gallery report the base card's rarity on an
   * alternate-art or showcase printing. That disagreement is real.
   */
  rarity?: string;
  released_at?: string;
  artist?: string;
  artist_id?: string;
  flavour_text?: string;

  /** Print finishes available, e.g. ["Normal", "Foil"]. */
  finishes: string[];
  signature: boolean;
  alternate_art: boolean;
  overnumbered: boolean;
  /**
   * Printed on a numbered track separate from the main set, e.g. Vendetta's
   * `SP1`–`SP6` showcase champions.
   */
  special_collection: boolean;

  image?: PrintingImage;
  /** Display orientation: "portrait" (vertical) or "landscape" (horizontal). */
  image_orientation?: string;
  image_alt_text?: string;

  prices?: CardPrices;
  purchase_uris?: CardPurchaseUris;

  external_ids?: {
    riftcodex_id?: string;
    riftbound_id?: string;
    tcgplayer_id?: string;
    cardmarket_id?: string;
  };

  /**
   * Stable public URL path (no leading slash), e.g.
   * "ogn/12a/signature/sun-disc". Pinned on first ingest and never
   * overwritten, so links do not drift as upstream data is corrected.
   */
  public_slug: string;
  /** Absolute public site URL. Computed at response time, never persisted. */
  riftseer_uri?: string;

  /**
   * True when this printing carries a delta — it genuinely differs from its
   * oracle in some field. The resolved values are already applied to whatever
   * the caller reads; this only flags that a difference exists.
   */
  differs_from_oracle?: boolean;

  source?: "riftcodex" | "manual";
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

/**
 * The result of resolving a CardRequest.
 *
 * Resolution is an *oracle* lookup — "what is this card" — that also picks a
 * printing: the one the request named, or the oracle's preferred one.
 */
export interface ResolvedCard {
  request: CardRequest;
  oracle: Oracle | null;
  printing: Printing | null;
  matchType: "exact" | "fuzzy" | "not-found";
  /** Optional relevance score when matchType === "fuzzy". */
  score?: number;
}

// ─── Search options ────────────────────────────────────────────────────────────

/**
 * `unique` decides what a result row is:
 *
 *   "oracle"   one row per card, carrying its preferred printing (default)
 *   "prints"   one row per printing, for printing-level queries like
 *              `is:alternate` or a set/collector filter
 */
export type SearchUniqueMode = "oracle" | "prints";

export interface CardSearchOptions {
  set?: string;
  collector?: string | number;
  /** Fall back to fuzzy matching when no exact match is found. Default: true. */
  fuzzy?: boolean;
  /** Max results to return. Default: 10. */
  limit?: number;
  /** Skip this many matches before returning results (0-based). Default: 0. */
  offset?: number;
  unique?: SearchUniqueMode;
}

/** Paged oracle search: `oracles` is one page; `total` is the full match count. */
export interface OracleSearchResult {
  oracles: Oracle[];
  total: number;
}

/**
 * Paged printing search, used when `unique` is "prints".
 *
 * `oracles` carries the distinct owning cards for the returned printings, so a
 * client can render a type line or rules text without a second request per
 * row. It is a sibling list keyed by id rather than an embedded field because
 * a printing search typically returns many printings of few cards.
 */
export interface PrintingSearchResult {
  printings: Printing[];
  oracles: Oracle[];
  total: number;
}

// ─── Deck interfaces ────────────────────────────────────────────────────────────

/**
 * Decks identify cards by **printing** id, not oracle id: a deck list is a
 * list of physical cards, and short-form strings already in the wild encode
 * those ids.
 */
export interface SimplifiedDeck {
  id: string | null;
  legendId: string | null;
  chosenChampionId: string | null;
  /** The following 3 arrays contain strings of form "printingId:quantity" */
  mainDeck: string[];
  sideboard: string[];
  runes: string[];
  /** This one just contains the ids since battlegrounds are unique */
  battlegrounds: string[];
}
