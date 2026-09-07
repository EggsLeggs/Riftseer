"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { printingImageUrl } from "@riftseer/types";

import { cardsApi, cardsQueryKeys } from "@/features/cards/api";
import { CardArt } from "@/features/cards/card-art";
import { CardBuyLinks } from "@/features/cards/card-buy-links";
import { cardIsLandscapeOriented } from "@/features/cards/format";
import { cardHref } from "@riftseer/types/render";
import { cn } from "@/lib/utils";
import type { DeckCard } from "../types";

/**
 * The card the list is pointing at: its art, and where to buy it.
 *
 * A deck row carries no image URL and cannot derive one — `resolved_printings`
 * records only *whether* art is hosted, and the derivation in
 * `@riftseer/types/card-image` needs the source hash for its cache-busting
 * suffix. So the card detail is fetched per previewed card and cached forever
 * by TanStack Query: one request per distinct card, and none until the reader
 * points at something.
 *
 * Detail rather than the lighter `/printings/:id` because the buy links have to
 * come from `purchase`, which is the API's resolution of stored URI → product
 * page → name search, already rewritten for affiliate attribution. A printing's
 * raw `purchase_uris` is only the first of those three.
 */
export function DeckCardPreview({
  card,
  className,
}: {
  /** The card to show, or null when the deck is empty. */
  card: DeckCard | null;
  className?: string;
}) {
  const printingId = card?.printing_id;
  const detail = useQuery({
    queryKey: cardsQueryKeys.detail({ printing: printingId ?? "" }),
    queryFn: () => cardsApi.getDetail({ printing: printingId! }),
    enabled: printingId != null,
    staleTime: Infinity,
  });

  const printing = detail.data?.printing;
  const setLine = card
    ? [card.set_code?.toUpperCase(), card.collector_number].filter(Boolean).join(" ")
    : "";

  return (
    <aside className={cn("w-56 shrink-0 xl:w-64", className)} aria-label="Card preview">
      <div className="sticky top-4 flex flex-col gap-3">
        {card == null ? (
          <div className="bg-muted/40 text-muted-foreground flex aspect-[5/7] items-center justify-center rounded-xl p-4 text-center text-xs">
            Point at a card to see it here.
          </div>
        ) : detail.isPending ? (
          // Deliberately not `CardArt` with no URL: that renders "image coming
          // soon", which is a claim about the card rather than about the fetch.
          <div className="bg-muted aspect-[5/7] w-full animate-pulse rounded-xl" />
        ) : (
          <CardArt
            imageUrl={printingImageUrl(printing, "normal")}
            name={card.name}
            isLandscape={printing ? cardIsLandscapeOriented(printing) : false}
          />
        )}

        {card && (
          <div className="min-w-0">
            <Link
              href={cardHref({ id: card.printing_id, public_slug: card.public_slug })}
              className="block truncate text-sm font-medium underline-offset-4 hover:underline"
              title={card.name}
            >
              {card.name}
            </Link>
            {setLine && (
              <p className="text-muted-foreground text-xs tabular-nums">{setLine}</p>
            )}
          </div>
        )}

        {detail.data && printing && (
          <CardBuyLinks purchase={detail.data.purchase} printing={printing} />
        )}
      </div>
    </aside>
  );
}

/**
 * What the preview shows before anything is pointed at: the card that most
 * identifies the deck. The legend first, then whichever card was nominated
 * champion, then simply the first row.
 */
export function defaultPreviewCard(cards: readonly DeckCard[]): DeckCard | null {
  return (
    cards.find((card) => card.zone === "legend") ??
    cards.find((card) => card.is_champion) ??
    cards[0] ??
    null
  );
}
