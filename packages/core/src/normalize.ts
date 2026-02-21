/**
 * Shared name normalisation for card lookups.
 * Used by providers so in-memory indexes and queries use the same key format.
 */

export function normalizeCardName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['\u2019-]/g, "") // apostrophes, right-single-quote, hyphens
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
