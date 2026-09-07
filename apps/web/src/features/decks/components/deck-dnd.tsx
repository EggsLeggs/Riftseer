"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import { cn } from "@/lib/utils";
import { eligibleZones } from "../deck-add";
import type { DeckCard, DeckZone } from "../types";

/**
 * Dragging a card to another zone, in every view.
 *
 * Rows and tiles are draggable; each zone section is a droppable, and so is
 * the collapsed Considering strip (a closed `<details>` hides its section, and
 * a hidden element has no geometry to drop on). Where a card may land comes
 * from `eligibleZones` — the same answer the menu's "Move to" gives; ineligible
 * zones never highlight and dropping on them does nothing. The drop itself is
 * `editor.moveZone`, so dragging adds no second write path.
 *
 * Deliberately no KeyboardSensor: it would fight the list's tab order, and the
 * card menu's "Move to" is the keyboard path. Dragging is convenience;
 * everything it does has a button.
 */

interface DeckDndState {
  active: DeckCard | null;
  eligible: ReadonlySet<DeckZone>;
}

const DeckDndStateContext = React.createContext<DeckDndState>({
  active: null,
  eligible: new Set(),
});

export function DeckDndContext({
  enabled,
  onMoveZone,
  children,
}: {
  /** Off for readers — the rows simply stop being draggable. */
  enabled: boolean;
  onMoveZone: (card: DeckCard, zone: DeckZone) => void;
  children: React.ReactNode;
}) {
  const [active, setActive] = React.useState<DeckCard | null>(null);
  const eligible = React.useMemo<ReadonlySet<DeckZone>>(
    () => (active ? new Set(eligibleZones(active)) : new Set()),
    [active],
  );

  const sensors = useSensors(
    // The 8px activation distance is what keeps every click working — the
    // stepper, the menu, the intercepted name link — since none of them moves
    // the pointer that far.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const onDragStart = React.useCallback((event: DragStartEvent) => {
    const card = event.active.data.current?.card as DeckCard | undefined;
    setActive(card ?? null);
  }, []);

  const onDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      setActive(null);
      const card = event.active.data.current?.card as DeckCard | undefined;
      // Droppable ids are not zone names (two droppables may serve one zone),
      // so the zone rides in the droppable's data.
      const zone = event.over?.data.current?.zone as DeckZone | undefined;
      if (!card || !zone || zone === card.zone) return;
      if (!eligibleZones(card).includes(zone)) return;
      onMoveZone(card, zone);
    },
    [onMoveZone],
  );

  if (!enabled) return <>{children}</>;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <DeckDndStateContext.Provider value={{ active, eligible }}>
        {children}
        <DragOverlay dropAnimation={null}>
          {active && (
            <div className="bg-popover text-popover-foreground pointer-events-none w-fit rounded-md px-2.5 py-1 text-sm shadow-md ring-1 ring-foreground/10">
              <span className="tabular-nums">{active.quantity}×</span> {active.name}
            </div>
          )}
        </DragOverlay>
      </DeckDndStateContext.Provider>
    </DndContext>
  );
}

/**
 * Drag wiring for one row or tile. Outside a `DndContext` — a reader's page —
 * dnd-kit's hooks are inert, so callers apply the result unconditionally.
 */
export function useDeckCardDraggable(card: DeckCard, disabled?: boolean) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${card.zone}:${card.printing_id}`,
    data: { card },
    disabled,
  });
  return {
    ref: setNodeRef,
    isDragging,
    // No tabIndex and no role: without a KeyboardSensor the handle must stay
    // invisible to the tab order and to screen readers' interaction model.
    handleProps: { ...listeners, ...attributes, tabIndex: undefined, role: undefined },
  };
}

/** Drop wiring for a zone target; `id` varies when one zone has two targets. */
export function useDeckZoneDroppable(zone: DeckZone, id: string = zone) {
  const { active, eligible } = React.useContext(DeckDndStateContext);
  const droppable = useDroppable({ id, data: { zone } });
  const canReceive = active != null && zone !== active.zone && eligible.has(zone);
  return {
    ref: droppable.setNodeRef,
    /** True while a drag is up and this zone could take the card. */
    canReceive,
    /** True while the pointer is over this target with an eligible card. */
    isOver: canReceive && droppable.isOver,
  };
}

/** A wrapper drop target — the collapsed Considering strip. */
export function DeckZoneDropArea({
  zone,
  id,
  className,
  children,
}: {
  zone: DeckZone;
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { ref, canReceive, isOver } = useDeckZoneDroppable(zone, id);
  return (
    <div
      ref={ref}
      className={cn(
        className,
        canReceive && "rounded-lg ring-1 ring-ring/40",
        isOver && "bg-accent/30 ring-2 ring-ring",
      )}
    >
      {children}
    </div>
  );
}
