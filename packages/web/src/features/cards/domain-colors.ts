/**
 * Riftbound domain hues, as space-separated RGB triples.
 *
 * Shared by decorative washes (the deck banner) and the statistics bars.
 * Colour is never the only identifier — a domain still has a name and a
 * rune glyph — so these can sit under deuteranopia without losing meaning.
 */

export const DOMAIN_RGB: Record<string, string> = {
  body: "234 88 12",
  chaos: "147 51 234",
  calm: "22 163 74",
  fury: "220 38 38",
  mind: "37 99 235",
  order: "202 138 4",
  rainbow: "168 85 247",
};

/** The one neutral wash, for a domain we have no hue for. */
export const NEUTRAL_DOMAIN_RGB = "120 120 130";

export function domainRgb(key: string): string {
  return DOMAIN_RGB[key.trim().toLowerCase()] ?? NEUTRAL_DOMAIN_RGB;
}
