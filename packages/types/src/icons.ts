/**
 * Shared icon system for Riftbound card text tokens.
 *
 * Token format in card text: :rb_<key>:
 * Examples: :rb_exhaust:  :rb_energy_3:  :rb_rune_fury:
 */

/** Regex that matches :rb_<key>: tokens in card text. */
export const TOKEN_REGEX = /:rb_(\w+):/g;

/**
 * Maps token key → CSS class name for the frontend.
 * Consumed by CardTextRenderer.tsx.
 */
export const TOKEN_ICON_MAP: Record<string, string> = {
  exhaust: "icon-exhaust",
  energy: "icon-energy",
  might: "icon-might",
  power: "icon-power",
  rune_fury: "icon-rune-fury",
  rune_calm: "icon-rune-calm",
  rune_mind: "icon-rune-mind",
  rune_body: "icon-rune-body",
  rune_chaos: "icon-rune-chaos",
  rune_order: "icon-rune-order",
  rune_rainbow: "icon-rune-rainbow",
};
