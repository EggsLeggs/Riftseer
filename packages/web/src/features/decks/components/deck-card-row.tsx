"use client";

import * as React from "react";
import Link from "next/link";
import { CrownIcon } from "lucide-react";

import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { cardHref } from "@/features/cards/paths";
import { cn } from "@/lib/utils";
import { DECK_ZONE_LABELS } from "@riftseer/types/deck";
import { eligibleZones } from "../deck-add";
import type { DeckCard, DeckViolation, DeckZone } from "../types";
import { DeckViolationMarker } from "./deck-violation-list";

/**
 * One line of a deck list, in every zone.
 *
 * Deliberately generic: the zone decides which affordances to hand this row
 * (the champion toggle only exists where champions do), and the row itself has
 * no idea which zone it is in beyond the move menu. A second, zone-specific row
 * component is how a builder ends up with five slightly different lists.
 */

export interface DeckCardRowProps {
  card: DeckCard;
  canEdit: boolean;
  violations: readonly DeckViolation[];
  onQuantityChange?: (card: DeckCard, quantity: number) => void;
  onMoveZone?: (card: DeckCard, zone: DeckZone) => void;
  /** Provided only where the flag means something, which today is `main`. */
  onToggleChampion?: (card: DeckCard, isChampion: boolean) => void;
}

export function DeckCardRow({
  card,
  canEdit,
  violations,
  onQuantityChange,
  onMoveZone,
  onToggleChampion,
}: DeckCardRowProps) {
  const editable = canEdit && !!onQuantityChange;
  const moveTargets = React.useMemo(
    () =>
      eligibleZones({
        oracle_id: card.oracle_id,
        printing_id: card.printing_id,
        card_type: card.card_type,
        supertype: card.supertype,
        is_token: card.is_token,
      }).filter((zone) => zone !== card.zone),
    [card.card_type, card.is_token, card.oracle_id, card.printing_id, card.supertype, card.zone],
  );

  const printing = { id: card.printing_id, public_slug: card.public_slug };
  const setLine = [card.set_code?.toUpperCase(), card.collector_number]
    .filter(Boolean)
    .join(" ");

  return (
    <li className="group/row hover:bg-muted/40 flex items-center gap-2 rounded-md px-1.5 py-1 text-sm">
      {editable ? (
        <QuantityStepper
          size="sm"
          value={card.quantity}
          min={0}
          label={card.name}
          onChange={(next) => onQuantityChange?.(card, next)}
        />
      ) : (
        <span className="text-muted-foreground w-6 shrink-0 text-right tabular-nums">
          {card.quantity}
        </span>
      )}

      <Link
        href={cardHref(printing)}
        className="min-w-0 flex-1 truncate underline-offset-4 hover:underline"
        title={card.name}
      >
        {card.name}
      </Link>

      {card.is_champion && (
        <CrownIcon
          className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
          aria-label="Champion"
        />
      )}

      <DeckViolationMarker violations={violations} className="shrink-0" />

      {setLine && (
        <span className="text-muted-foreground hidden shrink-0 text-[11px] tabular-nums sm:inline">
          {setLine}
        </span>
      )}

      {card.energy != null && (
        <span className="text-muted-foreground w-4 shrink-0 text-right text-[11px] tabular-nums">
          {card.energy}
        </span>
      )}

      {editable && (
        <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100">
          {onToggleChampion && (
            <button
              type="button"
              onClick={() => onToggleChampion(card, !card.is_champion)}
              aria-pressed={card.is_champion}
              title={card.is_champion ? "Unset champion" : "Mark as champion"}
              className={cn(
                "hover:text-foreground rounded p-0.5",
                card.is_champion ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
              )}
            >
              <CrownIcon className="size-3.5" aria-hidden="true" />
              <span className="sr-only">
                {card.is_champion ? "Unset champion" : "Mark as champion"}
              </span>
            </button>
          )}
          {onMoveZone && moveTargets.length > 0 && (
            <select
              aria-label={`Move ${card.name} to another zone`}
              value=""
              onChange={(event) => {
                const zone = event.target.value as DeckZone;
                if (zone) onMoveZone(card, zone);
              }}
              className="border-input bg-background text-muted-foreground h-6 rounded-md border px-1 text-[11px]"
            >
              <option value="">Move…</option>
              {moveTargets.map((zone) => (
                <option key={zone} value={zone}>
                  {DECK_ZONE_LABELS[zone]}
                </option>
              ))}
            </select>
          )}
        </span>
      )}
    </li>
  );
}
