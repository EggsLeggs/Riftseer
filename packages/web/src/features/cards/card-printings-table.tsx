import Link from "next/link";
import type { CardPrintingSummary } from "@riftseer/types";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEur, formatUsd } from "@/features/cards/format";
import { RarityIcon } from "@/features/cards/card-icons";
import { cardHref } from "@/features/cards/paths";
import { cn } from "@/lib/utils";

/** Shared widths so stacked name-led tables keep Set / # columns aligned. */
const NAME_COL = {
  name: "w-[72%]",
  set: "w-[16%]",
  number: "w-[12%]",
} as const;

/**
 * Table of related printings — used for other printings, tokens and
 * champions/legends. `label` is the first-column header (replaces a separate
 * section title): "Prints" when showing sets, or e.g. "Champions" when showing
 * names. Non-current rows use a stretched real link so the whole row is
 * clickable (middle-click / status-bar preview still work).
 */
export function CardPrintingsTable({
  rows,
  label,
  showName = false,
  showRarity = false,
  showPrices = false,
  caption,
}: {
  rows: CardPrintingSummary[];
  /** First-column header — section title in place of "Name" / "Set". */
  label: string;
  /** Off for other printings of the same card, where every name is identical. */
  showName?: boolean;
  /** Only the Prints table shows rarity (printings differ by rarity/finish). */
  showRarity?: boolean;
  showPrices?: boolean;
  caption: string;
}) {
  // Name-led tables: Name | Set | # (shared fixed widths → columns align across tables).
  // Prints table: Set | # | Rarity? | prices?
  if (showName) {
    return (
      <Table className="table-fixed">
        <caption className="sr-only">{caption}</caption>
        <TableHeader className="[&_tr]:border-b-0">
          <TableRow className="border-b-0 bg-foreground/8 hover:bg-foreground/8 dark:bg-muted/60 dark:hover:bg-muted/60">
            <TableHead
              className={cn(
                NAME_COL.name,
                "text-foreground/70 font-semibold tracking-wide uppercase dark:text-muted-foreground",
              )}
            >
              {label}
            </TableHead>
            <TableHead
              className={cn(NAME_COL.set, "text-muted-foreground")}
            >
              Set
            </TableHead>
            <TableHead
              className={cn(NAME_COL.number, "text-muted-foreground")}
            >
              #
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const href = row.is_current ? null : cardHref(row);
            return (
              <TableRow
                key={row.id}
                className={cn(
                  "relative",
                  row.is_current
                    ? "bg-muted font-medium"
                    : "hover:bg-muted/40",
                )}
              >
                <TableCell
                  className={cn(NAME_COL.name, "min-w-0 whitespace-normal")}
                >
                  <RowHitTarget href={href}>{row.name}</RowHitTarget>
                </TableCell>
                <TableCell
                  className={cn(
                    NAME_COL.set,
                    "text-muted-foreground uppercase",
                  )}
                >
                  {row.set_code ?? "—"}
                </TableCell>
                <TableCell className={cn(NAME_COL.number, "tabular-nums")}>
                  {row.collector_label ?? "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  return (
    <Table className="table-fixed">
      <caption className="sr-only">{caption}</caption>
      <TableHeader className="[&_tr]:border-b-0">
        <TableRow className="border-b-0 bg-foreground/8 hover:bg-foreground/8 dark:bg-muted/60 dark:hover:bg-muted/60">
          <TableHead className="text-foreground/70 w-[40%] font-semibold tracking-wide uppercase dark:text-muted-foreground">
            {label}
          </TableHead>
          <TableHead className="text-muted-foreground w-[12%]">#</TableHead>
          {showRarity ? (
            <TableHead className="text-muted-foreground w-[20%] max-w-0 overflow-hidden">
              Rarity
            </TableHead>
          ) : null}
          {showPrices ? (
            <>
              <TableHead className="text-muted-foreground w-[14%] text-right whitespace-nowrap">
                USD
              </TableHead>
              <TableHead className="text-muted-foreground w-[14%] text-right whitespace-nowrap">
                EUR
              </TableHead>
            </>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const href = row.is_current ? null : cardHref(row);
          return (
            <TableRow
              key={row.id}
              className={cn(
                "relative",
                row.is_current
                  ? "bg-muted font-medium"
                  : "hover:bg-muted/40",
              )}
            >
              <TableCell className="w-[40%] whitespace-normal">
                <RowHitTarget href={href}>
                  <span className="uppercase">{row.set_code ?? "—"}</span>
                  {row.set_name ? (
                    <span className="text-muted-foreground ml-1.5 hidden sm:inline">
                      {row.set_name}
                    </span>
                  ) : null}
                </RowHitTarget>
              </TableCell>
              <TableCell className="w-[12%] tabular-nums">
                {row.collector_label ?? "—"}
              </TableCell>
              {showRarity ? (
                <TableCell className="text-muted-foreground w-[20%] max-w-0 overflow-hidden">
                  {row.rarity ? (
                    <span className="flex min-w-0 items-center gap-1.5">
                      <RarityIcon rarity={row.rarity} />
                      <span className="min-w-0 truncate" title={row.rarity}>
                        {row.rarity}
                      </span>
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
              ) : null}
              {showPrices ? (
                <>
                  <TableCell className="w-[14%] text-right tabular-nums whitespace-nowrap">
                    {formatUsd(row.prices?.tcgplayer?.normal)}
                  </TableCell>
                  <TableCell className="w-[14%] text-right tabular-nums whitespace-nowrap">
                    {formatEur(row.prices?.cardmarket?.normal)}
                  </TableCell>
                </>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * Visible cell content plus an `::after` that stretches to the row so the
 * entire row is the hit target. Link stays inside a `<td>` (valid HTML).
 */
function RowHitTarget({
  href,
  children,
}: {
  href: string | null;
  children: React.ReactNode;
}) {
  if (!href) return <>{children}</>;
  return (
    <Link
      href={href}
      className="after:absolute after:inset-0 after:content-['']"
    >
      {children}
    </Link>
  );
}
