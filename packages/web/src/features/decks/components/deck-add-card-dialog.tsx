"use client";

import * as React from "react";
import { toast } from "sonner";

import { CardSearchDialog } from "@/features/cards/card-search-dialog";
import type { CardResult } from "@/features/cards/api";
import { DECK_ZONE_LABELS } from "@riftseer/types/deck";
import { resolveAddZone, type AddableCard } from "../deck-add";
import type { DeckZone } from "../types";

/**
 * A search hit as an addable card.
 *
 * The rules fields are what the signed-in path needs; the display fields ride
 * along for the guest builder, whose inserted row is never replaced by a server
 * answer. Exported because the guest save path builds the same shape.
 */
export function addableFromResult(result: CardResult): AddableCard {
  const { oracle, printing } = result;
  return {
    oracle_id: oracle.id,
    printing_id: printing.id,
    card_type: oracle.card_type ?? null,
    supertype: oracle.supertype ?? null,
    is_token: oracle.is_token,
    name: oracle.name,
    domains: oracle.domains ?? [],
    energy: oracle.energy ?? null,
    might: oracle.might ?? null,
    power: oracle.power ?? null,
    set_code: printing.set?.set_code ?? null,
    collector_number: printing.collector_number ?? null,
    rarity: printing.rarity ?? null,
    public_slug: printing.public_slug ?? null,
  };
}

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
    (result: CardResult) => {
      const card = addableFromResult(result);
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
