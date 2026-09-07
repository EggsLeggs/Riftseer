"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AppSelectContent } from "@/components/layout/clear-body-pointer-events";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DECK_BUY_AFFILIATE_LABELS,
  DECK_BUY_AFFILIATES,
  cardmarketCatalogUrl,
  deckBuyLines,
  formatBuyLine,
  groupBuyLines,
  tcgplayerMassEntryUrl,
  type BuyableCard,
  type BuyableToken,
  type DeckBuyAffiliate,
} from "../deck-buy";

/**
 * A shopping list for the deck: pick a store, choose what to include, open
 * their list-import page. Prices are omitted — deck rows do not carry them,
 * and fetching sixty card details just to sum a number is the wrong cost.
 */
export function DeckBuyDialog({
  cards,
  tokens = [],
  open,
  onOpenChange,
}: {
  cards: readonly BuyableCard[];
  tokens?: readonly BuyableToken[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [affiliate, setAffiliate] = React.useState<DeckBuyAffiliate>("tcgplayer");
  const [includeTokens, setIncludeTokens] = React.useState(false);
  const [includeSetCodes, setIncludeSetCodes] = React.useState(true);

  const lines = React.useMemo(
    () => deckBuyLines(cards, tokens, { includeTokens, includeSetCodes }),
    [cards, tokens, includeTokens, includeSetCodes],
  );
  const groups = React.useMemo(() => groupBuyLines(lines), [lines]);
  const copies = lines.reduce((sum, line) => sum + line.quantity, 0);

  const go = async () => {
    if (lines.length === 0) {
      toast.error("Nothing to buy yet.");
      return;
    }
    if (affiliate === "cardmarket") {
      try {
        await navigator.clipboard.writeText(
          lines.map((line) => formatBuyLine(line, includeSetCodes)).join("\n"),
        );
        toast.success("List copied. Paste it into Cardmarket.");
      } catch {
        toast.error("Could not copy the list.");
      }
      window.open(cardmarketCatalogUrl(), "_blank", "noreferrer,nofollow");
    } else {
      window.open(tcgplayerMassEntryUrl(lines, includeSetCodes), "_blank", "noreferrer,nofollow");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Buy options</DialogTitle>
          <DialogDescription>
            Open a store with this deck as a shopping list. Purchases through TCGPlayer may earn
            Riftseer a commission.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deck-buy-affiliate">Store</Label>
              <Select
                value={affiliate}
                onValueChange={(value) => setAffiliate(value as DeckBuyAffiliate)}
              >
                <SelectTrigger id="deck-buy-affiliate" aria-label="Store" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <AppSelectContent>
                  {DECK_BUY_AFFILIATES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {DECK_BUY_AFFILIATE_LABELS[option]}
                    </SelectItem>
                  ))}
                </AppSelectContent>
              </Select>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                Options
              </legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeTokens}
                  disabled={tokens.length === 0}
                  onChange={(event) => setIncludeTokens(event.target.checked)}
                />
                Include connected tokens
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeSetCodes}
                  onChange={(event) => setIncludeSetCodes(event.target.checked)}
                />
                Include set codes
              </label>
            </fieldset>
          </div>

          <div className="min-w-0">
            <p className="mb-2 text-sm font-medium">
              Cards{" "}
              <span className="text-muted-foreground font-normal tabular-nums">
                ({copies} selected)
              </span>
            </p>
            <ScrollArea className="h-64 rounded-md border">
              {groups.length === 0 ? (
                <p className="text-muted-foreground p-3 text-sm">Nothing in the list yet.</p>
              ) : (
                <div className="flex flex-col gap-3 p-3">
                  {groups.map((group) => (
                    <section key={group.key}>
                      <h3 className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                        {group.label}
                      </h3>
                      <ul className="flex flex-col gap-1 text-sm">
                        {group.lines.map((line) => (
                          <li
                            key={`${line.zone}:${line.name}:${line.setCode ?? ""}`}
                            className="flex gap-2"
                          >
                            <span className="text-muted-foreground w-6 shrink-0 text-right tabular-nums">
                              {line.quantity}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate">{line.name}</span>
                              {includeSetCodes && line.setCode && (
                                <span className="text-muted-foreground text-xs">
                                  {line.setCode.toUpperCase()}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void go()} disabled={lines.length === 0}>
            Buy @ {DECK_BUY_AFFILIATE_LABELS[affiliate]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
