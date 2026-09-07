"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { EllipsisIcon } from "lucide-react";
import { printingImageUrl } from "@riftseer/types";

import {
  AppContextMenuContent,
  AppDropdownMenuContent,
} from "@/components/layout/clear-body-pointer-events";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cardsApi, cardsQueryKeys } from "@/features/cards/api";
import { ChampionIcon } from "@/features/cards/card-icons";
import { cardHref } from "@riftseer/types/render";
import { cn } from "@/lib/utils";
import { DeckCardMenuItems, type DeckCardMenuActions } from "./deck-card-menu";
import { useDeckCardDraggable } from "./deck-dnd";
import { DeckViolationMarker } from "./deck-violation-list";
import type { DeckCard, DeckViolation } from "../types";

/**
 * One card in the grid and stack views: the art, with the row's facts as
 * overlays — copies, champion mark, violations — and the same card menu the list row
 * has, on the same two triggers (`⋯` and right-click). Clicking the art is the
 * intercepted link the list row's name is, so the quick view opens and
 * ⌘-click still works.
 *
 * The art comes from the deck payload's derived `image`; only a guest deck
 * lacks one (localStorage stores no URLs), and then the tile falls back to the
 * card-detail fetch every other deck surface already caches.
 */

function useTileImageUrl(card: DeckCard): string | undefined {
  const detail = useQuery({
    queryKey: cardsQueryKeys.detail({ printing: card.printing_id }),
    queryFn: () => cardsApi.getDetail({ printing: card.printing_id }),
    enabled: card.image == null,
    staleTime: Infinity,
  });
  if (card.image) return card.image.normal ?? card.image.original;
  const printing = detail.data?.printing;
  return printing ? printingImageUrl(printing, "normal") : undefined;
}

export function DeckCardTile({
  card,
  canEdit,
  violations,
  actions,
  onOpenCard,
  landscape = false,
}: {
  card: DeckCard;
  canEdit: boolean;
  violations: readonly DeckViolation[];
  actions: DeckCardMenuActions;
  onOpenCard?: (card: DeckCard) => void;
  /** Battlefields are printed sideways; their tiles keep the wide aspect. */
  landscape?: boolean;
}) {
  const imageUrl = useTileImageUrl(card);
  const [failed, setFailed] = React.useState(false);
  const drag = useDeckCardDraggable(card, !canEdit);

  const openCard = onOpenCard
    ? (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        onOpenCard(card);
      }
    : undefined;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={drag.ref}
          className={cn("group/tile relative", drag.isDragging && "opacity-40")}
          {...drag.handleProps}
        >
          <Link
            href={cardHref({ id: card.printing_id, public_slug: card.public_slug })}
            title={card.tags.length > 0 ? `${card.name} — ${card.tags.join(", ")}` : card.name}
            onClick={openCard}
            className={cn(
              "bg-muted/40 block overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
              landscape ? "aspect-[7/5]" : "aspect-[5/7]",
            )}
          >
            {imageUrl && !failed ? (
              <img
                src={imageUrl}
                alt={card.name}
                loading="lazy"
                decoding="async"
                onError={() => setFailed(true)}
                className="size-full object-cover"
              />
            ) : (
              <span className="text-muted-foreground flex size-full items-center justify-center p-2 text-center text-xs">
                {card.name}
              </span>
            )}
          </Link>

          <span
            className="bg-background/85 pointer-events-none absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums"
            aria-label={`${card.quantity} ${card.quantity === 1 ? "copy" : "copies"}`}
          >
            {card.quantity}
          </span>

          <span className="pointer-events-none absolute top-1 left-1 flex items-center gap-1">
            {card.is_champion && (
              <span className="bg-background/85 rounded p-0.5">
                <ChampionIcon className="size-3.5" />
              </span>
            )}
            {violations.length > 0 && (
              <span className="bg-background/85 rounded p-0.5">
                <DeckViolationMarker violations={violations} />
              </span>
            )}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions for ${card.name}`}
                className="bg-background/85 text-muted-foreground hover:text-foreground absolute top-1 right-1 rounded p-1 opacity-0 transition-opacity group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 pointer-coarse:opacity-70 data-[state=open]:opacity-100"
              >
                <EllipsisIcon className="size-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <AppDropdownMenuContent align="end" className="w-52">
              <DeckCardMenuItems
                kind="dropdown"
                card={card}
                canEdit={canEdit}
                actions={actions}
              />
            </AppDropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <AppContextMenuContent className="w-52">
        <DeckCardMenuItems kind="context" card={card} canEdit={canEdit} actions={actions} />
      </AppContextMenuContent>
    </ContextMenu>
  );
}
