import riftcodexSetsRaw from "./riftcodex_sets.json";
import tcgplayerGroupsRaw from "./tcgplayer_groups.json";
import cardsRaw from "./cards.json";
import syntheticCardsRaw from "./synthetic_cards.json";

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

/**
 * A printing RiftCodex does not carry, injected into the run as if it did.
 *
 * RiftCodex holds 5 of the 14 printed token cards; the rest exist only in
 * Riot's gallery, which by design never creates a card. That gap is not
 * cosmetic: `linkTokens` indexes token oracles out of the pipeline's own
 * array, so a token the pipeline cannot see gets no `makes_token` edges, and
 * no client can offer it — which is why the Tabletop Simulator mod spawned
 * three tokens out of ten.
 *
 * Injecting here rather than creating admin rows keeps one code path. The
 * card flows through dedup, oracle building, linking and the upsert like any
 * other, its edges are written `source = 'ingest'` and stay current, and the
 * prune protects it by listing it every run rather than by source. When
 * RiftCodex finally ships one of these, delete the entry: the upstream row
 * takes over and the prune removes ours, with no admin cleanup.
 *
 * Keyed by the printing id to create, which must not collide with a RiftCodex
 * ObjectId — use the printed form, `sfd-t01`.
 */
export interface SyntheticCardOverride {
  name: string;
  card_type: string;
  supertype?: string;
  set_code: string;
  collector_number: string;
  might?: number;
  energy?: number;
  power?: number;
  artist?: string;
  rarity?: string;
  text_plain?: string;
  flavour_text?: string;
  image_source_url?: string;
  /** `portrait` or `landscape`; battlefields are landscape. */
  image_orientation?: string;
  /** Drives the `*` in the public slug, so it must match the printed card. */
  is_signature?: boolean;
  /**
   * The printed id, e.g. `rad-020a-167`. Supplied in preference to authoring
   * the variant flags: `printedVariantSignals` reads alternate art, signature,
   * special collection and overnumbered straight off it, which is how upstream
   * printings get theirs, so the two cannot drift.
   */
  riftbound_id?: string;
}

export type RiftcodexSetOverrides = Record<string, RiftcodexSetOverride>;
export type TcgplayerGroupOverrides = Record<string, TcgplayerGroupOverride>;
export type CardOverrides = Record<string, CardOverride>;
export type SyntheticCardOverrides = Record<string, SyntheticCardOverride>;

/**
 * JSON schema (by top-level key):
 * - riftcodex_sets.json: { [setCode: string]: { name?, parent_set_code?, is_promo?, published_on? } }
 * - tcgplayer_groups.json: { [groupId: string]: { set_code?, name?, parent_set_code?, is_promo? } }
 * - cards.json: { [cardId: string]: { use_tcgplayer_image?, released_at? } }
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOptionalType(
  value: unknown,
  expectedType: "string" | "boolean",
  field: string,
  key: string,
): void {
  if (value !== undefined && typeof value !== expectedType) {
    throw new Error(`Invalid overrides.${key}.${field}: expected ${expectedType}`);
  }
}

function validateRiftcodexSetOverrides(raw: unknown): RiftcodexSetOverrides {
  if (!isRecord(raw)) throw new Error("Invalid riftcodex_sets.json: expected object map");
  const validated: RiftcodexSetOverrides = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) throw new Error(`Invalid riftcodex_sets.${key}: expected object`);
    assertOptionalType(value.name, "string", "name", key);
    assertOptionalType(value.parent_set_code, "string", "parent_set_code", key);
    assertOptionalType(value.is_promo, "boolean", "is_promo", key);
    assertOptionalType(value.published_on, "string", "published_on", key);
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
    assertOptionalType(value.set_code, "string", "set_code", key);
    assertOptionalType(value.name, "string", "name", key);
    assertOptionalType(value.parent_set_code, "string", "parent_set_code", key);
    assertOptionalType(value.is_promo, "boolean", "is_promo", key);
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
    assertOptionalType(value.use_tcgplayer_image, "boolean", "use_tcgplayer_image", key);
    assertOptionalType(value.released_at, "string", "released_at", key);
    validated[key] = {
      use_tcgplayer_image: value.use_tcgplayer_image as boolean | undefined,
      released_at: value.released_at as string | undefined,
    };
  }
  return validated;
}

function assertRequiredString(value: unknown, field: string, key: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid synthetic_cards.${key}.${field}: expected a non-empty string`);
  }
  return value;
}

function validateSyntheticCardOverrides(raw: unknown): SyntheticCardOverrides {
  if (!isRecord(raw)) throw new Error("Invalid synthetic_cards.json: expected object map");
  const validated: SyntheticCardOverrides = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) throw new Error(`Invalid synthetic_cards.${key}: expected object`);
    // A 24-char hex id is RiftCodex's; colliding with one would silently
    // overwrite a real printing through the upsert's ON CONFLICT (id).
    if (/^[0-9a-f]{24}$/i.test(key)) {
      throw new Error(`Invalid synthetic_cards.${key}: id collides with RiftCodex ObjectId shape`);
    }
    for (const field of [
      "supertype",
      "artist",
      "rarity",
      "text_plain",
      "flavour_text",
      "image_source_url",
      "image_orientation",
    ]) {
      assertOptionalType(value[field], "string", field, key);
    }
    assertOptionalType(value.is_signature, "boolean", "is_signature", key);
    for (const field of ["might", "energy", "power"]) {
      if (value[field] !== undefined && typeof value[field] !== "number") {
        throw new Error(`Invalid synthetic_cards.${key}.${field}: expected number`);
      }
    }
    validated[key] = {
      name: assertRequiredString(value.name, "name", key),
      card_type: assertRequiredString(value.card_type, "card_type", key),
      set_code: assertRequiredString(value.set_code, "set_code", key),
      collector_number: assertRequiredString(value.collector_number, "collector_number", key),
      supertype: value.supertype as string | undefined,
      might: value.might as number | undefined,
      energy: value.energy as number | undefined,
      power: value.power as number | undefined,
      artist: value.artist as string | undefined,
      rarity: value.rarity as string | undefined,
      text_plain: value.text_plain as string | undefined,
      flavour_text: value.flavour_text as string | undefined,
      image_source_url: value.image_source_url as string | undefined,
      image_orientation: value.image_orientation as string | undefined,
      is_signature: value.is_signature as boolean | undefined,
      riftbound_id: value.riftbound_id as string | undefined,
    };
  }
  return validated;
}

export const overrides = {
  riftcodexSets: validateRiftcodexSetOverrides(riftcodexSetsRaw),
  tcgplayerGroups: validateTcgplayerGroupOverrides(tcgplayerGroupsRaw),
  cards: validateCardOverrides(cardsRaw),
  syntheticCards: validateSyntheticCardOverrides(syntheticCardsRaw),
};
