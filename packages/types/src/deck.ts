// ─── Deck vocabulary ──────────────────────────────────────────────────────────
//
// Counting is by **oracle**, display is by **printing**.
//
// A deck entry is a *physical card*, so it stores a printing id — that is what
// art, price and the printing rung of legality are read from. But every
// construction rule (type, domain matching, copy limits) reads *oracle* fields,
// because those are properties of the card rather than the cardboard. Three
// copies of Vayne split across two arts are three copies against the copy limit
// and two rows in the list.
//
// Rather than thread an oracle and a printing through the deck model,
// `DeckEntry` carries both ids plus the handful of oracle fields the rules
// actually need. Deck code then reads `entry.card_type` instead of
// optional-chaining through a payload that may or may not have been hydrated.

/**
 * Every zone a deck card can sit in. The first five are official Riftbound
 * zones; `considering` is ours and counts toward nothing.
 */
export const DECK_ZONES = [
  "legend",
  "main",
  "sideboard",
  "runes",
  "battlefields",
  "considering",
] as const;

export type DeckZone = (typeof DECK_ZONES)[number];

/**
 * Zones whose copies are counted together against one copy limit.
 *
 * `considering` is deliberately in **no** group: it is a scratch list, so a
 * card sitting there counts toward no copy limit and no zone size.
 */
export const COUNTING_GROUPS: readonly (readonly DeckZone[])[] = [
  ["legend", "main", "sideboard"],
  ["runes"],
  ["battlefields"],
];

/** Human labels, used by the text export and by zone headers in the builder. */
export const DECK_ZONE_LABELS: Record<DeckZone, string> = {
  legend: "Legend",
  main: "Main",
  sideboard: "Sideboard",
  runes: "Runes",
  battlefields: "Battlefields",
  considering: "Considering",
};

// ─── Legality ─────────────────────────────────────────────────────────────────

/**
 * Legality statuses a format can assign to a card.
 *
 * The single list: `CardLegalityStatus` in `./card.ts` aliases this type, so a
 * status added here reaches deck validation and the public card page together
 * and every exhaustive `Record<…>` label map fails to compile until it does.
 */
export const LEGALITY_STATUSES = [
  "legal",
  "restricted",
  "not_legal",
  "banned",
] as const;

export type LegalityStatus = (typeof LEGALITY_STATUSES)[number];

/** Which rung of `printing → oracle → default` decided a resolved status. */
export type LegalityScope = "printing" | "oracle" | "default";

export const VIOLATION_SEVERITIES = ["none", "warning", "error"] as const;

export type ViolationSeverity = (typeof VIOLATION_SEVERITIES)[number];

/**
 * How severely each status reads when a format says nothing else.
 *
 * This is the single definition of the mapping. The database's
 * `format_legality_severities` table stores per-format **overrides** only, and
 * anything it does not mention falls through to here — so adding a status means
 * editing this record, not auditing every format's rows.
 */
export const DEFAULT_LEGALITY_SEVERITY: Record<LegalityStatus, ViolationSeverity> = {
  legal: "none",
  restricted: "warning",
  not_legal: "error",
  banned: "error",
};

/** One stored legality row, at either rung. */
export interface LegalityEntry {
  status: LegalityStatus;
  /** The admin's explanation, surfaced in the builder tooltip. */
  note?: string | null;
}

/**
 * Every stored legality that applies to one deck, in **one** format.
 *
 * Both rungs are addressable because resolution is `printing row → oracle row →
 * default legal`, and a banned printing under a legal oracle is a real case
 * whose fix is swapping the art rather than cutting the card.
 */
export interface LegalityMap {
  /** Keyed by printing id. */
  printings?: Readonly<Record<string, LegalityEntry | undefined>>;
  /** Keyed by oracle id. */
  oracles?: Readonly<Record<string, LegalityEntry | undefined>>;
}

/** A status plus the rung that produced it. */
export interface ResolvedLegality {
  status: LegalityStatus;
  scope: LegalityScope;
  note?: string | null;
}

/** Resolve one card's legality: printing row → oracle row → default `legal`. */
export function resolveLegality(
  legalities: LegalityMap | undefined,
  oracleId: string,
  printingId: string,
): ResolvedLegality {
  const printing = legalities?.printings?.[printingId];
  if (printing) return { status: printing.status, scope: "printing", note: printing.note };
  const oracle = legalities?.oracles?.[oracleId];
  if (oracle) return { status: oracle.status, scope: "oracle", note: oracle.note };
  return { status: "legal", scope: "default" };
}

/** Severity for a status under one format's overrides. */
export function legalitySeverity(
  status: LegalityStatus,
  overrides?: Partial<Record<LegalityStatus, ViolationSeverity>>,
): ViolationSeverity {
  return overrides?.[status] ?? DEFAULT_LEGALITY_SEVERITY[status];
}

// ─── Zone routing ─────────────────────────────────────────────────────────────

function typeKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

/**
 * The zones a card is **eligible** for, most specific first.
 *
 * Routes on `card_type` — the catalogue's real vocabulary (`"Legend"`,
 * `"Rune"`, `"Battlefield"`) — and never on `supertype`. The previous deck
 * model routed on `supertype === "Rune"` / `"Battleground"`, values the
 * catalogue does not contain, so two of five zones silently collapsed into the
 * main deck against real data.
 *
 * `isToken` is separate because a token has a real `card_type` (Unit, Gear,
 * Battlefield) *and* is a token; `supertype` alone does not identify one.
 * Tokens are never deck members — membership is derived from `makes_token`
 * relationships — so a token is eligible for `considering` and nothing else.
 */
