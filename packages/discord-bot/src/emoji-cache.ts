/**
 * Fetch and cache Discord application emojis.
 *
 * On the first call within a worker isolate's lifetime, fetches all application
 * emojis from Discord and builds a token-key → emoji-ID map. Subsequent calls
 * within the same isolate reuse the cached value.
 *
 * Returns an empty map (gracefully) if the fetch fails so card text still
 * renders with Unicode fallbacks rather than crashing.
 */

import type { Env } from "./index.ts";
import { EMOJI_PREFIX } from "@riftseer/core/icons";

/** token key → Discord emoji ID  (e.g. "exhaust" → "1234567890") */
export type EmojiMap = Record<string, string>;

let cached: EmojiMap | null = null;

export async function getEmojiMap(env: Env): Promise<EmojiMap> {
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/emojis`,
      { headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` } },
    );

    if (!res.ok) {
      console.warn(`[RiftSeer] Failed to fetch emojis (${res.status})`);
      return {};
    }

    const data = (await res.json()) as { items: Array<{ id: string; name: string }> };
    const map: EmojiMap = {};

    for (const emoji of data.items) {
      if (emoji.name.startsWith(EMOJI_PREFIX)) {
        // "rb_exhaust" → "exhaust", "rb_rune_fury" → "rune_fury"
        map[emoji.name.slice(EMOJI_PREFIX.length)] = emoji.id;
      }
    }

    cached = map;
    return map;
  } catch (err) {
    console.warn("[RiftSeer] Error fetching emojis:", err);
    return {};
  }
}
