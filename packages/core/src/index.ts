// The canonical card model, re-exported wholesale so this barrel cannot drift
// from `@riftseer/types`.
export * from "./types.ts";

// Deck and serialiser
export { Deck } from "./deck.ts";
export type { DeckSerializer } from "./serialiser.ts";
export { DeckSerializerV1 } from "./serialiser.ts";

// Card provider interface + factory
export type { CardDataProvider } from "./provider.ts";
export { createProvider } from "./providers/index.ts";
export type { ProviderName } from "./providers/index.ts";

export { normalizeCardName } from "./normalize.ts";
export {
  slugifyCardName,
  buildPublicSlugSegments,
  joinPublicSlug,
  withNameCollisionSuffix,
  generatePublicSlug,
  generateOracleSlug,
  absoluteRiftseerUri,
  normalizeSiteOrigin,
  MISSING_COLLECTOR_SEGMENT,
} from "@riftseer/types/slug";
export { autocompleteSearch, scoreCard, rankIds } from "./search.ts";
export type { Nameable } from "./search.ts";
export {
  SupabaseCardProvider,
  collectorLabel,
  comparePrintings,
  pickRequestedPrinting,
} from "./providers/supabase.ts";
export {
  finalizeOracle,
  finalizeOracles,
  finalizePrinting,
  finalizePrintings,
} from "./hydrate.ts";

// Oracle detail aggregation
export {
  buildOracleDetail,
  tcgplayerUrlForPrinting,
  cardmarketUrlForPrinting,
} from "./card-detail.ts";
export type { BuildOracleDetailOptions } from "./card-detail.ts";

// Deck provider interface + implementation
export type { SimplifiedDeckProvider } from "./provider.ts";
export { SimplifiedDeckProviderImpl } from "./providers/simplified_deck_provider.ts";

// Parser
export { parseCardRequests } from "./parser.ts";

// Card search query language
export {
  BadCardSearchQueryError,
  CARD_SEARCH_LIMITS,
  andAst,
  exactNameLeaf,
  filterLeaf,
  findTextLeafValue,
  notAst,
  orAst,
  parseCardSearchQuery,
  textLeaf,
  validateCardSearchAst,
} from "./card-search-query.ts";
export type {
  CardSearchAst,
  CardSearchField,
  ParsedCardSearch,
} from "./card-search-query.ts";

// Logger
export { logger } from "./logger.ts";

// Errors
export { BadRequestError, NotFoundError } from "./errors.ts";

// Icon system
export {
  TOKEN_REGEX,
  TOKEN_ICON_MAP,
  tokenPlainLabel,
  tokenDisplayName,
  formatTokenDisplayList,
  EMOJI_PREFIX,
  EMOJI_FILES,
  TOKEN_DISCORD_FALLBACK,
  normalizeCardTextLayout,
  renderTextForDiscord,
} from "./icons.ts";
export type { EmojiFile } from "./icons.ts";

