import {
  COUNTING_GROUPS,
  DECK_ZONES,
  DECK_ZONE_LABELS,
  groupCopyLimit,
  legalitySeverity,
  resolveLegality,
  zoneForCard,
  zoneRuleFor,
  type DeckEntry,
  type DeckState,
  type DeckViolation,
  type DeckZone,
  type FormatRules,
  type LegalityMap,
} from "./deck.ts";

// ─── Deck validation ──────────────────────────────────────────────────────────
//
// One implementation, shared by the builder (live feedback) and the API (on
// save). Structured and non-throwing: the previous model threw an `Error` with
// an English string for every rule, which meant the first problem hid the rest
// and a deck could not be saved mid-construction.
//
// Nothing here is a database constraint. A deck saved under one set of format
// rules must stay loadable after those rules change, so validation is advisory
// and computed on read. The database enforces only structural invariants.

/** Zones whose cards must fall inside the legend's domains. */
const DOMAIN_CHECKED_ZONES: readonly DeckZone[] = ["main", "sideboard", "runes"];

/**
 * `considering` is a scratch list: it counts toward no copy limit, no zone
 * size, and raises no domain or legality violation. Only zone eligibility —
 * which every card passes — applies there.
 */
const SCRATCH_ZONE: DeckZone = "considering";

function nameOf(entry: DeckEntry): string {
  return entry.name?.trim() || entry.printing_id;
}

function domainsOf(entry: DeckEntry): string[] {
  return entry.domains ?? [];
}

function domainKey(domain: string): string {
  return domain.trim().toLowerCase();
}

/**
 * Check a deck against one format's rules and that format's stored legalities.
 *
 * Returns every problem found, in a stable order: deck-level requirements,
 * then per-entry problems in entry order, then zone sizes in zone order, then
 * copy limits per counting group. An empty array means the deck is complete
 * and legal.
 */
