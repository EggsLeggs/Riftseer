/**
 * The shapes the ingest pipeline works in.
 *
 * Upstream hands us *printings*: one row per physical card, carrying the rules
 * object's fields inline. Oracles do not exist upstream — they are derived here
 * by grouping printings that share a name (see `pipeline/oracles.ts`). So an
 * `IngestPrinting` holds both levels: the printing-level facts that are its own,
 * and the oracle-level facts **as observed on that printing**. Where the members
 * of a group disagree about an oracle-level fact, the majority wins and the
 * dissenters get a `PrintingDelta`.
 *
 * These are deliberately not `Oracle`/`Printing` from `@riftseer/types`: those
 * are the API's response shapes, resolved and decorated. What travels here is
 * flat and matches the `ingest_catalogue` payload column-for-column.
 */

import type { CardImageSourceProvider } from "../images/types.ts";

export interface IngestSet {
  set_code: string;
  set_name: string;
  set_uri?: string;
  set_search_uri?: string;
  /** ISO date string, e.g. "2024-11-15". */
  published_on?: string | null;
  is_promo: boolean;
  /** Parent set code, e.g. "OGN" for an organized-play promo set. */
  parent_set_code?: string | null;
  riftcodex_set_id?: string;
  tcgplayer_group_id?: number;
  cardmarket_id?: string;
}

export interface IngestPrinting {
  /** RiftCodex Mongo ObjectId. */
  id: string;

  // ── Oracle-level, as observed on this printing ───────────────────────────
  name: string;
  name_normalized: string;
  card_type?: string;
  supertype?: string;
  is_token: boolean;
  energy: number | null;
  might: number | null;
  power: number | null;
  text_rich?: string;
  text_plain?: string;
  tags: string[];
  domains: string[];

  // ── Printing-level ───────────────────────────────────────────────────────
  set_code?: string;
  artist?: string;
  collector_number?: string;
  released_at?: string;
  rarity?: string;
  flavour_text?: string;
  finishes: string[];
  is_signature: boolean;
  is_alternate_art: boolean;
  is_overnumbered: boolean;
  is_special_collection: boolean;

  riftcodex_id?: string;
  riftbound_id?: string;
  tcgplayer_id?: string;
  cardmarket_id?: string;
  /**
   * True when an admin has claimed this printing's TCGPlayer link. It wins any
   * contention for the product and is never shed — the confirmation is the
   * whole point of the review queue.
   */
  tcgplayer_id_locked?: boolean;

  image_source_url?: string;
  image_source_hash?: string;
  image_source_provider?: CardImageSourceProvider;
  image_orientation?: string;
  image_alt_text?: string;

  price_normal?: number | null;
  price_foil?: number | null;
  price_low_normal?: number | null;
  price_low_foil?: number | null;
  tcgplayer_url?: string;
  cardmarket_url?: string;
}

/** The oracle-level fields an `IngestOracle` decides for its group. */
export interface IngestOracleFields {
  name: string;
  name_normalized: string;
  card_type?: string;
  supertype?: string;
  is_token: boolean;
  energy: number | null;
  might: number | null;
  power: number | null;
  /**
   * Official-gallery only, and written straight onto the oracle rather than
   * compared across printings — RiftCodex has no field for it, so every
   * printing would "disagree" by being silent. `0` is a real printed value:
   * test presence, never truthiness.
   */
  might_bonus?: number | null;
  equipment_text?: string;
  text_rich?: string;
  text_plain?: string;
  tags: string[];
  domains: string[];
}

export interface IngestOracle extends IngestOracleFields {
  /** Name-derived matching key — `oracleKeyForName`. Not the identity. */
  oracle_key: string;
  /** Every printing that grouped here, in id order. */
  printings: IngestPrinting[];
}

/**
 * One printing's departure from its oracle. Mirrors `printing_deltas`: arrays
 * add and remove, scalars override, and `cleared_fields` is the only way to say
 * "this printing has none" — a NULL override means inherit.
 */
export interface PrintingDelta {
  printing_id: string;
  tags_added?: string[];
  tags_removed?: string[];
  domains_added?: string[];
  domains_removed?: string[];
  name_override?: string;
  card_type_override?: string;
  supertype_override?: string;
  energy_override?: number;
  might_override?: number;
  power_override?: number;
  text_rich_override?: string;
  text_plain_override?: string;
  cleared_fields?: string[];
}

/** An oracle → oracle edge. The reverse direction is a query, never a row. */
export interface OracleEdge {
  from_oracle_key: string;
  to_oracle_key: string;
  kind: "makes_token" | "character" | "signature";
}

/**
 * Printings of one card that state different things about the card itself.
 * Reported rather than swallowed: most are genuine upstream data errors, and a
 * delta that nobody looks at is indistinguishable from a bug.
 */
export interface OracleDivergence {
  oracle_key: string;
  field: string;
  chosen: string;
  dissenting: Array<{ printing_id: string; value: string }>;
}
