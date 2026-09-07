"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";

import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { cardsApi, cardsQueryKeys } from "@/features/cards/api";
import { ChampionIcon } from "@/features/cards/card-icons";
import { cardMarketLinks } from "@/features/cards/card-buy-links";
import { DECK_ZONE_LABELS } from "@riftseer/types/deck";
import { eligibleZones } from "@riftseer/types/deck/add";
import type { DeckCard, DeckZone } from "../types";

/**
 * The one menu a deck card has, whichever way it was opened.
 *
 * The same items render inside a `DropdownMenuContent` (the row's `⋯` button)
 * and a `ContextMenuContent` (right-click on the row) — Radix gives the two
 * menus separate components, so the items take a kit of them rather than being
 * written twice. Everything the menu can do is a handler the row already has;
 * the menu adds no second write path.
 *
 * The buy links are the same `cardMarketLinks()` the preview rail renders,
 * fed by the card-detail query the rail and quick view already cache. The
 * component only mounts while its menu is open, so the fetch is on-demand.
 */

/** The set-quantity shortcuts. The row's stepper covers everything else. */
const QUANTITY_CHOICES = [1, 2, 3, 4];

export interface DeckCardMenuActions {
  onQuantityChange?: (card: DeckCard, quantity: number) => void;
  onMoveZone?: (card: DeckCard, zone: DeckZone) => void;
  /** Provided only where the flag means something, which today is `main`. */
  onToggleChampion?: (card: DeckCard, isChampion: boolean) => void;
  /** Opens the printing picker; the picker owns the actual swap. */
  onChangePrinting?: (card: DeckCard) => void;
  /** Opens the tags dialog — saved decks only; a guest deck has no tag store. */
  onEditTags?: (card: DeckCard) => void;
}

interface MenuItemProps {
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  variant?: "default" | "destructive";
  onSelect?: (event: Event) => void;
  asChild?: boolean;
}

interface DeckCardMenuKit {
  Item: React.ComponentType<MenuItemProps>;
  Sub: React.ComponentType<{ children?: React.ReactNode }>;
  SubTrigger: React.ComponentType<{ children?: React.ReactNode; disabled?: boolean }>;
  SubContent: React.ComponentType<{ children?: React.ReactNode; className?: string }>;
  Separator: React.ComponentType<{ className?: string }>;
}

const KITS: Record<"dropdown" | "context", DeckCardMenuKit> = {
  dropdown: {
    Item: DropdownMenuItem,
    Sub: DropdownMenuSub,
    SubTrigger: DropdownMenuSubTrigger,
    SubContent: DropdownMenuSubContent,
    Separator: DropdownMenuSeparator,
  },
  context: {
    Item: ContextMenuItem,
    Sub: ContextMenuSub,
    SubTrigger: ContextMenuSubTrigger,
    SubContent: ContextMenuSubContent,
    Separator: ContextMenuSeparator,
  },
};

export function DeckCardMenuItems({
  kind,
  card,
  canEdit,
  actions,
}: {
  kind: "dropdown" | "context";
  card: DeckCard;
  canEdit: boolean;
  actions: DeckCardMenuActions;
}) {
  const kit = KITS[kind];
  const { onQuantityChange, onMoveZone, onToggleChampion, onChangePrinting, onEditTags } = actions;
  const editable = canEdit && !!onQuantityChange;

  // This component exists only while its menu is open, so the query runs the
  // first time a card's menu opens and is answered from cache — shared with
  // the rail and the quick view — every time after.
  const detail = useQuery({
    queryKey: cardsQueryKeys.detail({ printing: card.printing_id }),
    queryFn: () => cardsApi.getDetail({ printing: card.printing_id }),
    staleTime: Infinity,
  });

  const moveTargets = eligibleZones(card).filter((zone) => zone !== card.zone);
  const markets =
    detail.data?.purchase && detail.data.printing
      ? cardMarketLinks(detail.data.purchase, detail.data.printing)
      : [];
  const otherPrintings = (detail.data?.printings?.length ?? 0) > 1;

  return (
    <>
      {editable && (
        <>
          <kit.Sub>
            <kit.SubTrigger>Quantity</kit.SubTrigger>
            <kit.SubContent>
              {QUANTITY_CHOICES.map((quantity) => (
                <kit.Item key={quantity} onSelect={() => onQuantityChange?.(card, quantity)}>
                  <span className="w-3 text-right tabular-nums">{quantity}</span>
                  {card.quantity === quantity && (
                    <CheckIcon className="ml-auto size-3.5" aria-hidden="true" />
                  )}
                </kit.Item>
              ))}
            </kit.SubContent>
          </kit.Sub>

          {onMoveZone && moveTargets.length > 0 && (
            <kit.Sub>
              <kit.SubTrigger>Move to</kit.SubTrigger>
              <kit.SubContent>
                {moveTargets.map((zone) => (
                  <kit.Item key={zone} onSelect={() => onMoveZone(card, zone)}>
                    {DECK_ZONE_LABELS[zone]}
                  </kit.Item>
                ))}
              </kit.SubContent>
            </kit.Sub>
          )}

          {onToggleChampion && (
            <kit.Item onSelect={() => onToggleChampion(card, !card.is_champion)}>
              <ChampionIcon className="size-4" />
              {card.is_champion ? "Unset champion" : "Mark as champion"}
            </kit.Item>
          )}

          {onChangePrinting && (detail.isPending || otherPrintings) && (
            <kit.Item disabled={detail.isPending} onSelect={() => onChangePrinting(card)}>
              Change printing…
            </kit.Item>
          )}

          {onEditTags && (
            <kit.Item onSelect={() => onEditTags(card)}>
              {card.tags.length > 0 ? `Tags (${card.tags.length})…` : "Tags…"}
            </kit.Item>
          )}

          {(detail.isPending || markets.length > 0) && <kit.Separator />}
        </>
      )}

      {detail.isPending ? (
        <kit.Item disabled>Loading prices…</kit.Item>
      ) : markets.length === 0 && !editable ? (
        // A reader's menu is only the buy links; empty, it must still say why
        // it opened at all.
        <kit.Item disabled>No store links for this printing</kit.Item>
      ) : (
        markets.map((market) => (
          <kit.Item key={market.name} asChild>
            <a href={market.url} target="_blank" rel="noreferrer nofollow">
              <img src={market.logoSrc} alt="" width={16} height={16} className="size-4" />
              Buy on {market.name}
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                {market.price}
              </span>
            </a>
          </kit.Item>
        ))
      )}

      {editable && (
        <>
          <kit.Separator />
          <kit.Item variant="destructive" onSelect={() => onQuantityChange?.(card, 0)}>
            Remove
          </kit.Item>
        </>
      )}
    </>
  );
}
