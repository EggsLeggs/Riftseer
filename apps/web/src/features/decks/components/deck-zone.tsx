"use client";

import * as React from "react";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CARD_GRID_COLUMNS } from "@/features/cards/card-display";
import { cn } from "@/lib/utils";
import { groupDeckCards, type DeckGroupMode } from "@riftseer/types/deck/grouping";
import { violationsForCard, type DeckViolationIndex } from "../deck-violations";
import type { DeckListView } from "../deck-views";
import type { DeckCard, DeckViolation, DeckZone as Zone } from "../types";
import { DeckCardRow } from "./deck-card-row";
import { DeckCardTile } from "./deck-card-tile";
import { useDeckZoneDroppable } from "./deck-dnd";
import { DeckViolationList, DeckViolationMarker } from "./deck-violation-list";

/**
 * A deck zone, rendered as grouped columns.
 *
 * The **only** zone renderer. Grouping comes from `groupDeckCards(cards, mode)`
 * and nothing here hard-codes "by type", so adding a grouping is a change in
 * `grouping.ts` plus an option in the mode select — not a second layout.
 */

/**
 * Zones whose contents are one card type by definition — the zone *is* the type.
 * Membership is enforced by `eligibleZones`, not by this list; this is only about
 * whether a heading repeating it earns its line.
 */
const HOMOGENEOUS_ZONES = new Set<Zone>(["legend", "runes", "battlefields"]);

/**
 * Stack overlap, as a fraction of column width (percentage margins resolve
 * against width). A portrait card is 140% of its width tall and the visible
 * band is ~17% of width — enough for the printed name line. Landscape cards
 * are 71% tall, same band. Chosen by looking, like `FRAMING`.
 */
const STACK_OVERLAP = {
  portrait: "[&>li+li]:-mt-[123%]",
  landscape: "[&>li+li]:-mt-[54%]",
} as const;

export interface DeckZoneProps {
  zone: Zone;
  label: string;
  cards: readonly DeckCard[];
  count: number;
  groupMode: DeckGroupMode;
  /** How the cards are drawn; grouping and order are the same in all three. */
  view?: DeckListView;
  canEdit: boolean;
  /** Hides tag chips without touching the tags. */
  showTags?: boolean;
  violations: DeckViolationIndex;
  /** Rendered per row where the flag exists; omitted elsewhere. */
  championable?: boolean;
  onQuantityChange?: (card: DeckCard, quantity: number) => void;
  onMoveZone?: (card: DeckCard, zone: Zone) => void;
  onToggleChampion?: (card: DeckCard, isChampion: boolean) => void;
  /** Opens the printing picker for a row. */
  onChangePrinting?: (card: DeckCard) => void;
  /** Opens the tags dialog for a row. */
  onEditTags?: (card: DeckCard) => void;
  onAdd?: (zone: Zone) => void;
  /** Fired when a row is pointed at or focused, for the art preview. */
  onPreview?: (card: DeckCard) => void;
  /** Fired when a card name is activated, for the quick view. */
  onOpenCard?: (card: DeckCard) => void;
  emptyHint?: string;
  /** Hide the zone title — used when a parent already names the section. */
  hideHeader?: boolean;
  className?: string;
}

