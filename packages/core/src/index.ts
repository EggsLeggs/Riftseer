// Types
export type { Card, CardRequest, ResolvedCard, CardSearchOptions } from "./types.ts";

// Provider interface + factory
export type { CardDataProvider } from "./provider.ts";
export { createProvider } from "./providers/index.ts";
export type { ProviderName } from "./providers/index.ts";

// Concrete providers (for instanceof checks + typing metadata methods)
export { RiftCodexProvider, normalizeCardName } from "./providers/riftcodex.ts";
export { RiotProvider } from "./providers/riot.ts";

// Parser
export { parseCardRequests } from "./parser.ts";

// Storage helpers
export {
  getDb,
  hasReplied,
  markReplied,
  getCachedCards,
  setCachedCards,
  getCacheMeta,
} from "./db.ts";

// Infrastructure clients (lazy singletons — only throw when called without env vars)
export { getSupabaseClient } from "./supabase/client.ts";
export { getRedisClient } from "./redis/client.ts";

// Logger
export { logger } from "./logger.ts";

// Icon system
export {
  TOKEN_REGEX,
  TOKEN_ICON_MAP,
  EMOJI_PREFIX,
  EMOJI_FILES,
  TOKEN_DISCORD_FALLBACK,
  renderTextForDiscord,
} from "./icons.ts";
export type { EmojiFile } from "./icons.ts";
