/**
 * Collapse genuine RiftCodex duplicates.
 *
 * RiftCodex sometimes returns the same printing under two (or three) Mongo ids —
 * observed heavily in the VEN set, where each card appears once with a
 * `tcgplayer_id` and once without (see Phase 0 findings). Collector numbers are
 * unique within a set, but RiftCodex's numeric `collector_number` omits printed
 * suffixes like `042a` and `310*`. Use the printed collector segment from
 * `riftbound_id` when present, so real alternate/signature printings survive.
 *
 * We keep one canonical record per group, preferring the one that already carries
 * a `tcgplayer_id` (so price enrichment works), and backfill a missing
 * tcgplayer_id / image onto the survivor from the dropped duplicates. Ties break
 * on the lexicographically smallest id so the choice is stable across runs.
 */

import type { IngestPrinting } from "./types.ts";
import { logger } from "../utils.ts";

function printedCollectorKey(printing: IngestPrinting): string {
  const [, fromRiftboundId] =
    printing.riftbound_id?.match(/^[^-]+-([^-]+)-/i) ?? [];
  if (fromRiftboundId) return fromRiftboundId.toLowerCase();

  const base = printing.collector_number ?? "";
  if (printing.is_alternate_art && /^\d+$/.test(base)) return `${base}a`;
  if (printing.is_signature && base) return `${base}*`;
  return base.toLowerCase();
}

function dedupKey(printing: IngestPrinting): string {
  const set = printing.set_code ?? "";
  const riftboundId = printing.riftbound_id?.trim().toLowerCase();
  if (riftboundId) {
    // The full Riftbound id identifies the printing. Promo collections can
    // reuse collector numbers across unrelated cards, so the printed collector
    // segment alone is not globally unique within every synthetic promo set.
    return `${set}|${riftboundId}`;
  }

  const collector = printedCollectorKey(printing);
  return `${set}|${collector}|${printing.name_normalized}`;
}

/** Prefer records whose variant metadata agrees with the printed collector id. */
function variantSignalScore(printing: IngestPrinting): number {
  const collector = printedCollectorKey(printing);
  let score = 0;
  if (
    collector.endsWith("a") &&
    (printing.is_alternate_art || /\balternate art\b/i.test(printing.name))
  ) {
    score += 2;
  }
  if (
    collector.endsWith("*") &&
    (printing.is_signature || /\bsignature\b/i.test(printing.name))
  ) {
    score += 2;
  }
  if (printing.is_overnumbered || /\bovernumbered\b/i.test(printing.name)) {
    score += 1;
  }
  return score;
}

/** Pick the survivor of a duplicate group and fold in data the survivor lacks. */
function collapseGroup(group: IngestPrinting[]): IngestPrinting {
  const sorted = [...group].sort((a, b) => {
    const signalDifference = variantSignalScore(b) - variantSignalScore(a);
    if (signalDifference !== 0) return signalDifference;
    const aHasTcg = Boolean(a.tcgplayer_id);
    const bHasTcg = Boolean(b.tcgplayer_id);
    if (aHasTcg !== bHasTcg) return aHasTcg ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  const [survivor, ...dropped] = sorted;

  for (const other of dropped) {
    if (!survivor.tcgplayer_id && other.tcgplayer_id) {
      survivor.tcgplayer_id = other.tcgplayer_id;
    }
    if (!survivor.image_source_url && other.image_source_url) {
      survivor.image_source_url = other.image_source_url;
      survivor.image_source_provider = other.image_source_provider;
    }
  }
  return survivor;
}

/**
 * Collapse duplicate printings, preserving input order of survivors.
 * Returns the deduped list; logs how many rows were removed.
 */
export function collapseDuplicates(printings: IngestPrinting[]): IngestPrinting[] {
  const groups = new Map<string, IngestPrinting[]>();
  for (const printing of printings) {
    const key = dedupKey(printing);
    const g = groups.get(key);
    if (g) g.push(printing);
    else groups.set(key, [printing]);
  }

  const out: IngestPrinting[] = [];
  let removed = 0;
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    out.push(collapseGroup(group));
    removed += group.length - 1;
  }

  if (removed > 0) {
    logger.info("Collapsed duplicate printings", {
      input: printings.length,
      output: out.length,
      removed,
    });
  }
  return out;
}