export function DeckZoneSection({
  zone,
  label,
  cards,
  count,
  groupMode,
  view = "list",
  canEdit,
  showTags = true,
  violations,
  championable,
  onQuantityChange,
  onMoveZone,
  onToggleChampion,
  onChangePrinting,
  onEditTags,
  onAdd,
  onPreview,
  onOpenCard,
  emptyHint,
  hideHeader = false,
  className,
}: DeckZoneProps) {
  const groups = React.useMemo(() => groupDeckCards(cards, groupMode), [cards, groupMode]);
  const zoneViolations: DeckViolation[] = violations.byZone.get(zone) ?? [];
  // In a zone that only ever holds one kind of card, a lone heading says nothing
  // the zone header did not: Runes grouped by type reads "Rune" above a count the
  // header already carries. Anywhere else a single group is a fact about *this*
  // deck, so the heading stays and the list does not reflow as the deck changes.
  const showGroupHeadings = groups.length > 1 || !HOMOGENEOUS_ZONES.has(zone);
  // Battlefields are the one sideways zone; their tiles and stacks keep the
  // wide aspect rather than rotating the art.
  const landscape = zone === "battlefields";
  const drop = useDeckZoneDroppable(zone);
  const tileActions = {
    onQuantityChange,
    onMoveZone,
    onToggleChampion: championable ? onToggleChampion : undefined,
    onChangePrinting,
    onEditTags,
  };

  return (
    <section
      ref={drop.ref}
      className={cn(
        "min-w-0 rounded-lg",
        drop.canReceive && "ring-1 ring-ring/40",
        drop.isOver && "bg-accent/30 ring-2 ring-ring",
        className,
      )}
      aria-labelledby={`deck-zone-${zone}`}
    >
      {hideHeader ? (
        <h2 id={`deck-zone-${zone}`} className="sr-only">
          {label}
        </h2>
      ) : (
        <div className="mb-2 flex items-center gap-2 border-b pb-1.5">
          <h2 id={`deck-zone-${zone}`} className="text-sm font-semibold">
            {label}
          </h2>
          <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
          <DeckViolationMarker violations={zoneViolations} decorative />
          {canEdit && onAdd && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-2 text-xs"
              onClick={() => onAdd(zone)}
            >
              <PlusIcon className="size-3" aria-hidden="true" />
              Add
            </Button>
          )}
        </div>
      )}

      {zoneViolations.length > 0 && (
        <DeckViolationList violations={zoneViolations} className="mb-2" />
      )}

      {cards.length === 0 ? (
        <p className="text-muted-foreground py-2 text-xs">{emptyHint ?? "Nothing here yet."}</p>
      ) : view === "list" ? (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <div key={group.key} className="min-w-0 break-inside-avoid">
              {/* The count is bracketed rather than trailing: a heading whose
                  label is itself a number — "4 energy" — otherwise runs into it
                  and reads as one figure. */}
              {showGroupHeadings && <GroupHeading group={group} />}
              <ul>
                {group.cards.map((card) => (
                  <DeckCardRow
                    key={`${card.zone}:${card.printing_id}`}
                    card={card}
                    canEdit={canEdit}
                    violations={violationsForCard(violations, card)}
                    onQuantityChange={onQuantityChange}
                    onMoveZone={onMoveZone}
                    onToggleChampion={championable ? onToggleChampion : undefined}
                    onChangePrinting={onChangePrinting}
                    onEditTags={onEditTags}
                    showTags={showTags}
                    onPreview={onPreview}
                    onOpenCard={onOpenCard}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : view === "grid" ? (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.key} className="min-w-0">
              {showGroupHeadings && <GroupHeading group={group} />}
              <ul
                className={cn(
                  "grid gap-3",
                  landscape ? CARD_GRID_COLUMNS.landscape : CARD_GRID_COLUMNS.portrait,
                )}
              >
                {group.cards.map((card) => (
                  <li key={`${card.zone}:${card.printing_id}`}>
                    <DeckCardTile
                      card={card}
                      canEdit={canEdit}
                      violations={violationsForCard(violations, card)}
                      actions={tileActions}
                      onOpenCard={onOpenCard}
                      landscape={landscape}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 items-start gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {groups.map((group) => (
            <div key={group.key} className="min-w-0">
              {showGroupHeadings && <GroupHeading group={group} />}
              <ul className={landscape ? STACK_OVERLAP.landscape : STACK_OVERLAP.portrait}>
                {group.cards.map((card) => (
                  <li
                    key={`${card.zone}:${card.printing_id}`}
                    // A lifted card must rise above the later siblings that
                    // normally paint over its bottom half.
                    className="relative hover:z-10 focus-within:z-10"
                  >
                    <DeckCardTile
                      card={card}
                      canEdit={canEdit}
                      violations={violationsForCard(violations, card)}
                      actions={tileActions}
                      onOpenCard={onOpenCard}
                      landscape={landscape}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function GroupHeading({ group }: { group: { label: string; count: number } }) {
  return (
    <h3 className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
      {group.label}
      <span className="ml-1.5 tabular-nums">({group.count})</span>
    </h3>
  );
}
