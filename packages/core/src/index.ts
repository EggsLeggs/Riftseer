// Types
export type {
  Card,
  CardRequest,
  ResolvedCard,
  CardSearchOptions,
  RelatedCard,
  CardExternalIds,
  CardSet,
  CardRulings,
  CardAttributes,
  CardClassification,
  CardText,
  CardMetadata,
  CardMediaUrls,
  CardMedia,
  CardPurchaseUris,
  CardPrices,
  SimplifiedDeck
} from "./types.ts";

// Deck and serialiser
export { Deck } from "./deck.ts";
export type { DeckSerializer } from "./serialiser.ts";
export { DeckSerializerV1 } from "./serialiser.ts";

// Card provider interface + factory
export type { CardDataProvider } from "./provider.ts";
export { createProvider } from "./providers/index.ts";
export type { ProviderName } from "./providers/index.ts";

export { normalizeCardName } from "./normalize.ts";
export { SupabaseCardProvider } from "./providers/supabase.ts";

// Deck provider interface + implementation
export type { SimplifiedDeckProvider } from "./provider.ts";
export { SimplifiedDeckProviderImpl } from "./providers/simplified_deck_provider.ts";

// Parser
export { parseCardRequests } from "./parser.ts";

// Logger
export { logger } from "./logger.ts";

// Errors
export { BadRequestError } from "./errors.ts";

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
