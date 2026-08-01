/**
 * Official-gallery enrichment.
 *
 * RiftCodex is still authoritative for which cards exist and what they say.
 * The gallery contributes only the equipment section RiftCodex has no field
 * for: the Might a Gear grants the unit it is attached to, plus the effect that
 * comes with it.
 *
 * Applied by **oracle key**, not by printing. The gallery covers the numbered
 * sets only, so the JDG and OPP promo printings of an equipment card are not in
 * it — and an equipment effect is a property of the card, identical on every
 * printing. Keying on the shared name is what carries the effect across.
 */

import type { Card } from "@riftseer/types";
import { oracleKeyForName } from "@riftseer/types/oracle";
import { logger } from "../utils.ts";
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
 * Stamp `attributes.might_bonus` and `text.equipment` onto every printing of
 * each equipment card.
 *
 * Idempotent and self-clearing: a printing that is no longer equipment upstream
 * has both fields removed rather than keeping a stale bonus. The card upsert
 * writes `attributes` and `text` wholesale, so an absent key really does clear.
 */
export function applyGalleryEquipment(
  cards: Card[],
  index: GalleryIndex,
): { equipped: number } {
  let equipped = 0;

  for (const card of cards) {
    const equipment = index.equipmentByOracleKey.get(
      card.oracle_key ?? oracleKeyForName(card.name),
    );

    if (!equipment) {
      if (card.attributes) delete card.attributes.might_bonus;
      if (card.text) delete card.text.equipment;
      continue;
    }

    card.attributes = { ...card.attributes, might_bonus: equipment.mightBonus };
    card.text = { ...card.text };
    if (equipment.effect) {
      card.text.equipment = equipment.effect;
    } else {
      delete card.text.equipment;
    }
    equipped++;
  }

  logger.info("Applied gallery equipment", { equipped });
  return { equipped };
}
