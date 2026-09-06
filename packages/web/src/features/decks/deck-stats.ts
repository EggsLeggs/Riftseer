/**
 * What a deck is made of, as numbers.
 *
 * Pure and structural, like `grouping.ts`: the panel renders whatever this
 * returns and computes nothing of its own, so a second surface — a deck card in
 * a browse list, an export — can show the same figures without recomputing them
 * slightly differently.
 *
 * Two rules run through all of it. **Copies, not rows**: three Vaynes across two
 * arts are three cards here and two rows in the list. And **one zone**: the main
 * deck. Runes and battlefields have no energy and no power, and a format's rune
 * count is already in the footer, so folding them in would move every average
 * toward zero for no reader's benefit.
 */

/** The zone these figures describe. Curves over runes would mean nothing. */
export const STATS_ZONE = "main";

/** The fields the statistics read. Structural so a draft row or fixture fits. */
export interface StattableCard {
  card_type: string | null;
  domains: string[];
  energy: number | null;
  power: number | null;
  quantity: number;
  zone: string;
}

/** One column of a curve. Buckets are contiguous, so an empty cost still shows. */
export interface DeckStatBucket {
  value: number;
  /** Copies at this value. */
  count: number;
}

/** One labelled share of the deck — a domain, or a card type. */
export interface DeckStatShare {
  key: string;
  label: string;
  /** Copies carrying it. */
  count: number;
}

export interface DeckStats {
  /** Copies in the counted zone. */
  cards: number;
  /** Over the cards that have one; null when none do. */
  averageEnergy: number | null;
  averagePower: number | null;
  energyCurve: DeckStatBucket[];
  powerCurve: DeckStatBucket[];
  /**
   * A two-domain card counts toward both, so these sum to more than `cards`.
   * That is the question being asked — how much of the deck each domain has to
   * pay for — not a bug in the total.
   */
  domains: DeckStatShare[];
  cardTypes: DeckStatShare[];
}

export function deckStats(cards: readonly StattableCard[]): DeckStats {
  const counted = cards.filter((card) => card.zone === STATS_ZONE);
  const total = counted.reduce((sum, card) => sum + card.quantity, 0);

  return {
    cards: total,
    averageEnergy: average(counted, (card) => card.energy),
    averagePower: average(counted, (card) => card.power),
    energyCurve: curve(counted, (card) => card.energy),
    powerCurve: curve(counted, (card) => card.power),
    domains: shares(counted, (card) => card.domains),
    cardTypes: shares(counted, (card) => (card.card_type ? [card.card_type] : [])),
  };
}

/**
 * Weighted by copies, over the cards that carry the value at all.
 *
 * A card with no energy is not a zero-cost card — it is a card the question does
 * not apply to — so it leaves the average rather than dragging it down.
 */
function average(
  cards: readonly StattableCard[],
  read: (card: StattableCard) => number | null,
): number | null {
  let copies = 0;
  let sum = 0;
  for (const card of cards) {
    const value = read(card);
    if (value == null) continue;
    copies += card.quantity;
    sum += value * card.quantity;
  }
  return copies === 0 ? null : sum / copies;
}

/** Contiguous buckets from 0 to the highest value present. */
function curve(
  cards: readonly StattableCard[],
  read: (card: StattableCard) => number | null,
): DeckStatBucket[] {
  const counts = new Map<number, number>();
  let highest = -1;
  for (const card of cards) {
    const value = read(card);
    if (value == null || !Number.isFinite(value) || value < 0) continue;
    const bucket = Math.floor(value);
    counts.set(bucket, (counts.get(bucket) ?? 0) + card.quantity);
    if (bucket > highest) highest = bucket;
  }
  if (highest < 0) return [];
  return Array.from({ length: highest + 1 }, (_, value) => ({
    value,
    count: counts.get(value) ?? 0,
  }));
}

/**
 * Copies per label, largest first. Ties break by label so two runs over the same
 * deck never swap two rows around.
 */
function shares(
  cards: readonly StattableCard[],
  read: (card: StattableCard) => string[],
): DeckStatShare[] {
  const counts = new Map<string, DeckStatShare>();
  for (const card of cards) {
    // Deduplicated by the same key it is bucketed by, or a card spelling one
    // domain two ways would count itself twice.
    const labels = new Map<string, string>();
    for (const raw of read(card)) {
      const label = raw.trim();
      const key = label.toLowerCase();
      // First spelling wins, here and in `counts`, so the label shown is the
      // catalogue's own casing rather than whichever row was read last.
      if (label && !labels.has(key)) labels.set(key, label);
    }
    for (const [key, label] of labels) {
      const existing = counts.get(key);
      if (existing) existing.count += card.quantity;
      else counts.set(key, { key, label, count: card.quantity });
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}
