"use client";

import * as React from "react";
import Link from "next/link";
import { EllipsisIcon } from "lucide-react";

import {
  AppContextMenuContent,
  AppDropdownMenuContent,
} from "@/components/layout/clear-body-pointer-events";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChampionIcon } from "@/features/cards/card-icons";
import { cardHref } from "@/features/cards/paths";
import { cn } from "@/lib/utils";
import { DeckCardMenuItems, type DeckCardMenuActions } from "./deck-card-menu";
import { useDeckCardDraggable } from "./deck-dnd";
import type { DeckCard, DeckViolation, DeckZone } from "../types";
import { DeckViolationMarker } from "./deck-violation-list";

/**
 * One line of a deck list, in every zone.
 *
 * Deliberately generic: the zone decides which affordances to hand this row
 * (the champion toggle only exists where champions do), and the row itself has
 * no idea which zone it is in beyond the move menu. A second, zone-specific row
 * component is how a builder ends up with five slightly different lists.
 *
 * Beyond the stepper, every action lives in `DeckCardMenuItems`, reached two
 * ways: the `⋯` button and a right-click anywhere on the row. Readers get the
 * menu too — theirs holds only the buy links.
 */

export interface DeckCardRowProps {
  card: DeckCard;
  canEdit: boolean;
  violations: readonly DeckViolation[];
  onQuantityChange?: (card: DeckCard, quantity: number) => void;
  onMoveZone?: (card: DeckCard, zone: DeckZone) => void;
  /** Provided only where the flag means something, which today is `main`. */
  onToggleChampion?: (card: DeckCard, isChampion: boolean) => void;
  /** Opens the printing picker for this row. */
  onChangePrinting?: (card: DeckCard) => void;
  /** Opens the tags dialog for this row. */
  onEditTags?: (card: DeckCard) => void;
  /** Hides the tag chips without touching the tags themselves. */
  showTags?: boolean;
  /** Fired when the row is pointed at or focused, for the art preview. */
  onPreview?: (card: DeckCard) => void;
  /**
   * Fired when the card name is activated. Supplied, the name opens the quick
   * view; omitted, it stays an ordinary link to the card page.
   */
  onOpenCard?: (card: DeckCard) => void;
}

export function DeckCardRow({
  card,
  canEdit,
  violations,
  onQuantityChange,
  onMoveZone,
  onToggleChampion,
  onChangePrinting,
  onEditTags,
  showTags = true,
  onPreview,
  onOpenCard,
}: DeckCardRowProps) {
  const editable = canEdit && !!onQuantityChange;
  const drag = useDeckCardDraggable(card, !editable);

  const preview = React.useMemo(
    () => (onPreview ? () => onPreview(card) : undefined),
    [card, onPreview],
  );

  // The name stays a real link even while it opens a dialog: a plain click is
  // intercepted, but ⌘/ctrl/shift-click, a middle click and "copy link address"
  // all keep working, and the href is what a crawler and a hovering reader see.
  const openCard = React.useMemo(
    () =>
      onOpenCard
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
        : undefined,
    [card, onOpenCard],
  );

  const menuActions: DeckCardMenuActions = {
    onQuantityChange,
    onMoveZone,
    onToggleChampion,
    onChangePrinting,
    onEditTags,
  };

  const printing = { id: card.printing_id, public_slug: card.public_slug };
  const setLine = [card.set_code?.toUpperCase(), card.collector_number]
    .filter(Boolean)
    .join(" ");

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          ref={drag.ref}
          // items-start, not center: a long name wraps rather than truncating,
          // and the row's chrome should hug its first line.
          className={cn(
            "group/row hover:bg-muted/40 flex items-start gap-2 rounded-md px-1.5 py-1 text-sm",
            drag.isDragging && "opacity-40",
          )}
          // `onFocus` bubbles from the link and the stepper, so tabbing through the
          // list drives the preview exactly as pointing at it does.
          onMouseEnter={preview}
          onFocus={preview}
          {...drag.handleProps}
        >
          {editable ? (
            <DeckQuantity
              value={card.quantity}
              label={card.name}
              onChange={(next) => onQuantityChange?.(card, next)}
            />
          ) : (
            <span className="text-muted-foreground w-6 shrink-0 self-start py-0.5 text-right text-xs tabular-nums">
              {card.quantity}
            </span>
          )}

          <Link
            href={cardHref(printing)}
            className="min-w-0 flex-1 py-0.5 break-words underline-offset-4 hover:underline"
            onClick={openCard}
          >
            {card.name}
          </Link>

          {card.is_champion && (
            <ChampionIcon className="size-3.5 self-start py-0.5" />
          )}

          <DeckViolationMarker violations={violations} className="shrink-0" />

          {showTags && card.tags.length > 0 && (
            <span className="hidden shrink-0 items-center gap-1 md:flex">
              {card.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="bg-muted text-muted-foreground max-w-24 truncate rounded-full px-1.5 py-px text-[10px]"
                >
                  {tag}
                </span>
              ))}
              {card.tags.length > 2 && (
                <span className="text-muted-foreground text-[10px] tabular-nums">
                  +{card.tags.length - 2}
                </span>
              )}
            </span>
          )}

          {setLine && (
            <span className="text-muted-foreground hidden shrink-0 text-[11px] tabular-nums sm:inline">
              {setLine}
            </span>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions for ${card.name}`}
                // Quiet like the stepper's buttons, but never gone on a touch
                // screen — with no hover, this button is the way in.
                className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-60 data-[state=open]:opacity-100"
              >
                <EllipsisIcon className="size-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <AppDropdownMenuContent align="end" className="w-52">
              <DeckCardMenuItems
                kind="dropdown"
                card={card}
                canEdit={canEdit}
                actions={menuActions}
              />
            </AppDropdownMenuContent>
          </DropdownMenu>
        </li>
      </ContextMenuTrigger>
      <AppContextMenuContent className="w-52">
        <DeckCardMenuItems kind="context" card={card} canEdit={canEdit} actions={menuActions} />
      </AppContextMenuContent>
    </ContextMenu>
  );
}

/**
 * The row's copy count: a quiet number that becomes an input when clicked.
 *
 * No − / + — the number is the whole control. Commit on Enter or blur, Escape
 * cancels, and `0` removes the card, exactly as the menu's Remove does. The
 * menu still offers 1–4 for the pointer-only path.
 */
function DeckQuantity({
  value,
  label,
  onChange,
}: {
  value: number;
  label: string;
  onChange: (next: number) => void;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);

  if (draft === null) {
    return (
      <button
        type="button"
        title="Click to edit the count"
        aria-label={`${value} ${value === 1 ? "copy" : "copies"} of ${label} — edit`}
        onClick={() => setDraft(String(value))}
        className="text-muted-foreground hover:bg-muted hover:text-foreground w-6 shrink-0 self-start rounded py-0.5 text-right text-xs tabular-nums"
      >
        {value}
      </button>
    );
  }

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = Number.parseInt(raw.trim(), 10);
    if (Number.isNaN(parsed)) return;
    const next = Math.min(Math.max(Math.round(parsed), 0), 99);
    if (next !== value) onChange(next);
  };

  return (
    <input
      // `text` with a numeric keypad, not `number`: spinners are the very
      // chrome this control exists to avoid.
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoFocus
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit(event.currentTarget.value);
        }
        if (event.key === "Escape") setDraft(null);
      }}
      className="border-input bg-background focus-visible:ring-ring w-6 shrink-0 self-start rounded border py-0.5 text-right text-xs tabular-nums outline-none focus-visible:ring-2"
    />
  );
}
