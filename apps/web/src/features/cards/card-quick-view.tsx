"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { printingImageUrl } from "@riftseer/types";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cardsApi, cardsQueryKeys } from "./api";
import { CardArt } from "./card-art";
import { CardBuyLinks } from "./card-buy-links";
import { CardTypeLine, DomainRunes, EnergyCost, MightStat, PowerStat } from "./card-icons";
import { CardLegalityGrid } from "./card-legalities";
import { CardPrintingsTable } from "./card-printings-table";
import { CardRulings } from "./card-rulings";
import { CardTags } from "./card-tags";
import { CardText } from "./card-text";
import { cardHref, meaningfulCardDomains } from "@riftseer/types/render";
import { cardIsLandscapeOriented, meaningfulRulesText } from "./format";

/**
 * The card a quick view is about, as much of it as the opening list already
 * knows. Name and slug come from the row, so the dialog has a title and a
 * working link the instant it opens rather than after the fetch lands.
 */
export interface CardQuickViewTarget {
  printing_id: string;
  name: string;
  public_slug: string | null;
}

/**
 * A card, read without leaving the page.
 *
 * Everything below is the component the card page uses — art, type line, rules
 * text, legalities, rulings, buy links — so this is a second *arrangement* of
 * the card, never a second description of one. The title is a link to the full
 * page, which is the way out of the dialog and into everything it omits:
 * printings, related cards, tools.
 */
