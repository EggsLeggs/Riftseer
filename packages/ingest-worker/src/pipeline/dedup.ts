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

import type { Card, CardMediaUrls } from "@riftseer/types";
import { logger } from "../utils.ts";

const MEDIA_URL_SIZES = [
  "small",
  "normal",
  "large",
  "original",
  "png",
] as const satisfies readonly (keyof CardMediaUrls)[];

/**
 * Fill only the sizes the survivor lacks. Replacing the whole map would drop a
 * survivor's own `small`/`large` merely because a duplicate carried a `normal`.
 */
function fillMissingMediaUrls(survivor: Card, other: Card): void {
  const otherUrls = other.media?.media_urls;
  if (!otherUrls) return;

  const merged: CardMediaUrls = { ...survivor.media?.media_urls };
  let filled = false;
  for (const size of MEDIA_URL_SIZES) {
    if (!merged[size] && otherUrls[size]) {
      merged[size] = otherUrls[size];
      filled = true;
    }
  }
  if (filled) survivor.media = { ...survivor.media, media_urls: merged };
}

function printedCollectorKey(card: Card): string {
  const [, fromRiftboundId] =
    card.external_ids?.riftbound_id?.match(/^[^-]+-([^-]+)-/i) ?? [];
  if (fromRiftboundId) return fromRiftboundId.toLowerCase();

  const base = card.collector_number ?? "";
  if (card.metadata?.alternate_art && /^\d+$/.test(base)) return `${base}a`;
  if (card.metadata?.signature && base) return `${base}*`;
  return base.toLowerCase();
}

function dedupKey(card: Card): string {
  const set = card.set?.set_code ?? "";
  const riftboundId = card.external_ids?.riftbound_id?.trim().toLowerCase();
  if (riftboundId) {
    // The full Riftbound id identifies the printing. Promo collections can
    // reuse collector numbers across unrelated cards, so the printed collector
    // segment alone is not globally unique within every synthetic promo set.
    return `${set}|${riftboundId}`;
  }

  const collector = printedCollectorKey(card);
  return `${set}|${collector}|${card.name_normalized}`;
}

/** True when this record already has a TCGPlayer id (preferred survivor). */
function hasTcgId(card: Card): boolean {
  return Boolean(card.external_ids?.tcgplayer_id);
}

/** Prefer records whose variant metadata agrees with the printed collector id. */
function variantSignalScore(card: Card): number {
  const collector = printedCollectorKey(card);
  let score = 0;
  if (
    collector.endsWith("a") &&
    (card.metadata?.alternate_art || /\balternate art\b/i.test(card.name))
  ) {
    score += 2;
  }
  if (
    collector.endsWith("*") &&
    (card.metadata?.signature || /\bsignature\b/i.test(card.name))
  ) {
    score += 2;
  }
  if (card.metadata?.overnumbered || /\bovernumbered\b/i.test(card.name)) {
    score += 1;
  }
  return score;
}

/** Pick the survivor of a duplicate group and fold in data the survivor lacks. */
function collapseGroup(group: Card[]): Card {
  const sorted = [...group].sort((a, b) => {
    const signalDifference = variantSignalScore(b) - variantSignalScore(a);
    if (signalDifference !== 0) return signalDifference;
    if (hasTcgId(a) !== hasTcgId(b)) return hasTcgId(a) ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  const [survivor, ...dropped] = sorted;

  for (const other of dropped) {
    if (!survivor.external_ids?.tcgplayer_id && other.external_ids?.tcgplayer_id) {
      survivor.external_ids = {
        ...survivor.external_ids,
        tcgplayer_id: other.external_ids.tcgplayer_id,
      };
    }
    fillMissingMediaUrls(survivor, other);
  }
  return survivor;
}

/**
 * Collapse duplicate printings in place-preserving input order of survivors.
 * Returns the deduped list; logs how many rows were removed.
 */
export function collapseDuplicates(cards: Card[]): Card[] {
  const groups = new Map<string, Card[]>();
  for (const card of cards) {
    const key = dedupKey(card);
    const g = groups.get(key);
    if (g) g.push(card);
    else groups.set(key, [card]);
  }

  const out: Card[] = [];
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
      input: cards.length,
      output: out.length,
      removed,
    });
  }
  return out;
}
