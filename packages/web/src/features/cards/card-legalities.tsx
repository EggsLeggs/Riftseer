import type { CardLegality, CardLegalityStatus } from "@riftseer/types";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<CardLegalityStatus, string> = {
  legal: "Legal",
  not_legal: "Not legal",
  banned: "Banned",
};

/**
 * Colour reinforces the label, never replaces it — the text is always rendered,
 * so the palette is a second signal rather than the only one. Tints match the
 * rest of the site's badges instead of solid fills.
 */
const STATUS_STYLES: Record<CardLegalityStatus, string> = {
  legal: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  not_legal: "bg-muted text-muted-foreground",
  banned: "bg-destructive/12 text-destructive",
};

/**
 * Fixed-width status chip. The width is what lets a column of these line up so
 * the format names all start at the same x-position.
 */
export function LegalityStatusBadge({
  status,
  className,
}: {
  status: CardLegalityStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-[5.75rem] shrink-0 items-center justify-center rounded-md px-1.5 py-1 text-[0.65rem] font-semibold tracking-wider uppercase",
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Status chip + format name, flowed into columns. Every active format is
 * present — a card with nothing stored still reads "Legal" — so this renders
 * only when formats exist at all.
 *
 * `className` overrides the column behaviour, because the available width
 * differs a lot between the detailed table row and the simple layout.
 */
export function CardLegalityGrid({
  legalities,
  className,
}: {
  legalities: CardLegality[];
  className?: string;
}) {
  if (legalities.length === 0) return null;

  return (
    <ul
      className={cn(
        "grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2",
        className,
      )}
    >
      {legalities.map((legality) => (
        <li key={legality.format_id} className="flex items-start gap-2.5">
          <LegalityStatusBadge status={legality.status} />
          {/* Wraps rather than truncating — a clipped "Stand…" is worse than a
              format name on two lines. */}
          <span className="min-w-0 text-sm leading-6">
            {legality.format_name}
          </span>
        </li>
      ))}
    </ul>
  );
}
