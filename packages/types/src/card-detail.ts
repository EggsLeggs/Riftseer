// ─── Card detail view model ────────────────────────────────────────────────────
// Aggregate payload behind the public card page. Related-card stubs are expanded
// into printing summaries, sorted and deduplicated server-side so clients render
// the page from a single response.

import type {
  Card,
  CardLegality,
  CardPrices,
  CardPurchaseUris,
  CardRuling,
} from "./card.ts";

/**
 * A related printing rendered in a table or list — enough to display a row and
 * link to it, without the full card payload.
 */
export interface CardPrintingSummary {
  object: "card_printing";
  id: string;
  name: string;
  public_slug?: string;
  riftseer_uri?: string;
  set_code?: string;
  set_name?: string;
  collector_number?: string;
  /** Collector number with its variant marker, e.g. "12a" or "21★". */
  collector_label?: string;
  rarity?: string;
  type?: string;
  /** Energy cost to play the card. */
  energy?: number | null;
  /** Power cost / domain requirement. */
  power?: number | null;
  is_token: boolean;
  alternate_art?: boolean;
  signature?: boolean;
  image_small?: string;
  prices?: CardPrices;
  purchase_uris?: CardPurchaseUris;
  /** True for the printing currently being viewed. */
  is_current?: boolean;
}

export interface CardDetail {
  object: "card_detail";
  card: Card;
  /** All printings of this card including the current one, oldest set first. */
  printings: CardPrintingSummary[];
  /** Token cards this card creates. */
  tokens: CardPrintingSummary[];
  /** Cards that create this token — one preferred printing per card. */
  used_by: CardPrintingSummary[];
  /** Champions sharing a tag with this legend, one row per distinct champion. */
  champions: CardPrintingSummary[];
  /** Legends sharing a tag with this champion, one row per distinct legend. */
  legends: CardPrintingSummary[];
  /** Signature cards tied to this legend/champion, one row per distinct signature. */
  signatures: CardPrintingSummary[];
  /** Resolved marketplace links, falling back to search URLs when no product id exists. */
  purchase: CardPurchaseUris;
  /**
   * Rulings and notes for this printing: everything shared across the card's
   * printings plus anything scoped to this one, oldest first.
   */
  rulings: CardRuling[];
  /**
   * One entry per active format, in format sort order, with the status already
   * resolved through printing override → oracle → default legal.
   */
  legalities: CardLegality[];
}
