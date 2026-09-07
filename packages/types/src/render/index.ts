/**
 * The render kernel: pure functions over card text and card fields that every
 * surface — web, Discord, Reddit, Raycast — renders from. This file is the
 * kernel's whole public surface; the boundary lint keeps the files behind it
 * private.
 *
 * Surfaces keep only what is theirs: web maps tokens to elements and CSS
 * classes, Discord keeps its emoji-id map, Raycast its asset paths.
 */

export {
  TOKEN_REGEX,
  formatTokenDisplayList,
  replaceIconTokens,
  tokenDisplayName,
  tokenPlainLabel,
  tokenizeCardTextInline,
  tokenizeCardTextLine,
} from "./tokens.ts";
export type { CardTextToken, InlineCardTextToken } from "./tokens.ts";

export {
  decodeCardTextEntities,
  formatCardTextForClipboard,
  normalizeCardTextLayout,
  parseCardTextRich,
  richFragmentToPlain,
} from "./card-text.ts";
export type { CardTextBlock } from "./card-text.ts";

export {
  DOMAIN_KEYS,
  DOMAIN_RUNE_HEX,
  DOMAIN_WASH_RGB,
  NEUTRAL_DOMAIN_RGB,
  RUNE_GLYPH_KEYS,
  domainDisplayName,
  domainKey,
  domainRuneHex,
  domainWashRgb,
  hasRuneGlyph,
  meaningfulCardDomains,
} from "./domains.ts";
export type { DomainKey } from "./domains.ts";

export { cardTypeIconKey, cardTypeLine } from "./type-line.ts";

export {
  absoluteRiftseerUri,
  cardHref,
  cardPathFromPublicSlug,
  cardSiteUrl,
  normalizeSiteOrigin,
  oracleHref,
} from "./urls.ts";
