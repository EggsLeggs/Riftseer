import type { DeckViolation } from "./types";

/**
 * Reading `DeckViolation` without parsing `message`.
 *
 * The API computes violations and hands back structured fields — `code`,
 * `severity`, and whichever of `zone`, `oracle_id`, `printing_id`, `count`,
 * `limit`, `status` and `scope` apply. `message` is the human sentence and
 * nothing here reads it, because the day the wording changes a parser breaks
 * and a field lookup does not.
 */

/** `error` blocks a legal deck; `warning` is worth showing but not fatal. */
export type DeckViolationSeverity = "error" | "warning" | "info";

export function violationSeverity(
  violation: Pick<DeckViolation, "severity">,
): DeckViolationSeverity {
  if (violation.severity === "error") return "error";
  if (violation.severity === "warning") return "warning";
  return "info";
}

export interface DeckViolationIndex {
  /** Violations naming one physical card — a banned printing, a copy limit. */
  byPrinting: Map<string, DeckViolation[]>;
  /** Violations naming the rules object, which every art of it shares. */
  byOracle: Map<string, DeckViolation[]>;
  /** Zone-shaped violations: too few runes, too many battlefields. */
  byZone: Map<string, DeckViolation[]>;
  /** Everything that names no card and no zone. */
  deck: DeckViolation[];
}

function push(map: Map<string, DeckViolation[]>, key: string, value: DeckViolation) {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

export function indexDeckViolations(
  violations: readonly DeckViolation[],
): DeckViolationIndex {
  const index: DeckViolationIndex = {
    byPrinting: new Map(),
    byOracle: new Map(),
    byZone: new Map(),
    deck: [],
  };

  for (const violation of violations) {
    let targeted = false;
    if (violation.printing_id) {
      push(index.byPrinting, violation.printing_id, violation);
      targeted = true;
    }
    if (violation.oracle_id) {
      push(index.byOracle, violation.oracle_id, violation);
      targeted = true;
    }
    // A zone violation is about the zone's size, so it belongs to the zone
    // header rather than to any one row. A violation that named a card *and* a
    // zone is already attached to the card and is not repeated here.
    if (!targeted && violation.zone) {
      push(index.byZone, violation.zone, violation);
      targeted = true;
    }
    if (!targeted) index.deck.push(violation);
  }

  return index;
}

/**
 * Every violation that should render on one row. A card is hit by both its
 * printing's own entries and by its oracle's, because a copy limit counts by
 * oracle across arts while a ban can land on a single printing.
 */
export function violationsForCard(
  index: DeckViolationIndex,
  card: { printing_id: string; oracle_id: string },
): DeckViolation[] {
  const byPrinting = index.byPrinting.get(card.printing_id) ?? [];
  const byOracle = index.byOracle.get(card.oracle_id) ?? [];
  // An entry carrying both ids is in both buckets; show it once.
  const seen = new Set(byPrinting);
  return [...byPrinting, ...byOracle.filter((entry) => !seen.has(entry))];
}

export interface DeckViolationCounts {
  error: number;
  warning: number;
  info: number;
  total: number;
}

export function countDeckViolations(
  violations: readonly DeckViolation[],
): DeckViolationCounts {
  const counts: DeckViolationCounts = { error: 0, warning: 0, info: 0, total: 0 };
  for (const violation of violations) {
    counts[violationSeverity(violation)] += 1;
    counts.total += 1;
  }
  return counts;
}

/**
 * Which rung of `printing → oracle → default` fired, in words.
 *
 * Worth its own line in the UI: a banned printing under a legal oracle is fixed
 * by swapping the art, and a banned oracle is fixed by cutting the card. The
 * two look identical without this.
 */
export function violationScopeNote(
  violation: Pick<DeckViolation, "scope">,
): string | null {
  if (violation.scope === "printing") {
    return "This printing only — another art of the same card may be legal.";
  }
  if (violation.scope === "oracle") {
    return "The card itself — no printing of it is legal here.";
  }
  return null;
}
