/**
 * Coerce a card/set date into the `YYYY-MM-DD` value an `<input type="date">`
 * expects.
 *
 * `Printing.released_at` and `SetInfo.publishedOn` are typed as ISO date strings,
 * but they originate from Postgres `date` columns and have been observed
 * arriving as timestamps and as non-string values depending on the API build
 * behind `NEXT_PUBLIC_API_URL`. The admin forms must not crash on that, so this
 * accepts anything and falls back to an empty (unset) field.
 */
export function toDateInputValue(value: unknown): string {
  if (value == null) return "";

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : toIsoDate(value);
  }

  if (typeof value === "number") {
    // Postgres never yields epochs here, but a JSON date can arrive as one;
    // treat values too small to be milliseconds as seconds.
    const ms = Math.abs(value) < 1e11 ? value * 1000 : value;
    const parsed = new Date(ms);
    return Number.isNaN(parsed.getTime()) ? "" : toIsoDate(parsed);
  }

  const raw = String(value).trim();
  if (!raw) return "";
  // Already `YYYY-MM-DD`, possibly with a time component to drop.
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : toIsoDate(parsed);
}

/** Local calendar date — `toISOString()` would shift dates west of UTC. */
function toIsoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