export function CardQuickView<T extends CardQuickViewTarget>({
  target,
  siblings = [],
  onOpenChange,
  onSelect,
}: {
  /** The card to show, or null when the dialog is closed. */
  target: T | null;
  /**
   * The list `target` came from, in the order the reader sees it. Prev and Next
   * appear only when this holds more than one card and `onSelect` is given.
   */
  siblings?: readonly T[];
  onOpenChange: (open: boolean) => void;
  /** Move the dialog to another card in `siblings`. */
  onSelect?: (target: T) => void;
}) {
  const printingId = target?.printing_id;
  const query = useQuery({
    queryKey: cardsQueryKeys.detail({ printing: printingId ?? "" }),
    queryFn: () => cardsApi.getDetail({ printing: printingId! }),
    enabled: printingId != null,
    staleTime: Infinity,
  });

  const index = target ? siblings.findIndex((card) => card.printing_id === target.printing_id) : -1;
  const canNavigate = onSelect != null && index >= 0 && siblings.length > 1;
  const previous = canNavigate ? siblings[index - 1] : undefined;
  const next = canNavigate ? siblings[index + 1] : undefined;

  // Card two of a deck is a different card, not more of card one: a dialog left
  // scrolled into the previous card's rulings would open Next halfway down.
  const scroller = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [printingId]);

  const detail = query.data;
  const oracle = detail?.oracle;
  const printing = detail?.printing;
  const domains = oracle ? meaningfulCardDomains(oracle) : [];
  const rulesText = meaningfulRulesText(oracle?.text?.plain);
  const setLine = printing
    ? [printing.set?.set_code?.toUpperCase(), printing.collector_label ?? printing.collector_number]
        .filter(Boolean)
        .join(" ")
    : "";

  return (
    <Dialog open={target != null} onOpenChange={onOpenChange}>
      <DialogContent
        ref={scroller}
        showCloseButton={false}
        className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"
      >
        {target && (
          <>
            <div className="flex items-center justify-end gap-2">
              {canNavigate && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!previous}
                    onClick={() => previous && onSelect?.(previous)}
                  >
                    <ChevronLeftIcon className="size-3.5" aria-hidden="true" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!next}
                    onClick={() => next && onSelect?.(next)}
                  >
                    Next
                    <ChevronRightIcon className="size-3.5" aria-hidden="true" />
                  </Button>
                </>
              )}
              <DialogClose asChild>
                <Button variant="outline" size="sm">
                  <XIcon className="size-3.5" aria-hidden="true" />
                  Close
                </Button>
              </DialogClose>
            </div>

            <div className="grid gap-5 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
              <div className="flex flex-col gap-3">
                {query.isPending ? (
                  <div className="bg-muted aspect-[5/7] w-full animate-pulse rounded-xl" />
                ) : (
                  <CardArt
                    imageUrl={printingImageUrl(printing, "normal")}
                    name={printing?.image_alt_text ?? target.name}
                    isLandscape={printing ? cardIsLandscapeOriented(printing) : false}
                  />
                )}
                {detail && printing && (
                  <CardBuyLinks purchase={detail.purchase} printing={printing} />
                )}
              </div>

              <div className="flex min-w-0 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <DialogTitle asChild>
                    <h2 className="tk-arpona min-w-0 text-xl font-bold tracking-tight">
                      <Link
                        href={cardHref({
                          id: target.printing_id,
                          public_slug: target.public_slug,
                        })}
                        className="underline-offset-4 hover:underline"
                      >
                        {oracle?.name ?? target.name}
                      </Link>
                    </h2>
                  </DialogTitle>
                  {oracle && (
                    <span className="inline-flex shrink-0 items-center gap-2">
                      {oracle.energy != null && (
                        <EnergyCost energy={oracle.energy} oracle={oracle} />
                      )}
                      {oracle.power != null && <PowerStat power={oracle.power} />}
                    </span>
                  )}
                </div>
                <DialogDescription className="sr-only">
                  {target.name}. Open the card name for the full card page.
                </DialogDescription>

                {oracle && printing && (
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex min-w-0 flex-wrap items-center gap-2 text-sm">
                      <CardTypeLine oracle={oracle} rarity={printing.rarity} badge linked />
                      {oracle.tags.length > 0 && <CardTags tags={oracle.tags} linked />}
                    </div>
                    {domains.length > 0 && (
                      <DomainRunes domains={domains} className="shrink-0" linked />
                    )}
                  </div>
                )}

                {rulesText && oracle && (
                  <CardText
                    text={rulesText}
                    rich={oracle.text?.rich}
                    className="text-foreground mt-4 max-w-prose text-[0.95rem] leading-relaxed"
                    linkKeywords
                  />
                )}

                {oracle?.might_bonus != null && (
                  <div className="border-border/60 mt-4 max-w-prose border-l-2 pl-4">
                    <h3 className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wider uppercase">
                      Equipped unit
                    </h3>
                    <MightStat might={oracle.might_bonus} signed />
                    {oracle.text?.equipment?.trim() && (
                      <CardText
                        text={oracle.text.equipment}
                        className="text-foreground mt-1.5 text-[0.95rem] leading-relaxed"
                        linkKeywords
                      />
                    )}
                  </div>
                )}

                {oracle?.might != null && (
                  <div className="mt-3 flex justify-end">
                    <MightStat might={oracle.might} />
                  </div>
                )}

                {printing?.flavour_text?.trim() && (
                  <p className="text-muted-foreground mt-4 max-w-prose text-sm italic whitespace-pre-line">
                    {printing.flavour_text}
                  </p>
                )}

                {setLine && (
                  <p className="text-muted-foreground mt-4 text-xs tabular-nums">
                    {setLine}
                    {printing?.artist ? ` · ${printing.artist}` : ""}
                  </p>
                )}

                {detail && oracle && printing && detail.printings.length > 0 && (
                  <div className="mt-6 overflow-x-auto">
                    <CardPrintingsTable
                      rows={detail.printings}
                      oracleName={oracle.name}
                      currentPrintingId={printing.id}
                      showPrices
                    />
                  </div>
                )}

                {detail && detail.legalities.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
                      Legality
                    </h3>
                    <CardLegalityGrid legalities={detail.legalities} className="sm:grid-cols-2" />
                  </div>
                )}
              </div>
            </div>

            {detail && detail.rulings.length > 0 && (
              <section aria-label={`Notes and rules information for ${target.name}`}>
                <h3 className="text-muted-foreground mb-3 text-sm font-semibold tracking-wide uppercase">
                  Notes &amp; rulings
                </h3>
                <CardRulings rulings={detail.rulings} />
              </section>
            )}

            {query.isError && (
              <p className="text-muted-foreground text-sm">
                This card could not be loaded.{" "}
                <Link
                  href={cardHref({
                    id: target.printing_id,
                    public_slug: target.public_slug,
                  })}
                  className="underline underline-offset-4"
                >
                  Open its page
                </Link>{" "}
                instead.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
