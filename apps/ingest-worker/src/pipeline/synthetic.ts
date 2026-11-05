/**
 * Printings RiftCodex does not carry, injected into the run as if it did.
 *
 * See `SyntheticCardOverride` in `../overrides/index.ts` for why these exist
 * and when to delete one. This module only maps the JSON onto `IngestPrinting`
 * so the rest of the pipeline cannot tell the difference.
 */

import { overrides } from "../overrides/index.ts";
import { logger } from "../utils.ts";
import { normalizeCardName } from "../utils.ts";
import type { IngestPrinting, IngestSet } from "./types.ts";

/**
 * Build the synthetic printings for this run.
 *
 * A card naming a set the run does not have is dropped here with a warning
 * rather than silently: `ingest_catalogue` joins printings to `sets` by code,
 * so it would otherwise vanish into a JOIN with nothing to show for it. That
 * is the state `rad-t02` sits in until Radiance has a set row.
 */
export function syntheticPrintings(sets: IngestSet[]): IngestPrinting[] {
  const knownSetCodes = new Set(sets.map((s) => s.set_code.toUpperCase()));
  const printings: IngestPrinting[] = [];
  const skipped: string[] = [];

  for (const [id, card] of Object.entries(overrides.syntheticCards)) {
    const setCode = card.set_code.toUpperCase();
    if (!knownSetCodes.has(setCode)) {
      skipped.push(`${id} (${setCode})`);
      continue;
    }
    printings.push({
      id,
      name: card.name,
      name_normalized: normalizeCardName(card.name),
      card_type: card.card_type,
      supertype: card.supertype,
      // These exist because `linkTokens` needs a token oracle to point at;
      // the override file is not the place to get this wrong.
      is_token: card.supertype?.toLowerCase() === "token",
      energy: card.energy ?? null,
      might: card.might ?? null,
      power: card.power ?? null,
      text_plain: card.text_plain,
      text_rich: card.text_plain,
      tags: [],
      domains: [],
      set_code: setCode,
      artist: card.artist,
      collector_number: card.collector_number,
      rarity: card.rarity,
      flavour_text: card.flavour_text,
      finishes: [],
      is_signature: card.is_signature ?? false,
      is_alternate_art: false,
      is_overnumbered: false,
      is_special_collection: false,
      image_source_url: card.image_source_url,
      image_orientation: card.image_orientation,
    });
  }

  if (skipped.length > 0) {
    logger.warn("Synthetic cards skipped — no set row for them yet", { skipped });
  }
  if (printings.length > 0) {
    logger.info("Injected synthetic printings", {
      count: printings.length,
      tokens: printings.filter((p) => p.is_token).length,
    });
  }
  return printings;
}
