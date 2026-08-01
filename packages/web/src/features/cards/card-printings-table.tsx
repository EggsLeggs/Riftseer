import Link from "next/link";
import type { OracleRef, Printing } from "@riftseer/types";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RarityIcon } from "@/features/cards/card-icons";
import {
  formatEur,
  formatUsd,
  tcgplayerUsdPrice,
} from "@/features/cards/format";
import { cardHref, oracleHref } from "@/features/cards/paths";
import { cn } from "@/lib/utils";

function printingAccessibleName(printing: Printing, oracleName: string): string {
  const usd = tcgplayerUsdPrice(printing.prices?.tcgplayer);
  return [
    oracleName,
    printing.set?.set_name ?? printing.set?.set_code,
    printing.collector_label ? `#${printing.collector_label}` : undefined,
    printing.rarity,
    usd != null ? formatUsd(usd) : undefined,
  ].filter(Boolean).join(", ");
}

export function CardPrintingsTable({
  rows,
  oracleName,
  currentPrintingId,
  showPrices = false,
}: {
  rows: Printing[];
  oracleName: string;
  currentPrintingId: string;
  showPrices?: boolean;
}) {
  return (
    <Table className="table-fixed">
      <caption className="sr-only">All printings of {oracleName}</caption>
      <TableHeader className="[&_tr]:border-b-0">
        <TableRow className="border-b-0 bg-foreground/8 hover:bg-foreground/8 dark:bg-muted/60 dark:hover:bg-muted/60">
          <TableHead className="text-foreground/70 w-[40%] font-semibold tracking-wide uppercase dark:text-muted-foreground">
            Prints
          </TableHead>
          <TableHead className="text-muted-foreground w-[12%]">#</TableHead>
          <TableHead className="text-muted-foreground w-[20%] max-w-0 overflow-hidden">
            Rarity
          </TableHead>
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
        {rows.map((printing) => {
          const isCurrent = printing.id === currentPrintingId;
          return (
            <TableRow
              key={printing.id}
              className={cn(
                "relative",
                isCurrent ? "bg-muted font-medium" : "hover:bg-muted/40",
              )}
            >
              <TableCell className="w-[40%] whitespace-normal">
                <RowHitTarget
                  href={isCurrent ? null : cardHref(printing)}
                  label={printingAccessibleName(printing, oracleName)}
                >
                  <span className="uppercase">{printing.set?.set_code ?? "—"}</span>
                  {printing.set?.set_name ? (
                    <span className="text-muted-foreground ml-1.5 hidden sm:inline">
                      {printing.set.set_name}
                    </span>
                  ) : null}
                </RowHitTarget>
              </TableCell>
              <TableCell className="w-[12%] tabular-nums">
                {printing.collector_label ?? printing.collector_number ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground w-[20%] max-w-0 overflow-hidden">
                {printing.rarity ? (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <RarityIcon rarity={printing.rarity} />
                    <span className="min-w-0 truncate" title={printing.rarity}>
                      {printing.rarity}
                    </span>
                  </span>
                ) : "—"}
              </TableCell>
              {showPrices ? (
                <>
                  <TableCell className="w-[14%] text-right tabular-nums whitespace-nowrap">
                    {formatUsd(tcgplayerUsdPrice(printing.prices?.tcgplayer))}
                  </TableCell>
                  <TableCell className="w-[14%] text-right tabular-nums whitespace-nowrap">
                    {formatEur(printing.prices?.cardmarket?.normal)}
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

export function OracleReferencesTable({
  rows,
  label,
  caption,
}: {
  rows: OracleRef[];
  label: string;
  caption: string;
}) {
  return (
    <Table className="table-fixed">
      <caption className="sr-only">{caption}</caption>
      <TableHeader className="[&_tr]:border-b-0">
        <TableRow className="border-b-0 bg-foreground/8 hover:bg-foreground/8 dark:bg-muted/60 dark:hover:bg-muted/60">
          <TableHead className="text-foreground/70 font-semibold tracking-wide uppercase dark:text-muted-foreground">
            {label}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((oracle) => (
          <TableRow key={oracle.id} className="relative hover:bg-muted/40">
            <TableCell className="min-w-0 whitespace-normal">
              <RowHitTarget href={oracleHref(oracle)} label={oracle.name}>
                {oracle.name}
              </RowHitTarget>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RowHitTarget({
  href,
  label,
  children,
}: {
  href: string | null;
  label?: string;
  children: React.ReactNode;
}) {
  if (!href) return <>{children}</>;
  return (
    <Link
      href={href}
      aria-label={label}
      className="after:absolute after:inset-0 after:content-['']"
    >
      {children}
    </Link>
  );
}
