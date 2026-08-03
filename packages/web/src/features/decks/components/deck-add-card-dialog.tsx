"use client";

import * as React from "react";
import { toast } from "sonner";

import { CardSearchDialog } from "@/features/cards/card-search-dialog";
import { DECK_ZONE_LABELS } from "@riftseer/types/deck";
import { resolveAddZone, type AddableCard } from "../deck-add";
import type { DeckZone } from "../types";

/**
 * The card picker, wired to a zone.
 *
 * It reuses the global palette rather than growing a second search: the palette
 * already takes an `onSelect`, so the builder supplies an adder instead of a
 * navigation. Which zone the card actually lands in is `resolveAddZone` — a
 * legend picked while the main deck was focused is still a legend.
 */
export function DeckAddCardDialog({
  open,
  onOpenChange,
  zone,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the user asked to add, or null to let the card decide. */
  zone: DeckZone | null;
  onAdd: (card: AddableCard, zone: DeckZone) => void;
}) {
  const handleSelect = React.useCallback(
    (result: { oracle: { id: string; card_type?: string; supertype?: string | null; is_token: boolean }; printing: { id: string } }) => {
      const card: AddableCard = {
        oracle_id: result.oracle.id,
        printing_id: result.printing.id,
        card_type: result.oracle.card_type ?? null,
        supertype: result.oracle.supertype ?? null,
        is_token: result.oracle.is_token,
      };
      const target = resolveAddZone(card, zone);
      onAdd(card, target);
      toast.success(`Added to ${DECK_ZONE_LABELS[target]}`);
    },
    [onAdd, zone],
  );

  return (
    <CardSearchDialog
      open={open}
      onOpenChange={onOpenChange}
      onSelect={handleSelect}
      showViewAll={false}
      placeholder={
        zone ? `Add a card to ${DECK_ZONE_LABELS[zone]}…` : "Add a card to the deck…"
      }
    />
  );
}
