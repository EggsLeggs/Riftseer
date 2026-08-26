import { DECK_ZONES, DECK_ZONE_LABELS, type DeckZone } from "@riftseer/types/deck";

/**
 * How a deck list is broken up for display.
 *
 * Pure and structural on purpose: the builder renders whatever this returns and
 * hard-codes no grouping of its own, so adding "by domain" or "by cost" later
 * is a change here and a new option in a select — not a second rendering path.
 *
 * Grouping is **display only**. Nothing here counts toward a format rule; deck
 * validation reads zones and oracle ids and lives in `@riftseer/types`.
 */

export const DECK_GROUP_MODES = ["type", "domain", "cost"] as const;

export type DeckGroupMode = (typeof DECK_GROUP_MODES)[number];

export const DECK_GROUP_MODE_LABELS: Record<DeckGroupMode, string> = {
  type: "Type",
  domain: "Domain",
  cost: "Cost",
};

/**
 * The fields grouping reads. Structural rather than the wire type, so the
 * caller can pass a `DeckCard`, a draft row, or a test fixture.
 */
export interface GroupableCard {
  name: string;
  card_type: string | null;
  domains: string[];
  energy: number | null;
  quantity: number;
  zone: string;
}

export interface DeckGroup<T> {
  /** Stable key for React and for a persisted "collapsed" preference. */
  key: string;
  label: string;
  cards: T[];
  /** Copies, not rows: three Vaynes across two arts are two rows and three copies. */
  count: number;
}

/**
 * Type order. Not alphabetical — a deck list reads top-down in roughly the
 * order a game uses the cards, and an unrecognised type sorts after the known
 * ones rather than being dropped.
 */
const TYPE_ORDER = [
  "legend",
  "champion",
  "unit",
  "spell",
  "gear",
  "rune",
  "battlefield",
  "token",
];

function typeKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

const UNTYPED_LABEL = "Other";
const DOMAINLESS_LABEL = "Domainless";
const NO_COST_LABEL = "No cost";

/** Multi-domain cards get one group, not one per domain, so no copy is counted twice. */
function domainKey(domains: string[]): string {
  const cleaned = [...new Set(domains.map((d) => d.trim()).filter(Boolean))].sort();
  return cleaned.length > 0 ? cleaned.join("+") : "";
}

function bucketFor(card: GroupableCard, mode: DeckGroupMode): {
  key: string;
  label: string;
  sort: number;
} {
  if (mode === "domain") {
    const key = domainKey(card.domains);
    return {
      key: key || "domainless",
      label: key ? key.split("+").join(" · ") : DOMAINLESS_LABEL,
      // Domainless last: it is the absence of the thing being grouped by.
      sort: key ? 0 : 1,
    };
  }
  if (mode === "cost") {
    const energy = card.energy;
    if (energy === null || energy === undefined) {
      return { key: "no-cost", label: NO_COST_LABEL, sort: Number.MAX_SAFE_INTEGER };
    }
    return { key: `cost-${energy}`, label: `${energy}`, sort: energy };
  }
  const type = typeKey(card.card_type);
  const index = TYPE_ORDER.indexOf(type);
  return {
    key: type || "untyped",
    // The catalogue's own spelling, not a re-cased key: `typeKey` lower-cases
    // the whole value for grouping, so title-casing it back would render a
    // multi-word type such as "Champion Unit" as "Champion unit".
    label: card.card_type?.trim() || UNTYPED_LABEL,
    sort: index === -1 ? TYPE_ORDER.length : index,
  };
}

/**
 * Group one zone's cards for display, in a stable order.
 *
 * Groups sort by the mode's own order (type order, cost ascending, domain
 * alphabetically) and then by label, so two runs over the same list always
 * produce the same headings; cards inside a group sort by name.
 */
export function groupDeckCards<T extends GroupableCard>(
  cards: readonly T[],
  mode: DeckGroupMode = "type",
): DeckGroup<T>[] {
  const groups = new Map<string, DeckGroup<T> & { sort: number }>();

  for (const card of cards) {
    const bucket = bucketFor(card, mode);
    const existing = groups.get(bucket.key);
    if (existing) {
      existing.cards.push(card);
      existing.count += card.quantity;
      continue;
    }
    groups.set(bucket.key, {
      key: bucket.key,
      label: bucket.label,
      cards: [card],
      count: card.quantity,
      sort: bucket.sort,
    });
  }

  return [...groups.values()]
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
    .map(({ sort: _sort, ...group }) => ({
      ...group,
      cards: [...group.cards].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

export interface DeckZoneSection<T> {
  zone: DeckZone;
  label: string;
  cards: T[];
  /** Copies in the zone — what a format's min/max is expressed in. */
  count: number;
}

/**
 * Split a deck into its zones, in the canonical zone order.
 *
 * Every zone is returned, empty ones included: the builder needs a drop target
 * and a heading for a zone the user has not filled yet, and hiding empty zones
 * is a rendering decision the caller can still make.
 */
export function deckZoneSections<T extends GroupableCard>(
  cards: readonly T[],
): DeckZoneSection<T>[] {
  return DECK_ZONES.map((zone) => {
    const inZone = cards.filter((card) => card.zone === zone);
    return {
      zone,
      label: DECK_ZONE_LABELS[zone],
      cards: inZone,
      count: inZone.reduce((total, card) => total + card.quantity, 0),
    };
  });
}

/** Total copies across the given cards. Rows are not copies. */
export function totalCopies(cards: readonly GroupableCard[]): number {
  return cards.reduce((total, card) => total + card.quantity, 0);
}
