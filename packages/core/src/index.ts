// Types
export type { Card, CardRequest, ResolvedCard, CardSearchOptions } from "./types.ts";
export type {
  CardV2,
  CardV2ExternalIds,
  CardV2Set,
  CardV2Rulings,
  CardV2Attributes,
  CardV2Classification,
  CardV2Text,
  CardV2Metadata,
  CardV2MediaUrls,
  CardV2Media,
  CardV2PurchaseUris,
  CardV2Prices,
  RelatedCard,
} from "./types.ts";

// Provider interface + factory
export type { CardDataProvider } from "./provider.ts";
export { createProvider } from "./providers/index.ts";
export type { ProviderName } from "./providers/index.ts";

// Concrete providers (for instanceof checks + typing metadata methods)
export { RiftCodexProvider, normalizeCardName, fetchAllPages, toCardV2 } from "./providers/riftcodex.ts";
export { RiotProvider } from "./providers/riot.ts";
export { SupabaseCardProvider } from "./providers/supabase.ts";

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
