// ─── Normalised card shape ─────────────────────────────────────────────────────
// This is the canonical Card type used everywhere in the app.
// Provider implementations map their raw upstream schemas to this type.

export interface Card {
  /** Stable unique identifier (UUID from RiftCodex, or Riot's ID later). */
  id: string;
  /** Display name as it appears on the card. */
  name: string;
  /** Lower-cased, punctuation-stripped name for index lookups. */
  normalizedName: string;
  /** Short set code, e.g. "OGN", "SFD". */
  setCode?: string;
  /** Human-readable set name, e.g. "Origins". */
  setName?: string;
  /** Collector/print number within the set. */
  collectorNumber?: string;
  /** Primary card art image URL (hosted by Riot CDN). */
  imageUrl?: string;
  /** Plain-text card rules text (symbols replaced with tokens like :rb_exhaust:). */
  text?: string;
  /** Optional effect text (e.g. for Equipment/Gear: bonus while equipped). */
  effect?: string;
  /** Energy cost to play the card. */
  cost?: number;
  /** Card type line, e.g. "Unit", "Gear", "Spell". */
  typeLine?: string;
  /** Optional supertype, e.g. "Champion". */
  supertype?: string | null;
  /** Rarity string: "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary". */
  rarity?: string;
  /** Domains/regions the card belongs to, e.g. ["Fury"]. */
  domains?: string[];
  /** Might stat (unit's defense-side stat). */
  might?: number | null;
  /** Power stat (unit's attack-side stat). */
  power?: number | null;
  /** Card tags, e.g. ["Poro"]. */
  tags?: string[];
  /** Artist who illustrated the card. */
  artist?: string;
  /** Whether this is an alternate art printing. */
  alternateArt?: boolean;
  /** Whether this is an overnumbered printing (collector number beyond the base set count). */
  overnumbered?: boolean;
  /** Whether this is a signed/autographed printing. */
  signature?: boolean;
  /** Display orientation: "portrait" (vertical) or "landscape" (horizontal, e.g. Battlefields). */
  orientation?: string;
  /** Provider-specific raw data (for debugging; not sent to clients by default). */
  raw?: Record<string, unknown>;
}

// ─── Request / resolution types ───────────────────────────────────────────────

/** A parsed request from a [[Name|SET-123]] token. */
export interface CardRequest {
  /** The original text inside [[ ]]. */
  raw: string;
  /** Parsed card name (trimmed). */
  name: string;
  /** Optional set code parsed from the token. */
  set?: string;
  /** Optional collector number parsed from the token. */
  collector?: string;
}

/** The result of resolving a CardRequest against the provider's index. */
export interface ResolvedCard {
  request: CardRequest;
  /** The matched card, or null if not found. */
  card: Card | null;
  /** How the card was matched. */
  matchType: "exact" | "fuzzy" | "not-found";
  /** Fuse.js score when matchType === "fuzzy" (lower = better, 0 = perfect). */
  score?: number;
}

// ─── Search options ────────────────────────────────────────────────────────────

export interface CardSearchOptions {
  set?: string;
  collector?: string | number;
  /** Whether to fall back to fuzzy matching when no exact match is found. Default: true. */
  fuzzy?: boolean;
  /** Max results to return. Default: 10. */
  limit?: number;
}
