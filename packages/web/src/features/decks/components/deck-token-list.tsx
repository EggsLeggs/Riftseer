"use client";

import * as React from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cardsApi, cardsQueryKeys, type CardResult } from "@/features/cards/api";
import {
  CARD_GRID_CELL_CLASS,
  CARD_GRID_COLUMNS,
  CardThumbnail,
} from "@/features/cards/card-display";
import { cardIsLandscapeOriented } from "@/features/cards/format";
import { cardHref } from "@/features/cards/paths";
import { useSitePreferences } from "@/features/site-preferences/site-preferences-provider";
import { cn } from "@/lib/utils";
import type { DeckCard, DeckToken } from "../types";

/**
 * The tokens this deck makes, as art.
 *
 * Derived from `makes_token` edges, never stored membership — so there is no
 * quantity, no stepper and no remove. A token leaves this shelf by cutting the
 * card that makes it, which is what the hover tooltip is for: it names the deck
 * cards responsible, so the way to remove a token is never a mystery.
 *
 * The cell is search's gallery cell, so the ⌘F behaviour and the name-placement
 * preference are the same here as everywhere else rather than a second
 * implementation that drifts.
 */
export function DeckTokenList({
  tokens,
  cards,
}: {
  tokens: readonly DeckToken[];
  /** The deck's own rows, which is where a source oracle id becomes a name. */
  cards: readonly DeckCard[];
}) {
  const { accessibility } = useSitePreferences();
  const cardNamePlacement = accessibility.showCardNamesBelowSearch ? "below" : "overlay";

  // Art and oracle both come from the detail payload the quick view and the
  // preview rail already cache, so a token opened or hovered elsewhere costs
  // nothing here.
  const details = useQueries({
    queries: tokens.map((token) => ({
      queryKey: cardsQueryKeys.detail({ printing: token.printing_id }),
      queryFn: () => cardsApi.getDetail({ printing: token.printing_id }),
      staleTime: Infinity,
    })),
  });

  const nameByOracle = React.useMemo(() => {
    const names = new Map<string, string>();
    for (const card of cards) names.set(card.oracle_id, card.name);
    return names;
  }, [cards]);

  if (tokens.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No cards in this deck make tokens.
      </p>
    );
  }

  const resolved = details.map((query) => query.data ?? undefined);
  const allLandscape =
    resolved.length > 0 &&
    resolved.every((detail) => detail != null && cardIsLandscapeOriented(detail.printing));

  return (
    <ul
      className={cn(
        "grid gap-4",
        allLandscape ? CARD_GRID_COLUMNS.landscape : CARD_GRID_COLUMNS.portrait,
      )}
    >
      {tokens.map((token, index) => {
        const detail = resolved[index];
        const result: CardResult | undefined = detail
          ? { oracle: detail.oracle, printing: detail.printing }
          : undefined;
        const sources = sourceNames(token, nameByOracle);

        return (
          <li key={token.printing_id}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={cardHref({ id: token.printing_id, public_slug: token.public_slug })}
                  title={token.name}
                  aria-label={token.name}
                  className={CARD_GRID_CELL_CLASS}
                >
                  {result ? (
                    <CardThumbnail
                      card={result}
                      isLandscape={cardIsLandscapeOriented(result.printing)}
                      naturalLandscapeLayout={allLandscape}
                      cardName={token.name}
                      cardNamePlacement={cardNamePlacement}
                    />
                  ) : (
                    <div
                      className={cn(
                        "bg-muted w-full animate-pulse rounded-lg",
                        allLandscape ? "aspect-[7/5]" : "aspect-[5/7]",
                      )}
                    />
                  )}
                </Link>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm items-start">
                <div>
                  <p>
                    {sources.length === 0
                      ? "This token comes from a card no longer in the deck."
                      : `This token is in the deck because of the following ${sources.length} card${
                          sources.length === 1 ? "" : "s"
                        }:`}
                  </p>
                  {sources.length > 0 && (
                    <ul className="mt-1 list-disc pl-4">
                      {sources.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The deck cards that put this token here.
 *
 * `sources` is oracle ids, and the deck already holds the names, so no lookup
 * leaves the page. A source with no matching row is dropped rather than shown
 * as an id: ingest changing an edge must never make this panel look broken.
 */
function sourceNames(token: DeckToken, nameByOracle: Map<string, string>): string[] {
  const names = new Set<string>();
  for (const oracleId of token.sources) {
    const name = nameByOracle.get(oracleId);
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
