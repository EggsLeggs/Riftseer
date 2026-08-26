"use client";

import * as React from "react";
import { toast } from "sonner";
import { validateDeck } from "@riftseer/types/deck-validate";
import type { DeckZone as Zone } from "@riftseer/types/deck";

import { cardsApi } from "@/features/cards/api";
import { deckAddChange, type AddableCard } from "../deck-add";
import { deckMoveChanges } from "../deck-changes";
import { formatRulesFor, type DeckFormatOption } from "../formats";
import {
  applyGuestCardChanges,
  emptyGuestDeck,
  guestCardFields,
  guestDeckLegalities,
  guestDeckState,
  readGuestDeck,
  withGuestLegalities,
  writeGuestDeck,
  type GuestDeck,
  type GuestDeckCard,
} from "../guest-deck";
import type { DeckCard, DeckCardChange, DeckViolation } from "../types";

/**
 * The guest builder's state: localStorage in place of `PUT /decks/:id/cards`.
 *
 * Deliberately the same shape as `useDeckEditor` — `cards`, `violations`,
 * `setQuantity`, `addCard`, `moveZone`, `setChampion` — so every builder
 * component takes it unchanged. The two hooks differ in exactly the two ways
 * the feature is about: **where the state lives** (a JSON blob, not a row) and
 * **who validates** (`validateDeck` here, the API there). Everything between —
 * zone routing, the change vocabulary, the copy-folding on a second `+` — is
 * the shared pure code both call.
 *
 * There is no queue and no debounce because there is no request: a write is a
 * `setState` and a `setItem`, and the cost of coalescing them is worse than
 * paying for them.
 */

export interface GuestDeckEditor {
  /** `null` until the stored blob has been read, which is after hydration. */
  deck: GuestDeck | null;
  cards: GuestDeckCard[];
  violations: DeckViolation[];
  /** True once the stored blob has been read; the builder renders empty before. */
  ready: boolean;
  /** False when the browser refused to persist — quota, or storage denied. */
  persisted: boolean;
  setName: (name: string) => void;
  setFormat: (code: string) => void;
  setQuantity: (
    card: Pick<DeckCard, "zone" | "printing_id" | "oracle_id" | "is_champion">,
    quantity: number,
  ) => void;
  addCard: (card: AddableCard, options?: { zone?: Zone | null; copies?: number }) => void;
  moveZone: (
    card: Pick<DeckCard, "zone" | "printing_id" | "oracle_id" | "quantity" | "is_champion">,
    zone: Zone,
  ) => void;
  setChampion: (
    card: Pick<DeckCard, "zone" | "printing_id" | "oracle_id" | "quantity">,
    isChampion: boolean,
  ) => void;
  /** Throw the local deck away and start again. */
  reset: () => void;
}

const NO_CARDS: GuestDeckCard[] = [];
const NO_VIOLATIONS: DeckViolation[] = [];

export function useGuestDeck(formats: readonly DeckFormatOption[]): GuestDeckEditor {
  const [deck, setDeck] = React.useState<GuestDeck | null>(null);
  const [ready, setReady] = React.useState(false);
  const [persisted, setPersisted] = React.useState(true);

  // localStorage is read in an effect rather than in render: the server has no
  // such storage, so reading it during render would produce markup that does
  // not match what hydration then draws.
  React.useEffect(() => {
    setDeck(readGuestDeck() ?? emptyGuestDeck());
    setReady(true);
  }, []);

  const update = React.useCallback(
    (change: (current: GuestDeck) => GuestDeck) => {
      setDeck((current) => {
        if (!current) return current;
        const next = { ...change(current), updated_at: new Date().toISOString() };
        setPersisted(writeGuestDeck(next));
        return next;
      });
    },
    [],
  );

  const applyChanges = React.useCallback(
    (changes: DeckCardChange[], template?: AddableCard) => {
      update((current) => ({
        ...current,
        cards: applyGuestCardChanges(
          current.cards,
          changes,
          template ? [guestCardFields(template)] : [],
        ),
      }));
    },
    [update],
  );

  const cards = deck?.cards ?? NO_CARDS;

  const addCard = React.useCallback<GuestDeckEditor["addCard"]>(
    (card, options) => {
      applyChanges([deckAddChange(cards, card, options)], card);

      // Legalities are a property of the card, not of the deck, so they are
      // fetched once per card and cached in the blob — the same entries a
      // signed-in builder gets from the server, so both see the same warnings.
      // A failed lookup costs the warning, never the card: the row is already in.
      void cardsApi
        .getDetail({ printing: card.printing_id })
        .then((detail) => {
          if (!detail?.legalities?.length) return;
          update((current) =>
            withGuestLegalities(
              current,
              { oracle_id: card.oracle_id, printing_id: card.printing_id },
              detail.legalities,
            ),
          );
        })
        .catch(() => {
          /* The card is in the deck; its legality table is not load-bearing. */
        });
    },
    [applyChanges, cards, update],
  );

  const setQuantity = React.useCallback<GuestDeckEditor["setQuantity"]>(
    (card, quantity) => {
      applyChanges([
        {
          zone: card.zone as Zone,
          printing_id: card.printing_id,
          oracle_id: card.oracle_id,
          quantity,
          is_champion: card.is_champion,
        },
      ]);
    },
    [applyChanges],
  );

  const moveZone = React.useCallback<GuestDeckEditor["moveZone"]>(
    (card, zone) => {
      if (card.zone === zone) return;
      applyChanges(deckMoveChanges(cards, card, zone));
    },
    [applyChanges, cards],
  );

  const setChampion = React.useCallback<GuestDeckEditor["setChampion"]>(
    (card, isChampion) => {
      applyChanges([
        {
          zone: card.zone as Zone,
          printing_id: card.printing_id,
          oracle_id: card.oracle_id,
          quantity: card.quantity,
          is_champion: isChampion,
        },
      ]);
    },
    [applyChanges],
  );

  const setName = React.useCallback(
    (name: string) => update((current) => ({ ...current, name })),
    [update],
  );

  const setFormat = React.useCallback(
    (code: string) => update((current) => ({ ...current, format: code })),
    [update],
  );

  const reset = React.useCallback(() => {
    const fresh = emptyGuestDeck({ format: deck?.format });
    setPersisted(writeGuestDeck(fresh));
    setDeck(fresh);
  }, [deck?.format]);

  const format = formats.find((option) => option.code === deck?.format);

  const violations = React.useMemo<DeckViolation[]>(() => {
    if (!deck) return NO_VIOLATIONS;
    return validateDeck(
      guestDeckState(deck),
      formatRulesFor(format),
      guestDeckLegalities(deck, deck.format),
    );
  }, [deck, format]);

  // Said once, not on every keystroke: a browser that refuses storage still
  // builds decks, it just forgets them, and the user should know before they
  // spend an hour on one.
  const warned = React.useRef(false);
  React.useEffect(() => {
    if (persisted || warned.current) return;
    warned.current = true;
    toast.warning("This browser won't let Riftseer save your deck locally.", {
      description: "Export the list before you leave the page.",
    });
  }, [persisted]);

  return {
    deck,
    cards,
    violations,
    ready,
    persisted,
    setName,
    setFormat,
    setQuantity,
    addCard,
    moveZone,
    setChampion,
    reset,
  };
}
