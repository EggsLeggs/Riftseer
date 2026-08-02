/**
 * Official-gallery enrichment.
 *
 * RiftCodex is still authoritative for which cards exist and what they say.
 * The gallery contributes only the equipment section RiftCodex has no field
 * for: the Might a Gear grants the unit it is attached to, plus the effect that
 * comes with it.
 *
 * These are oracle fields — an equipment effect is a property of the card, not
 * of a piece of cardboard — which is also why the gallery covering the numbered
 * sets only does not matter: the JDG and OPP promo printings share the oracle
 * and inherit it.
 */

import { oracleKeyForName } from "@riftseer/types/oracle";
import { logger } from "../utils.ts";
import type { IngestOracle } from "./types.ts";
import {
  galleryEquipment,
  normalizeGalleryId,
  type GalleryEquipment,
  type RawGalleryCard,
} from "../sources/riftbound-gallery.ts";

export interface GalleryIndex {
  /** Normalized riftbound id → gallery card. */
  byRiftboundId: Map<string, RawGalleryCard>;
  /** Oracle key → equipment facts, for cards the gallery marks as equipment. */
  equipmentByOracleKey: Map<string, GalleryEquipment>;
}

export function buildGalleryIndex(cards: RawGalleryCard[]): GalleryIndex {
  const byRiftboundId = new Map<string, RawGalleryCard>();
  const equipmentByOracleKey = new Map<string, GalleryEquipment>();

  for (const raw of cards) {
    const id = normalizeGalleryId(raw.id);
    // First writer wins: the gallery ships one genuine duplicate id, and a
    // stable choice keeps the index reproducible run to run.
    if (!byRiftboundId.has(id)) byRiftboundId.set(id, raw);

    const equipment = galleryEquipment(raw);
    if (!equipment) continue;
    const key = oracleKeyForName(raw.name);
    if (!equipmentByOracleKey.has(key)) equipmentByOracleKey.set(key, equipment);
  }

  logger.info("Built official gallery index", {
    cards: byRiftboundId.size,
    equipment: equipmentByOracleKey.size,
  });
  return { byRiftboundId, equipmentByOracleKey };
}

/**
 * Write `might_bonus` and `equipment_text` onto every oracle the gallery marks
 * as equipment.
 *
 * Self-clearing: a card that is no longer equipment upstream has both fields set
 * to null, and the ingest RPC assigns rather than coalesces them so the clear
 * actually lands. `might_bonus` of `0` is a real printed value, so presence —
 * never truthiness — decides whether a card is equipment.
 */
export function applyGalleryEquipment(
  oracles: IngestOracle[],
  index: GalleryIndex,
): { equipped: number } {
  let equipped = 0;

  for (const oracle of oracles) {
    const equipment = index.equipmentByOracleKey.get(oracle.oracle_key);
    if (!equipment) {
      oracle.might_bonus = null;
      oracle.equipment_text = undefined;
      continue;
    }
    oracle.might_bonus = equipment.mightBonus;
    oracle.equipment_text = equipment.effect;
    equipped++;
  }

  logger.info("Applied gallery equipment", { equipped });
  return { equipped };
}