export function validateDeck(
  deck: DeckState,
  rules: FormatRules = { zones: [] },
  legalities: LegalityMap = {},
): DeckViolation[] {
  const violations: DeckViolation[] = [];
  const entries = deck.entries ?? [];

  // ── Deck-level requirements. These are game rules rather than format rules,
  // so they hold even for a sandbox format that constrains no zone.
  const legendEntry = entries.find((entry) => entry.zone === "legend");
  if (!legendEntry) {
    violations.push({
      code: "no_legend",
      severity: "error",
      zone: "legend",
      message: "This deck has no legend.",
    });
  }

  const championEntry = entries.find((entry) => entry.is_champion);
  if (!championEntry) {
    violations.push({
      code: "no_champion",
      severity: "error",
      zone: "main",
      message: "No main-deck card is flagged as the chosen champion.",
    });
  }

  // Removing the legend leaves the deck intact and reports domain coverage as
  // violations. Swapping legends is a normal thing to do, not a reset.
  const legendDomains = deck.legend_domains ?? (legendEntry ? domainsOf(legendEntry) : undefined);
  const legendDomainKeys = legendDomains?.map(domainKey);

  // ── Per-entry problems.
  for (const entry of entries) {
    const eligible = zoneForCard(entry.card_type, entry.supertype, entry.is_token);
    if (!eligible.includes(entry.zone)) {
      violations.push({
        code: "wrong_zone",
        severity: "error",
        zone: entry.zone,
        oracle_id: entry.oracle_id,
        printing_id: entry.printing_id,
        message: `${nameOf(entry)} cannot go in ${DECK_ZONE_LABELS[entry.zone]}; it belongs in ${eligible
          .map((zone) => DECK_ZONE_LABELS[zone])
          .join(" or ")}.`,
      });
    }

    // The champion is a flag on a main row, so it can only be flagged there.
    if (entry.is_champion && entry.zone !== "main") {
      violations.push({
        code: "wrong_zone",
        severity: "error",
        zone: entry.zone,
        oracle_id: entry.oracle_id,
        printing_id: entry.printing_id,
        message: `${nameOf(entry)} can only be the chosen champion from the main deck.`,
      });
    }

    if (entry.zone === SCRATCH_ZONE) continue;

    if (legendDomainKeys && DOMAIN_CHECKED_ZONES.includes(entry.zone)) {
      const uncovered = domainsOf(entry).filter(
        (domain) => !legendDomainKeys.includes(domainKey(domain)),
      );
      if (uncovered.length > 0) {
        violations.push({
          code: "domain_not_covered",
          severity: "error",
          zone: entry.zone,
          oracle_id: entry.oracle_id,
          printing_id: entry.printing_id,
          message: `${nameOf(entry)} is outside the legend's domains: ${uncovered.join(", ")} not covered by ${
            legendDomains && legendDomains.length > 0 ? legendDomains.join(", ") : "no domain"
          }.`,
        });
      }
    }

    const legality = resolveLegality(legalities, entry.oracle_id, entry.printing_id);
    if (legality.scope !== "default" && legality.status !== "legal") {
      const severity = legalitySeverity(legality.status, rules.severity_overrides);
      if (severity !== "none") {
        violations.push({
          code: "legality",
          severity,
          zone: entry.zone,
          oracle_id: entry.oracle_id,
          printing_id: entry.printing_id,
          scope: legality.scope,
          status: legality.status,
          message:
            legality.scope === "printing"
              ? `This printing of ${nameOf(entry)} is ${legality.status} in this format; another printing may be legal.`
              : `${nameOf(entry)} is ${legality.status} in this format.`,
        });
      }
    }
  }

  // ── Zone sizes.
  for (const zone of DECK_ZONES) {
    if (zone === SCRATCH_ZONE) continue;
    const rule = zoneRuleFor(rules, zone);
    if (!rule) continue;
    const count = entries
      .filter((entry) => entry.zone === zone)
      .reduce((sum, entry) => sum + entry.quantity, 0);
    if (rule.min_count !== null && rule.min_count !== undefined && count < rule.min_count) {
      violations.push({
        code: "zone_under_min",
        severity: "error",
        zone,
        count,
        limit: rule.min_count,
        message: `${DECK_ZONE_LABELS[zone]} has ${count} of the ${rule.min_count} cards this format requires.`,
      });
    }
    if (rule.max_count !== null && rule.max_count !== undefined && count > rule.max_count) {
      violations.push({
        code: "zone_over_max",
        severity: "error",
        zone,
        count,
        limit: rule.max_count,
        message: `${DECK_ZONE_LABELS[zone]} has ${count} cards; this format allows ${rule.max_count}.`,
      });
    }
  }

  // ── Copy limits, counted per oracle across a whole counting group. Three
  // copies split across two arts are three copies and two rows.
  const restrictedSeverity = legalitySeverity("restricted", rules.severity_overrides);
  for (const group of COUNTING_GROUPS) {
    const baseLimit = groupCopyLimit(rules, group);
    const totals = new Map<string, { count: number; name: string; restricted: boolean }>();

    for (const entry of entries) {
      if (!group.includes(entry.zone)) continue;
      const existing = totals.get(entry.oracle_id) ?? {
        count: 0,
        name: nameOf(entry),
        restricted: false,
      };
      existing.count += entry.quantity;
      // Restriction attaches to the oracle's copy count, so any restricted
      // printing of it lowers the limit for every copy in the group.
      if (resolveLegality(legalities, entry.oracle_id, entry.printing_id).status === "restricted") {
        existing.restricted = true;
      }
      totals.set(entry.oracle_id, existing);
    }

    for (const [oracleId, total] of totals) {
      if (baseLimit !== null && total.count > baseLimit) {
        violations.push({
          code: "copy_limit_exceeded",
          severity: "error",
          oracle_id: oracleId,
          count: total.count,
          limit: baseLimit,
          message: `${total.name}: ${total.count} copies across ${groupLabel(group)}; this format allows ${baseLimit}.`,
        });
        continue;
      }
      if (total.restricted && restrictedSeverity !== "none" && total.count > 1) {
        violations.push({
          code: "copy_limit_exceeded",
          severity: restrictedSeverity,
          oracle_id: oracleId,
          count: total.count,
          limit: 1,
          status: "restricted",
          message: `${total.name} is restricted in this format: ${total.count} copies across ${groupLabel(group)}, limit 1.`,
        });
      }
    }
  }

  return violations;
}

function groupLabel(group: readonly DeckZone[]): string {
  return group.map((zone) => DECK_ZONE_LABELS[zone]).join(" + ");
}
