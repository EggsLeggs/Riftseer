import riftcodexSetsRaw from "./riftcodex_sets.json";
import tcgplayerGroupsRaw from "./tcgplayer_groups.json";
import cardsRaw from "./cards.json";

export interface RiftcodexSetOverride {
  /** Override the display name. */
  name?: string;
  /** Link this set to a parent set code. */
  parent_set_code?: string;
  /** Force is_promo flag. Defaults to false for RiftCodex sets. */
  is_promo?: boolean;
  /** Override the publication date (ISO date string, e.g. "2024-11-15"). */
  published_on?: string;
}

export interface TcgplayerGroupOverride {
  /** Canonical set code to use in our system (defaults to TCGPlayer abbreviation). */
  set_code?: string;
  /** Override display name (defaults to TCGPlayer group name). */
  name?: string;
  /** Link this promo set to a parent set code. */
  parent_set_code?: string;
  /** Override is_promo flag. Defaults to true for TCGPlayer-only sets. */
  is_promo?: boolean;
}

export interface CardOverride {
  /** Force this card to use TCGPlayer CDN images instead of RiftCodex. */
  use_tcgplayer_image?: boolean;
  /** Override the card's release date (ISO date string, e.g. "2024-11-15"). */
  released_at?: string;
}

export type RiftcodexSetOverrides = Record<string, RiftcodexSetOverride>;
export type TcgplayerGroupOverrides = Record<string, TcgplayerGroupOverride>;
export type CardOverrides = Record<string, CardOverride>;

export const overrides = {
  riftcodexSets: riftcodexSetsRaw as RiftcodexSetOverrides,
  tcgplayerGroups: tcgplayerGroupsRaw as TcgplayerGroupOverrides,
  cards: cardsRaw as CardOverrides,
};
