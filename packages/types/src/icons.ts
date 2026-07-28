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
 * Consumed by CardTextRenderer.tsx / CardText.
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

/** Human labels for known tokens — used when copying rendered card text. */
const TOKEN_PLAIN_LABELS: Record<string, string> = {
  exhaust: "Exhaust",
  energy: "Energy",
  might: "Might",
  power: "Power",
  rune_fury: "Fury",
  rune_calm: "Calm",
  rune_mind: "Mind",
  rune_body: "Body",
  rune_chaos: "Chaos",
  rune_order: "Order",
  rune_rainbow: "Power",
};

/**
 * Human name for a `:rb_<key>:` token without braces — for tooltips / aria /
 * prefer-text mode. Copy/paste stand-ins use {@link tokenPlainLabel} instead.
 */
export function tokenDisplayName(key: string): string {
  const energy = /^energy_(\d+)$/.exec(key);
  if (energy) return `${energy[1]} Energy`;

  const known = TOKEN_PLAIN_LABELS[key];
  if (known) return known;

  return key
    .replace(/^rune_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Join display names: `3 Energy`, `3 Energy and Power`, `1 Energy, Order, and Order`. */
export function formatTokenDisplayList(keys: string[]): string {
  const names = keys.map(tokenDisplayName);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * Plain-text stand-in for a `:rb_<key>:` token (e.g. `{Exhaust}`, `{3}`, `{Power}`).
 * Braces keep symbols distinct from surrounding words when pasting into chat/docs.
 */
export function tokenPlainLabel(key: string): string {
  const energy = /^energy_(\d+)$/.exec(key);
  if (energy) return `{${energy[1]}}`;

  return `{${tokenDisplayName(key)}}`;
}
