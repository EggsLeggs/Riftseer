import type { Card, RelatedCard } from "./card.ts";
import { normalizeCardName } from "./parser.ts";

/** Minimal fields needed to order printings of the same card name. */
export interface PrintingRef {
  published_on?: string;
  collector_number?: string;
  id?: string;
}

/** Release timestamp used for printing order; unknown dates sort last. */
export function releaseTime(ref: PrintingRef): number {
  const raw = ref.published_on;
  if (!raw) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

/** Oldest set first, then collector number, then id so the order never wobbles. */
export function comparePrintingRefs(a: PrintingRef, b: PrintingRef): number {
  const releaseA = releaseTime(a);
  const releaseB = releaseTime(b);
  if (releaseA !== releaseB) return releaseA - releaseB;
  const byCollector = (a.collector_number ?? "").localeCompare(
    b.collector_number ?? "",
    undefined,
    { numeric: true },
  );
  if (byCollector !== 0) return byCollector;
  return (a.id ?? "").localeCompare(b.id ?? "");
}

function printingRefFromCard(card: Card): PrintingRef {
  return {
    published_on: card.set?.published_on ?? card.released_at,
    collector_number: card.collector_number,
    id: card.id,
  };
}

function printingRefFromStub(stub: RelatedCard): PrintingRef {
  return {
    published_on: stub.published_on,
    collector_number: stub.collector_number,
    id: stub.id,
  };
}

/** Strip trailing parenthetical qualifiers, e.g. "(Alternate Art)". */
export function printingBaseName(name: string): string {
  let s = name.trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(/\s*\([^)]*\)\s*$/, "").trim();
  } while (s !== prev);
  return normalizeCardName(s);
}

/** True when every related printing is an alt-art sibling (same base name, different title). */
export function onlyAltArtSiblings(card: Card): boolean {
  const related = card.related_printings ?? [];
  if (!related.length) return false;

  const myBase = printingBaseName(card.name);
  const myNorm = normalizeCardName(card.name);

  return related.every((stub) => {
    const stubBase = printingBaseName(stub.name);
    return stubBase === myBase && normalizeCardName(stub.name) !== myNorm;
  });
}

/**
 * Whether a printing should show a "Reprint" label in browse/search UIs.
 * Alt-art variants are excluded; true reprints are detected via older non-alt
 * siblings when stub metadata is present (set / date / collector).
 */
export function isReprintPrinting(card: Card): boolean {
  if (card.metadata?.alternate_art) return false;

  const related = card.related_printings ?? [];
  if (!related.length) return false;
  if (onlyAltArtSiblings(card)) return false;

  const olderCandidates = related.filter((stub) => !stub.alternate_art);
  if (!olderCandidates.length) return false;

  const hasPrintingHints = olderCandidates.some(
    (stub) =>
      stub.set_code != null ||
      stub.published_on != null ||
      stub.collector_number != null,
  );
  if (!hasPrintingHints) return false;

  const self = printingRefFromCard(card);
  return olderCandidates.some(
    (stub) => comparePrintingRefs(printingRefFromStub(stub), self) < 0,
  );
}
