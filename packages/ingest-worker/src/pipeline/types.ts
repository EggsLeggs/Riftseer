/**
 * Internal intermediate types for the ingest pipeline.
 * These are distinct from the public Card/CardSet types and carry
 * additional metadata used during reconciliation and enrichment.
 */

export interface IngestSet {
  set_code: string;
  set_name: string;
  set_uri?: string;
  set_search_uri?: string;
  /** ISO date string, e.g. "2024-11-15". */
  published_on?: string | null;
  /** True for sets that only exist in TCGPlayer (promo/bundle sets). */
  is_promo: boolean;
  /** Parent set code, e.g. "OGN" for promo sets derived from Origins. */
  parent_set_code?: string | null;
  external_ids: {
    /** RiftCodex set_id (stable, matches Card.set.set_code lowercased). */
    riftcodex_set_id?: string;
    /** TCGPlayer groupId. */
    tcgplayer_group_id?: number;
    /** CardMarket expansion ID. */
    cardmarket_id?: string;
  };
}
