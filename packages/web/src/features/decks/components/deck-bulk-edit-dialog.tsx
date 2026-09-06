"use client";

import * as React from "react";
import { ListChecksIcon } from "lucide-react";

import {
  AppDialogContent,
  AppSelectContent,
} from "@/components/layout/clear-body-pointer-events";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DECK_ZONE_LABELS, DECK_ZONES } from "@riftseer/types/deck";
import { deckZoneSections } from "../grouping";
import type { DeckCard, DeckZone } from "../types";

function cardKey(card: Pick<DeckCard, "zone" | "printing_id" | "oracle_id">) {
  return `${card.zone}:${card.printing_id}:${card.oracle_id}`;
}

/**
 * One place to change several rows: pick cards, then move them, set a count,
 * or remove them. Each action goes through the same editor methods a single
 * row uses — this dialog adds no second write path.
 */
export function DeckBulkEditDialog({
  editor,
  open,
  onOpenChange,
}: {
  editor: {
    cards: readonly DeckCard[];
    setQuantity: (
      card: Pick<DeckCard, "zone" | "printing_id" | "oracle_id" | "is_champion">,
      quantity: number,
    ) => void;
    moveZone: (
      card: Pick<DeckCard, "zone" | "printing_id" | "oracle_id" | "quantity" | "is_champion">,
      zone: DeckZone,
    ) => void;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [zone, setZone] = React.useState<DeckZone | "">("");
  const [quantity, setQuantity] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setSelected(new Set());
      setZone("");
      setQuantity("");
    }
  }, [open]);

  const sections = React.useMemo(() => deckZoneSections(editor.cards), [editor.cards]);
  const picked = editor.cards.filter((card) => selected.has(cardKey(card)));

  const toggle = (card: DeckCard, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      const key = cardKey(card);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleSection = (cards: readonly DeckCard[], on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const card of cards) {
        if (on) next.add(cardKey(card));
        else next.delete(cardKey(card));
      }
      return next;
    });
  };

  const applyMove = () => {
    if (!zone) return;
    for (const card of picked) {
      if (card.zone !== zone) editor.moveZone(card, zone);
    }
    onOpenChange(false);
  };

  const applyQuantity = () => {
    const next = Number.parseInt(quantity, 10);
    if (Number.isNaN(next)) return;
    const clamped = Math.min(Math.max(Math.round(next), 0), 99);
    for (const card of picked) editor.setQuantity(card, clamped);
    onOpenChange(false);
  };

  const applyRemove = () => {
    for (const card of picked) editor.setQuantity(card, 0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk edit</DialogTitle>
          <DialogDescription>
            Select cards, then move them, set a count, or remove them.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {sections.every((section) => section.cards.length === 0) ? (
            <p className="text-muted-foreground text-sm">This deck has no cards yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {sections.map((section) =>
                section.cards.length === 0 ? null : (
                  <section key={section.zone}>
                    <div className="mb-1.5 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={section.cards.every((card) => selected.has(cardKey(card)))}
                        onChange={(event) => toggleSection(section.cards, event.target.checked)}
                        aria-label={`Select ${section.label}`}
                      />
                      <h3 className="text-sm font-medium">{section.label}</h3>
                    </div>
                    <ul className="flex flex-col gap-1">
                      {section.cards.map((card) => (
                        <li key={cardKey(card)} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selected.has(cardKey(card))}
                            onChange={(event) => toggle(card, event.target.checked)}
                            aria-label={card.name}
                          />
                          <span className="text-muted-foreground w-6 text-right tabular-nums">
                            {card.quantity}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{card.name}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ),
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="text-muted-foreground text-xs tabular-nums">
            {picked.length} selected
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-36 flex-col gap-1">
              <span className="text-muted-foreground text-xs">Move to</span>
              <Select
                value={zone || undefined}
                onValueChange={(value) => setZone(value as DeckZone)}
                disabled={picked.length === 0}
              >
                <SelectTrigger className="h-8" aria-label="Move to zone">
                  <SelectValue placeholder="Zone" />
                </SelectTrigger>
                <AppSelectContent>
                  {DECK_ZONES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {DECK_ZONE_LABELS[option]}
                    </SelectItem>
                  ))}
                </AppSelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={picked.length === 0 || !zone}
              onClick={applyMove}
            >
              Move
            </Button>
            <div className="flex w-20 flex-col gap-1">
              <span className="text-muted-foreground text-xs">Count</span>
              <Input
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                disabled={picked.length === 0}
                aria-label="New quantity"
                className="h-8"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={picked.length === 0 || quantity === ""}
              onClick={applyQuantity}
            >
              Set
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive"
              disabled={picked.length === 0}
              onClick={applyRemove}
            >
              Remove
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  );
}

export function DeckBulkEditButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 px-2.5 text-xs"
      onClick={onClick}
    >
      <ListChecksIcon className="size-3.5" aria-hidden="true" />
      Bulk edit
    </Button>
  );
}
