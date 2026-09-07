"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { printingImageUrl, type Printing } from "@riftseer/types";

import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AppDialogContent } from "@/components/layout/clear-body-pointer-events";
import { cardsApi, cardsQueryKeys } from "@/features/cards/api";
import { RarityIcon } from "@/features/cards/card-icons";
import { formatEur, formatUsd, tcgplayerUsdPrice } from "@/features/cards/format";
import { cn } from "@/lib/utils";
import type { DeckCard } from "../types";

/**
 * Which art a deck row uses. Every printing of the row's oracle, one button
 * each, the current one marked — choosing another asks the editor to swap the
 * row, copies and champion flag intact.
 *
 * The list is `detail.printings` from the same card-detail query the rail, the
 * quick view and the card menu share, so opening this after any of those is
 * answered from cache.
 */
export function DeckPrintingPicker({
  card,
  onOpenChange,
  onSelect,
}: {
  /** The row being re-arted, or null while the picker is closed. */
  card: DeckCard | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (card: DeckCard, printing: Printing) => void;
}) {
  const printingId = card?.printing_id;
  const detail = useQuery({
    queryKey: cardsQueryKeys.detail({ printing: printingId ?? "" }),
    queryFn: () => cardsApi.getDetail({ printing: printingId! }),
    enabled: printingId != null,
    staleTime: Infinity,
  });

  const printings = detail.data?.printings ?? [];

  return (
    <Dialog open={card != null} onOpenChange={onOpenChange}>
      <AppDialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change printing</DialogTitle>
          <DialogDescription>
            {card ? `Pick which printing of ${card.name} this deck uses.` : "Pick a printing."}
          </DialogDescription>
        </DialogHeader>

        {detail.isPending ? (
          <div className="flex flex-col gap-2">
            {[0, 1].map((i) => (
              <div key={i} className="bg-muted h-16 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : detail.isError || printings.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Couldn&apos;t load this card&apos;s printings. Try again in a moment.
          </p>
        ) : (
          <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {printings.map((printing) => {
              const isCurrent = printing.id === card?.printing_id;
              const usd = formatUsd(tcgplayerUsdPrice(printing.prices?.tcgplayer));
              const eur = formatEur(printing.prices?.cardmarket?.normal);
              return (
                <li key={printing.id}>
                  <button
                    type="button"
                    disabled={isCurrent}
                    onClick={() => {
                      if (!card) return;
                      onSelect(card, printing);
                      onOpenChange(false);
                    }}
                    className={cn(
                      "border-input flex w-full items-center gap-3 rounded-lg border p-2 text-left text-sm",
                      isCurrent ? "bg-muted" : "hover:bg-muted/40",
                    )}
                  >
                    <img
                      src={printingImageUrl(printing, "small")}
                      alt=""
                      loading="lazy"
                      className="h-14 w-10 shrink-0 rounded object-contain"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {printing.set?.set_name ?? printing.set?.set_code}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums">
                        {printing.set?.set_code?.toUpperCase()}{" "}
                        {printing.collector_label ?? printing.collector_number}
                        {printing.rarity && <RarityIcon rarity={printing.rarity} />}
                      </span>
                    </span>
                    <span className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
                      <span className="block">{usd}</span>
                      <span className="block">{eur}</span>
                    </span>
                    {isCurrent && (
                      <CheckIcon className="size-4 shrink-0" aria-label="Current printing" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </AppDialogContent>
    </Dialog>
  );
}
