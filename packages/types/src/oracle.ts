// ─── Oracle grouping ───────────────────────────────────────────────────────────
// An "oracle key" identifies the *card* rather than the printing, so rulings and
// format legalities can be authored once and shared across every printing.
//
// This is the single source of truth for that derivation. It is used by:
//   • the ingest worker, to stamp `cards.oracle_key` on every upserted row
//   • the admin API, to resolve the oracle key when a card is renamed
//   • `linkRelatedPrintings`, which groups printings by exactly the same key
//
// Keep it name-derived and pure: the SQL backfill in
// `supabase/migrations/20260731000000_phase5_rulings_legalities_formats.sql`
// mirrors this function, and the two must agree.

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