export function zoneForCard(
  cardType: string | null | undefined,
  supertype?: string | null,
  isToken?: boolean | null,
): DeckZone[] {
  const type = typeKey(cardType);
  if (isToken || type === "token" || typeKey(supertype) === "token") {
    return ["considering"];
  }
  if (type === "legend") return ["legend"];
  if (type === "rune") return ["runes", "considering"];
  if (type === "battlefield") return ["battlefields", "considering"];
  return ["main", "sideboard", "considering"];
}

// ─── Deck state ───────────────────────────────────────────────────────────────

/**
 * The oracle rules fields deck validation reads. Everything else about a card —
 * art, rarity, price, flavour — is display and belongs to the printing.
 */
export interface DeckCardRules {
  /** Used in violation messages; falls back to the printing id when absent. */
  name?: string;
  /** Routes the card to its zones. See {@link zoneForCard}. */
  card_type?: string | null;
  supertype?: string | null;
  /** Orthogonal to `card_type`: a token Unit is both. */
  is_token?: boolean;
  /** Empty (or absent) means domainless, which every legend covers. */
  domains?: string[];
}

/** One row of a deck list. Mirrors a `deck_cards` row plus its oracle rules. */
export interface DeckEntry extends DeckCardRules {
  zone: DeckZone;
  /** Counting identity. */
  oracle_id: string;
  /** Display identity, and the printing rung of legality. */
  printing_id: string;
  quantity: number;
  /**
   * The chosen champion is not a zone: it is one `main` row flagged, so running
   * three copies leaves three copies in main with one of them flagged.
   */
  is_champion?: boolean;
}

/** A deck as the validator sees it. */
export interface DeckState {
  entries: DeckEntry[];
  /**
   * Domains the legend covers. Defaults to the `legend` entry's own `domains`,
   * so a hydrated deck needs nothing extra; supply it when the caller knows the
   * legend but has not flattened its domains onto the entry.
   */
  legend_domains?: string[];
}

// ─── Format rules ─────────────────────────────────────────────────────────────

/**
 * One format's constraints on one zone. `null`/absent means unconstrained, so a
 * sandbox format that enforces nothing simply has no rules at all.
 */
export interface FormatZoneRule {
  zone: DeckZone;
  min_count?: number | null;
  max_count?: number | null;
  /**
   * Copies of one oracle allowed across this zone's whole counting group. The
   * group's effective limit is the minimum of its members' non-null limits.
   */
  copy_limit?: number | null;
}

/**
 * Everything a format asserts about deck construction.
 *
 * Never enforced as database constraints: a deck saved under one set of rules
 * must stay loadable after those rules change, so validation is advisory and
 * computed on read.
 */
export interface FormatRules {
  zones: readonly FormatZoneRule[];
  /**
   * Per-format departures from {@link DEFAULT_LEGALITY_SEVERITY} — e.g. a
   * casual format where `not_legal` warns instead of erroring. Absent statuses
   * fall through to the default mapping.
   */
  severity_overrides?: Partial<Record<LegalityStatus, ViolationSeverity>>;
}

/** Look up one zone's rule, or `undefined` when the format constrains nothing. */
export function zoneRuleFor(
  rules: FormatRules | undefined,
  zone: DeckZone,
): FormatZoneRule | undefined {
  return rules?.zones.find((rule) => rule.zone === zone);
}

/**
 * The copy limit shared by a counting group: the minimum of its member zones'
 * non-null limits, or `null` when no member constrains copies.
 */
export function groupCopyLimit(
  rules: FormatRules | undefined,
  group: readonly DeckZone[],
): number | null {
  let limit: number | null = null;
  for (const zone of group) {
    const candidate = zoneRuleFor(rules, zone)?.copy_limit;
    if (candidate === null || candidate === undefined) continue;
    limit = limit === null ? candidate : Math.min(limit, candidate);
  }
  return limit;
}

// ─── Violations ───────────────────────────────────────────────────────────────

export const DECK_VIOLATION_CODES = [
  "no_legend",
  "no_champion",
  "wrong_zone",
  "zone_under_min",
  "zone_over_max",
  "copy_limit_exceeded",
  "domain_not_covered",
  "legality",
] as const;

export type DeckViolationCode = (typeof DECK_VIOLATION_CODES)[number];

/**
 * One reported problem. Structured and advisory: the validator returns these
 * rather than throwing, because the builder shows all of them at once and a
 * deck is allowed to be saved mid-construction.
 */
export interface DeckViolation {
  code: DeckViolationCode;
  severity: Exclude<ViolationSeverity, "none">;
  /** Absent on copy-limit violations, which span a whole counting group. */
  zone?: DeckZone;
  oracle_id?: string;
  printing_id?: string;
  /** `legality` only: which rung fired, so the UI can offer an art swap. */
  scope?: Exclude<LegalityScope, "default">;
  /** `legality` only. */
  status?: LegalityStatus;
  /** Observed count, for count and copy-limit violations. */
  count?: number;
  /** The limit that was breached, for count and copy-limit violations. */
  limit?: number;
  message: string;
}
