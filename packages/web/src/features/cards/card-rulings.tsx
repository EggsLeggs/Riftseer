import type { CardRuling } from "@riftseer/types";

/**
 * Rulings first, then editorial notes; each group keeps the API's order, which
 * is oldest first.
 */
function orderedEntries(rulings: CardRuling[]): CardRuling[] {
  return [
    ...rulings.filter((entry) => entry.type === "ruling"),
    ...rulings.filter((entry) => entry.type === "note"),
  ];
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * `dated` is a plain `YYYY-MM-DD` date column. Eden Treaty revives ISO-looking
 * strings as `Date`, so accept both. Prefer the ISO date prefix (via
 * `toISOString` for Date values) over `toLocaleDateString` / local getters —
 * those hydrate-mismatch across locales and shift the calendar day.
 */
function formatDate(value: string | Date | undefined | null): string | null {
  if (value == null || value === "") return null;
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;
  const [, year, month, day] = match;
  const name = MONTHS[Number(month) - 1];
  if (!name) return null;
  return `${name} ${Number(day)} ${year}`;
}

/**
 * Rulings and notes for the printing being viewed.
 *
 * Laid out as a balanced two-column flow via CSS multi-column: entries vary a
 * lot in length, and columns fill better than a grid would. `break-inside-avoid`
 * keeps an entry and its date together in one column.
 *
 * Type (ruling vs note) and printing scope are admin concerns — not shown here.
 */
export function CardRulings({ rulings }: { rulings: CardRuling[] }) {
  if (rulings.length === 0) return null;

  return (
    <ul className="gap-x-10 md:columns-2">
      {orderedEntries(rulings).map((entry) => {
        const dated = formatDate(entry.dated);
        const meta = [dated, entry.source].filter(Boolean).join(" · ");
        return (
          <li key={entry.id} className="mb-5 break-inside-avoid last:mb-0">
            <p className="max-w-prose text-sm leading-relaxed whitespace-pre-line">
              {entry.text}
            </p>
            {meta ? (
              <p className="text-muted-foreground mt-1 text-xs italic">
                ({meta})
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
