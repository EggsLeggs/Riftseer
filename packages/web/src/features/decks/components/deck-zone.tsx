"use client";

import * as React from "react";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { groupDeckCards, type DeckGroupMode } from "../grouping";
import { violationsForCard, type DeckViolationIndex } from "../deck-violations";
import type { DeckCard, DeckViolation, DeckZone as Zone } from "../types";
import { DeckCardRow } from "./deck-card-row";
import { DeckViolationList, DeckViolationMarker } from "./deck-violation-list";

/**
 * A deck zone, rendered as grouped columns.
 *
 * The **only** zone renderer. Grouping comes from `groupDeckCards(cards, mode)`
 * and nothing here hard-codes "by type", so adding a grouping is a change in
 * `grouping.ts` plus an option in the mode select — not a second layout.
 */

export interface DeckZoneProps {
  zone: Zone;
  label: string;
  cards: readonly DeckCard[];
  count: number;
  groupMode: DeckGroupMode;
  canEdit: boolean;
  violations: DeckViolationIndex;
  /** Rendered per row where the flag exists; omitted elsewhere. */
  championable?: boolean;
  onQuantityChange?: (card: DeckCard, quantity: number) => void;
  onMoveZone?: (card: DeckCard, zone: Zone) => void;
  onToggleChampion?: (card: DeckCard, isChampion: boolean) => void;
  onAdd?: (zone: Zone) => void;
  emptyHint?: string;
  className?: string;
}

export function DeckZoneSection({
  zone,
  label,
  cards,
  count,
  groupMode,
  canEdit,
  violations,
  championable,
  onQuantityChange,
  onMoveZone,
  onToggleChampion,
  onAdd,
  emptyHint,
  className,
}: DeckZoneProps) {
  const groups = React.useMemo(() => groupDeckCards(cards, groupMode), [cards, groupMode]);
  const zoneViolations: DeckViolation[] = violations.byZone.get(zone) ?? [];

  return (
    <section className={cn("min-w-0", className)} aria-labelledby={`deck-zone-${zone}`}>
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

      {zoneViolations.length > 0 && (
        <DeckViolationList violations={zoneViolations} className="mb-2" />
      )}

      {cards.length === 0 ? (
        <p className="text-muted-foreground py-2 text-xs">
          {emptyHint ?? "Nothing here yet."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <div key={group.key} className="min-w-0 break-inside-avoid">
              <h3 className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                {group.label}
                <span className="ml-1.5 tabular-nums">{group.count}</span>
              </h3>
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
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
