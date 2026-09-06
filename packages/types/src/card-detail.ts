// ─── Oracle detail view model ──────────────────────────────────────────────────
//
// Aggregate payload behind the public card page, assembled server-side so the
// client renders from a single response.
//
// This got materially simpler with real oracles: the related lists are now
// oracle edges, already one row per card, so there is nothing to deduplicate
// by name. What used to be six stub arrays, a name-based grouping pass and a
// per-character ranking is three FK traversals.

import type {
  CardLegality,
  CardPurchaseUris,
  CardRuling,
  Oracle,
  OracleRef,
  Printing,
} from "./card.ts";

export interface OracleDetail {
  object: "oracle_detail";
  /** The rules object, with `relationships` populated. */
  oracle: Oracle;
  /**
   * The printing this page is about: the one the caller asked for, or the
   * oracle's preferred printing.
   */
  printing: Printing;
  /** Every printing of this oracle, oldest set first, including `printing`. */
  printings: Printing[];

  /** Token oracles this card creates. */
  tokens: OracleRef[];
  /** Cards that create this token — the reverse edge. */
  used_by: OracleRef[];
  /** The same character in another role (a legend's champions, or the reverse). */
  characters: OracleRef[];
  /** Signature cards tied to this legend/champion, or its owner read from the signature. */
  signatures: OracleRef[];

  /** Resolved marketplace links, falling back to search URLs when no product id exists. */
  purchase: CardPurchaseUris;
  /**
   * Rulings and notes reaching this printing: everything scoped to the oracle,
   * anything scoped to this printing, and every rule that matches it — oldest
   * first.
   */
  rulings: CardRuling[];
  /**
   * One entry per active format, in format sort order, with the status already
   * resolved through printing → oracle → default legal.
   */
  legalities: CardLegality[];
}
