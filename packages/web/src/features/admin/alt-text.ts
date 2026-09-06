import type { Oracle, Printing } from "@riftseer/types";
import { EMPTY_VALUE, cardTypeLine } from "@/features/cards/format";

/**
 * Fields the alt-text suggestion reads. Kept as a plain shape so the editor can
 * feed live form values without assembling a full `Card`.
 */
export interface AltTextSource {
  name: string;
  type?: string;
  /** Type line already formatted (e.g. "Champion Unit"), or raw type. */
  typeLine?: string;
  collectorNumber?: string;
  setCode?: string;
  artist?: string;
  signature?: boolean;
  alternateArt?: boolean;
  overnumbered?: boolean;
  specialCollection?: boolean;
}

/**
 * A concise screen-reader description built from fields the editor already
 * holds. Prefer this over a blank `accessibility_text` — the public card page
 * falls back to the name alone, which says nothing about the printing.
 */
export function suggestCardAltText(source: AltTextSource): string {
  const name = source.name?.trim();
  if (!name) return "";

  const parts: string[] = [name];

  const typeLine = (source.typeLine ?? source.type)?.trim();
  if (typeLine && typeLine !== EMPTY_VALUE) {
    parts.push(typeLine);
  }

  const variants: string[] = [];
  if (source.signature) variants.push("signature");
  if (source.alternateArt) variants.push("alternate art");
  if (source.overnumbered) variants.push("overnumbered");
  if (source.specialCollection) variants.push("special collection");
  if (variants.length > 0) {
    parts.push(variants.join(", "));
  }

  const setCode = source.setCode?.trim();
  const collector = source.collectorNumber?.trim();
  if (setCode && collector) {
    parts.push(`${setCode} #${collector}`);
  } else if (setCode) {
    parts.push(setCode);
  } else if (collector) {
    parts.push(`#${collector}`);
  }

  let text = parts.join(" · ");

  const artist = source.artist?.trim();
  if (artist) {
    text = `${text}. Art by ${artist}`;
  }

  return text;
}

/** Convenience wrapper for a loaded card (image panel, create-from-review). */
export function suggestAltTextForCard(oracle: Oracle, printing: Printing): string {
  return suggestCardAltText({
    name: oracle.name,
    typeLine: cardTypeLine(oracle),
    collectorNumber: printing.collector_number,
    setCode: printing.set?.set_code,
    artist: printing.artist,
    signature: printing.signature,
    alternateArt: printing.alternate_art,
    overnumbered: printing.overnumbered,
    specialCollection: printing.special_collection,
  });
}
