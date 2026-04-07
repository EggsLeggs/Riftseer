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

/**
 * JSON schema (by top-level key):
 * - riftcodex_sets.json: { [setCode: string]: { name?, parent_set_code?, is_promo?, published_on? } }
 * - tcgplayer_groups.json: { [groupId: string]: { set_code?, name?, parent_set_code?, is_promo? } }
 * - cards.json: { [cardId: string]: { use_tcgplayer_image?, released_at? } }
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOptionalString(value: unknown, field: string, key: string): void {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`Invalid overrides.${key}.${field}: expected string`);
  }
}

function assertOptionalBoolean(value: unknown, field: string, key: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`Invalid overrides.${key}.${field}: expected boolean`);
  }
}

function validateRiftcodexSetOverrides(raw: unknown): RiftcodexSetOverrides {
  if (!isRecord(raw)) throw new Error("Invalid riftcodex_sets.json: expected object map");
  const validated: RiftcodexSetOverrides = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) throw new Error(`Invalid riftcodex_sets.${key}: expected object`);
    assertOptionalString(value.name, "name", key);
    assertOptionalString(value.parent_set_code, "parent_set_code", key);
    assertOptionalBoolean(value.is_promo, "is_promo", key);
    assertOptionalString(value.published_on, "published_on", key);
    validated[key] = {
      name: value.name as string | undefined,
      parent_set_code: value.parent_set_code as string | undefined,
      is_promo: value.is_promo as boolean | undefined,
      published_on: value.published_on as string | undefined,
    };
  }
  return validated;
}

function validateTcgplayerGroupOverrides(raw: unknown): TcgplayerGroupOverrides {
  if (!isRecord(raw)) throw new Error("Invalid tcgplayer_groups.json: expected object map");
  const validated: TcgplayerGroupOverrides = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) throw new Error(`Invalid tcgplayer_groups.${key}: expected object`);
    assertOptionalString(value.set_code, "set_code", key);
    assertOptionalString(value.name, "name", key);
    assertOptionalString(value.parent_set_code, "parent_set_code", key);
    assertOptionalBoolean(value.is_promo, "is_promo", key);
    validated[key] = {
      set_code: value.set_code as string | undefined,
      name: value.name as string | undefined,
      parent_set_code: value.parent_set_code as string | undefined,
      is_promo: value.is_promo as boolean | undefined,
    };
  }
  return validated;
}

function validateCardOverrides(raw: unknown): CardOverrides {
  if (!isRecord(raw)) throw new Error("Invalid cards.json: expected object map");
  const validated: CardOverrides = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) throw new Error(`Invalid cards.${key}: expected object`);
    assertOptionalBoolean(value.use_tcgplayer_image, "use_tcgplayer_image", key);
    assertOptionalString(value.released_at, "released_at", key);
    validated[key] = {
      use_tcgplayer_image: value.use_tcgplayer_image as boolean | undefined,
      released_at: value.released_at as string | undefined,
    };
  }
  return validated;
}

export const overrides = {
  riftcodexSets: validateRiftcodexSetOverrides(riftcodexSetsRaw),
  tcgplayerGroups: validateTcgplayerGroupOverrides(tcgplayerGroupsRaw),
  cards: validateCardOverrides(cardsRaw),
};
