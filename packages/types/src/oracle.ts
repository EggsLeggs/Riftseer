// ─── Oracle matching ───────────────────────────────────────────────────────────
//
// An oracle key is a stable, name-derived *lookup slug*. It is emphatically NOT
// the identity of an oracle: oracles have a surrogate `id`, and printings carry
// a foreign key to it.
//
// This function is a **matching heuristic**, used at exactly one moment — when
// ingest meets a printing it has not seen before and has to decide which
// existing oracle it belongs to. A printing whose key matches nothing is filed
// in the review queue rather than silently creating a second oracle, because
// two names differing only by punctuation used to split a card in half and two
// unrelated names could merge one.
//
// Nothing downstream groups by this. Rulings, legalities and relationships all
// hang off `oracle_id`.

import { normalizeCardName } from "./parser.ts";

/**
 * Base name used to group printings of the same card.
 *
 * Upstream names carry a face separator and trailing disambiguators — e.g.
 * "Sprite (274) // Buff", "Ambessa, Matriarch of War (Signature)". Take the
 * first face, strip every trailing parenthetical, then normalize:
 *
 *   "Recruit (271) // Buff"               → "recruit"
 *   "Ambessa, Matriarch of War (Signature)" → "ambessa matriarch of war"
 */
export function oracleKeyForName(name: string): string {
  let base = name.split("//")[0]?.trim() ?? name.trim();
  let previous: string;
  do {
    previous = base;
    base = base.replace(/\s*\([^)]*\)\s*$/, "").trim();
  } while (base !== previous);
  return normalizeCardName(base);
}
