/**
 * Shared icon system for Riftbound card text tokens.
 *
 * Token format in card text: :rb_<key>:
 * Examples: :rb_exhaust:  :rb_energy_3:  :rb_rune_fury:
 *
 * Used by:
 *   - packages/frontend  (CardTextRenderer — renders CSS icon spans)
 *   - packages/discord-bot  (renderTextForDiscord — renders Discord custom emojis)
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

// ─── Discord emoji registry ───────────────────────────────────────────────────

/** All Discord application emoji names are prefixed with this string. */
export const EMOJI_PREFIX = "rb_";

export interface EmojiFile {
  /** Token key used in :rb_<key>: (e.g. "exhaust") */
  tokenKey: string;
  /** Discord emoji name — [a-zA-Z0-9_]{2,32} */
  emojiName: string;
  /**
   * Icon file path relative to packages/frontend/public/.
   * .svg files are converted to PNG before upload; .png files are uploaded as-is.
   */
  file: string;
}

/**
 * Icons to upload as Discord application emojis.
 * Run `bun run setup-emojis` in packages/discord-bot to upload these.
 *
 * Note: energy_0–5 are CSS-generated (no image file) and use Unicode fallbacks.
 */
export const EMOJI_FILES: EmojiFile[] = [
  // ── Stats (SVG — converted to PNG by setup-emojis script) ──────────────────
  { tokenKey: "exhaust",      emojiName: "rb_exhaust",      file: "icons/stats/exhaust.svg" },
  { tokenKey: "might",        emojiName: "rb_might",        file: "icons/stats/might.svg" },
  { tokenKey: "power",        emojiName: "rb_power",        file: "icons/stats/card_type_rune.svg" },
  // ── Domain runes (PNG available) ───────────────────────────────────────────
  { tokenKey: "rune_fury",    emojiName: "rb_rune_fury",    file: "icons/domains/rune_fury.png" },
  { tokenKey: "rune_calm",    emojiName: "rb_rune_calm",    file: "icons/domains/rune_calm.png" },
  { tokenKey: "rune_mind",    emojiName: "rb_rune_mind",    file: "icons/domains/rune_mind.png" },
  { tokenKey: "rune_body",    emojiName: "rb_rune_body",    file: "icons/domains/rune_body.png" },
  { tokenKey: "rune_chaos",   emojiName: "rb_rune_chaos",   file: "icons/domains/rune_chaos.png" },
  { tokenKey: "rune_order",   emojiName: "rb_rune_order",   file: "icons/domains/rune_order.png" },
  // ── Rainbow domain (SVG — converted to PNG) ─────────────────────────────────
  { tokenKey: "rune_rainbow", emojiName: "rb_rune_rainbow", file: "icons/domains/rune_rainbow.svg" },
];

/**
 * Unicode text fallbacks for tokens that have no image file.
 * Used by renderTextForDiscord when no Discord emoji is available.
 */
export const TOKEN_DISCORD_FALLBACK: Record<string, string> = {
  energy:   "⚡",
  energy_0: "⓪",
  energy_1: "①",
  energy_2: "②",
  energy_3: "③",
  energy_4: "④",
  energy_5: "⑤",
};

// ─── Discord text renderer ────────────────────────────────────────────────────

/**
 * Render card text for Discord, replacing :rb_token: sequences with either:
 *   - A Discord custom emoji reference: <:rb_exhaust:123456789>
 *   - A Unicode fallback character (⚡, ①, etc.) for tokens without image files
 *   - The original token unchanged if neither is available
 *
 * @param text - Raw card text containing :rb_<key>: sequences
 * @param emojiMap - token key → Discord emoji ID, from getEmojiMap() in emoji-cache.ts
 */
export function renderTextForDiscord(
  text: string,
  emojiMap: Record<string, string>,
): string {
  return text.replace(/:rb_(\w+):/g, (match, key: string) => {
    const id = emojiMap[key];
    if (id) {
      const entry = EMOJI_FILES.find((e) => e.tokenKey === key);
      if (entry) return `<:${entry.emojiName}:${id}>`;
    }
    return TOKEN_DISCORD_FALLBACK[key] ?? match;
  });
}
