/**
 * The six Riftbound domains, their display names and their colours.
 *
 * Upstream spells domains as capitalised words (`"Fury"`); the rune token
 * spells them as keys (`:rb_rune_fury:`). Everything here goes through
 * {@link domainKey} so a surface never has to know which spelling it holds.
 */

export const DOMAIN_KEYS = ["body", "calm", "chaos", "fury", "mind", "order"] as const;

export type DomainKey = (typeof DOMAIN_KEYS)[number];

/** Canonical key for a domain in any spelling, or null for anything else. */
export function domainKey(name: string): DomainKey | null {
  const key = name.trim().toLowerCase();
  return (DOMAIN_KEYS as readonly string[]).includes(key) ? (key as DomainKey) : null;
}

/** `fury` → `Fury`. The printed spelling, for labels and tooltips. */
export function domainDisplayName(key: DomainKey): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Domains with a printed rune, plus the any-domain `rainbow` rune. Anything
 * else is named but never illustrated.
 */
export const RUNE_GLYPH_KEYS = [...DOMAIN_KEYS, "rainbow"] as const;

export function hasRuneGlyph(name: string): boolean {
  return (RUNE_GLYPH_KEYS as readonly string[]).includes(name.trim().toLowerCase());
}

/** Domain fills sampled from the rune art (`icons/domains/rune_*.svg`). */
export const DOMAIN_RUNE_HEX: Record<DomainKey, string> = {
  body: "#E87600",
  calm: "#488C38",
  chaos: "#6A4094",
  fury: "#DF1620",
  mind: "#0F6FA6",
  order: "#D2B400",
};

/** The rune fill for a domain in any spelling, or null when it has none. */
export function domainRuneHex(name: string): string | null {
  const key = domainKey(name);
  return key ? DOMAIN_RUNE_HEX[key] : null;
}

/**
 * Softer domain hues as space-separated RGB triples, for decorative washes
 * and statistics bars. Colour is never the only identifier — a domain still
 * has a name and a rune glyph — so these can sit under deuteranopia without
 * losing meaning.
 */
export const DOMAIN_WASH_RGB: Record<DomainKey | "rainbow", string> = {
  body: "234 88 12",
  calm: "22 163 74",
  chaos: "147 51 234",
  fury: "220 38 38",
  mind: "37 99 235",
  order: "202 138 4",
  rainbow: "168 85 247",
};

/** The one neutral wash, for a domain we have no hue for. */
export const NEUTRAL_DOMAIN_RGB = "120 120 130";

/** The wash triple for a domain or `rainbow` in any spelling, or null. */
export function domainWashRgb(name: string): string | null {
  const key = name.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(DOMAIN_WASH_RGB, key)
    ? DOMAIN_WASH_RGB[key as keyof typeof DOMAIN_WASH_RGB]
    : null;
}

/** Drops the placeholder "Colorless" domain, which has no rune of its own. */
export function meaningfulCardDomains(oracle: { domains: string[] }): string[] {
  return oracle.domains.filter(
    (d) => d.trim() !== "" && d.trim().toLowerCase() !== "colorless",
  );
}
