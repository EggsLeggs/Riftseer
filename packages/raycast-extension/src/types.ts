/**
 * Local copy of card types from packages/core/src/types.ts.
 * Keep in sync with the source of truth when the Card shape changes.
 */

export interface RelatedCard {
  object: "related_card";
  id: string;
  name: string;
  component: string;
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

export interface CardAttributes {
  energy?: number | null;
  might?: number | null;
  power?: number | null;
}

export interface CardClassification {
  type?: string;
  supertype?: string | null;
  rarity?: string;
  tags?: string[];
  domains?: string[];
}

export interface CardText {
  rich?: string;
  plain?: string;
  flavour?: string;
}

export interface CardMetadata {
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
  id: string;
  name: string;
  name_normalized: string;
  released_at?: string;
  collector_number?: string;
  external_ids?: CardExternalIds;
  set?: CardSet;
  attributes?: CardAttributes;
  classification?: CardClassification;
  text?: CardText;
  artist?: string;
  metadata?: CardMetadata;
  media?: CardMedia;
  purchase_uris?: CardPurchaseUris;
  prices?: CardPrices;
  is_token: boolean;
  all_parts: RelatedCard[];
  used_by: RelatedCard[];
  related_champions: RelatedCard[];
  related_legends: RelatedCard[];
  updated_at?: string;
  ingested_at?: string;
}

export interface CardsSearchResponse {
  count: number;
  cards: Card[];
}
