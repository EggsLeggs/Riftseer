import { Card, SimplifiedDeck } from "./types";
import { BadRequestError } from "./errors";

export class Deck {
  id: string | null;
  legend: Card | null;
  chosenChampion: Card | null;
  cards: { card: Card; quantity: number }[];
  sideboard: { card: Card; quantity: number }[];
  runes: { card: Card; quantity: number }[];
  battlegrounds: Card[];

  constructor() {
    this.id = null;
    this.legend = null;
    this.cards = [];
    this.sideboard = [];
    this.chosenChampion = null;
    this.runes = [];
    this.battlegrounds = [];
  }

  /**
   * General card-adding method that differentiates based on supertype.
   */
  addCard(card: Card, quantity: number = 1) {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("quantity must be a positive integer");
    const supertype = card.classification?.supertype;
    if (card.classification?.type === "Legend") {
      if (quantity !== 1) throw new Error("Legend cards must be added with quantity 1");
      this.addLegend(card);
    } else if (supertype === "Battleground") {
      if (quantity !== 1) throw new Error("Battleground cards must be added with quantity 1");
      this.addBattleground(card);
    } else if (supertype === "Rune") {
      this.addRune(card, quantity);
    } else {
      const mainAddCount = Math.min(quantity, 40 - this.getTotalMainCardCount());
      if (mainAddCount > 0) {
        this.addMainCard(card, mainAddCount);
      }
      const sideAddCount = quantity - mainAddCount;
      if (sideAddCount > 0) {
          this.addMainCard(card, sideAddCount, true);
      }
    }
  }

  /**
   * Set the legend for this deck.
   * Throws if the card is not a Legend or a legend is already chosen.
   */
  addLegend(card: Card) {
    if (card.classification?.type !== "Legend") {
      throw new Error(`${card.name} is not a legend and cannot be added as the legend.`);
    }
    if (this.legend) {
      throw new Error(`A legend has already been chosen for this deck: ${this.legend.name}.`);
    }
    this.legend = card;
  }

  /**
   * Add a card to the main deck or sideboard.
   * - Requires a legend to already be set (domain validation depends on it).
   * - Legend, Battleground, and Rune supertypes are rejected.
   * - The first eligible Champion linked to the legend is stored as chosenChampion.
   * - Enforces a 3-copy limit per card and a 40-card main deck cap.
   */
  addMainCard(card: Card, quantity: number = 1, toSideboard: boolean = false) {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("quantity must be a positive integer");
    const cardType = card.classification?.type;
    const cardSupertype = card.classification?.supertype;
    if (cardType === "Legend" || cardSupertype === "Battleground" || cardSupertype === "Rune") {
      throw new Error(`${card.name} can not be added into the main deck or sideboard.`);
    }

    const legendDomains = this.getLegendDomains();
    if (!legendDomains) {
      throw new Error("Cannot add cards before a legend is chosen.");
    }

    const cardDomains = card.classification?.domains || [];
    if (cardDomains.some(domain => !legendDomains.includes(domain))) {
      throw new Error(`${card.name} does not match all domains of the legend. Legend domains: ${legendDomains.join(", ")}. Card domains: ${cardDomains.join(", ")}`);
    }

    const currentCount = this.getCountOfMainCard(card);
    if (currentCount + quantity > 3) {
      throw new Error(`Cannot have more than 3 copies of ${card.name} in the deck.`);
    }

    // Determine champion candidacy up front but defer state mutation until all checks pass.
    const isChampionCandidate = !toSideboard && cardSupertype === "Champion" && this.chosenChampion === null; // TODO: add legend-champion validation once data is sanitised
    const effectiveQuantity = isChampionCandidate ? quantity - 1 : quantity;

    if (toSideboard) {
      const totalSideboard = this.sideboard.reduce((sum, c) => sum + c.quantity, 0);
      if (totalSideboard + effectiveQuantity > 8) {
        throw new Error("Cannot have more than 8 total cards in the sideboard.");
      }
    } else {
      if (this.getTotalMainCardCount() + effectiveQuantity > 40) {
        throw new Error("Cannot have more than 40 total cards in the main deck.");
      }
    }

    // All validations passed — commit champion assignment
    if (isChampionCandidate) {
      this.chosenChampion = card;
    }
    if (effectiveQuantity <= 0) {
      return;
    }

    const target = toSideboard ? this.sideboard : this.cards;
    const existingEntry = target.find(c => c.card.id === card.id);
    if (existingEntry) {
      existingEntry.quantity += effectiveQuantity;
    } else {
      target.push({ card, quantity: effectiveQuantity });
    }
  }

  /**
   * Add a battleground to the deck.
   * Enforces a maximum of 3 unique battlegrounds and rejects duplicates.
   */
  addBattleground(card: Card) {
    if (card.classification?.supertype !== "Battleground") {
      throw new Error(`${card.name} is not a Battleground and cannot be added as a battleground.`);
    }
    if (this.battlegrounds.length === 3) {
      throw new Error("Cannot have more than 3 battlegrounds in a deck.");
    }
    const existingBattleground = this.battlegrounds.find(c => c.id === card.id);
    if (existingBattleground) {
      throw new Error(`${card.name} is already in the deck.`);
    }
    this.battlegrounds.push(card);
  }

  /**
   * Add rune(s) to the deck.
   * Enforces domain matching against the legend and a 12-rune total cap.
   */
  addRune(card: Card, quantity: number = 1) {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("quantity must be a positive integer");
    if (card.classification?.supertype !== "Rune") {
      throw new Error(`${card.name} is not a Rune and cannot be added as a rune.`);
    }

    const legendDomains = this.getLegendDomains();
    if (!legendDomains || legendDomains.length === 0) {
      throw new Error("Cannot add runes before a legend is chosen.");
    }
    const cardDomains = card.classification?.domains || [];
    if (cardDomains.some(domain => !legendDomains.includes(domain))) {
      throw new Error(`${card.name} does not match all domains of the legend. Legend domains: ${legendDomains.join(", ")}. Card domains: ${cardDomains.join(", ")}`);
    }

    const totalRunes = this.runes.reduce((count, c) => count + c.quantity, 0);
    if (totalRunes + quantity > 12) {
      throw new Error("Cannot have more than 12 runes in a deck.");
    }
    const existingEntry = this.runes.find(c => c.card.id === card.id);
    if (existingEntry) {
      existingEntry.quantity += quantity;
    } else {
      this.runes.push({ card, quantity });
    }
  }

  /**
   * General card-removal method that differentiates based on supertype and checks all relevant zones.
   */
  removeCard(cardId: string, quantity: number = 1) {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("quantity must be a positive integer");
    const allCards = [
      ...(this.legend ? [this.legend] : []),
      ...(this.chosenChampion ? [this.chosenChampion] : []),
      ...this.cards.map(c => c.card),
      ...this.sideboard.map(c => c.card),
      ...this.runes.map(c => c.card),
      ...this.battlegrounds,
    ];
    const card = allCards.find(c => c.id === cardId);
    if (!card) {
      throw new Error(`Card with id ${cardId} not found in the deck.`);
    }

    const type = card.classification?.type;
    const supertype = card.classification?.supertype;
    if (type === "Legend") {
      this.removeLegend(cardId);
    } else if (supertype === "Battleground") {
      this.removeBattleground(cardId);
    } else if (supertype === "Rune") {
      this.removeRune(cardId, quantity);
    } else {
      this.removeMainCard(cardId, quantity);
    }
  }

  /**
   * Remove the legend and reset all dependent state (cards, sideboard, runes, chosenChampion).
   */
  removeLegend(id: string) {
    if (!this.legend || this.legend.id !== id) {
      throw new Error("No legend to remove.");
    }
    this.legend = null;
    this.cards = [];
    this.sideboard = [];
    this.chosenChampion = null;
    this.runes = [];
  }

  /**
   * Remove copies of a card from the main deck, sideboard, or chosenChampion slot.
   * Checks main first, then sideboard, then the champion slot.
   */
  removeMainCard(cardId: string, quantity: number = 1) {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("quantity must be a positive integer");
    let removed = false;
    const mainEntry = this.cards.find(c => c.card.id === cardId);
    if (mainEntry) {
      if (mainEntry.quantity > quantity) {
        mainEntry.quantity -= quantity;
        return;
      } else {
        this.cards = this.cards.filter(c => c.card.id !== cardId);
        quantity -= mainEntry.quantity;
        removed = true;
      }
    }

    const sideboardEntry = this.sideboard.find(c => c.card.id === cardId);
    if (sideboardEntry) {
      if (sideboardEntry.quantity > quantity) {
        sideboardEntry.quantity -= quantity;
        return;
      } else {
        this.sideboard = this.sideboard.filter(c => c.card.id !== cardId);
        quantity -= sideboardEntry.quantity;
        removed = true;
      }
    }

    if (this.chosenChampion && this.chosenChampion.id === cardId) {
      if (quantity > 0) {
        this.chosenChampion = null;
        removed = true;
      }
    }

    if (!removed) {
      throw new Error(`Card with id ${cardId} not found.`);
    }
  }

  /**
   * Remove a battleground from the deck by card ID.
   * Throws if the battleground is not present.
   */
  removeBattleground(cardId: string) {
    const oldSize = this.battlegrounds.length;
    this.battlegrounds = this.battlegrounds.filter(c => c.id !== cardId);
    if (this.battlegrounds.length === oldSize) {
      throw new Error(`Battleground with id ${cardId} not found.`);
    }
  }

  /**
   * Remove copies of a rune from the deck by card ID.
   * Throws if the rune is not present.
   */
  removeRune(cardId: string, quantity: number = 1) {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("quantity must be a positive integer");
    const runeEntry = this.runes.find(c => c.card.id === cardId);
    if (!runeEntry) {
      throw new Error(`Rune with id ${cardId} not found.`);
    }

    if (runeEntry.quantity > quantity) {
      runeEntry.quantity -= quantity;
    } else {
      this.runes = this.runes.filter(c => c.card.id !== cardId);
    }
  }

  /**
   * Return a list of rule violations that would prevent the deck from being finalised.
   * An empty array means the deck is legal.
   */
  getFinalisationIssues(): DeckIssue[] {
    const issues: DeckIssue[] = [];
    if (!this.legend) {
      issues.push(DeckIssue.NoLegend);
    } else {
      if (!this.chosenChampion) {
        issues.push(DeckIssue.NoChosenChampion);
      }
      if (this.getTotalMainCardCount() < 40) {
        issues.push(DeckIssue.NotEnoughMainCards);
      }
      if (this.battlegrounds.length < 3) {
        issues.push(DeckIssue.NotEnoughBattlegrounds);
      }
      if (this.runes.reduce((count, c) => count + c.quantity, 0) < 12) {
        issues.push(DeckIssue.NotEnoughRunes);
      }
    }

    return issues;
  }

  /** Total copies of a card across main, sideboard, and the champion slot. */
  private getCountOfMainCard(card: Card): number {
    const chosenChampCount = (this.chosenChampion && this.chosenChampion.id === card.id) ? 1 : 0;
    const mainCount = this.cards.find(c => c.card.id === card.id)?.quantity || 0;
    const sideboardCount = this.sideboard.find(c => c.card.id === card.id)?.quantity || 0;
    return chosenChampCount + mainCount + sideboardCount;
  }

  /** Total card count in the main deck (excludes sideboard, includes chosenChampion). */
  private getTotalMainCardCount(): number {
    return this.cards.reduce((sum, c) => sum + c.quantity, 0) + (this.chosenChampion ? 1 : 0);
  }

  /** Returns the legend's domain list, or null if no legend is set. */
  private getLegendDomains(): string[] | null {
    if (!this.legend) return null;
    return this.legend.classification?.domains || null;
  }

  // Methods for serializing/deserializing the deck to/from the simplified format in types.ts
  toSimplifiedDeck(): SimplifiedDeck {
    return {
        id: this.id,
        legendId: this.legend?.id || null,
        chosenChampionId: this.chosenChampion?.id || null,
        mainDeck: this.cards.map(c => `${c.card.id}:${c.quantity}`),
        sideboard: this.sideboard.map(c => `${c.card.id}:${c.quantity}`),
        runes: this.runes.map(c => `${c.card.id}:${c.quantity}`),
        battlegrounds: this.battlegrounds.map(c => c.id),
    };
  }

  static async fromSimplifiedDeck(simplified: SimplifiedDeck, cardLookup: (id: string) => Promise<Card>): Promise<Deck> {
    const deck = new Deck();
    deck.id = simplified.id;

    const lookup = async (section: string, ref: string, id: string): Promise<Card> => {
      try {
        return await cardLookup(id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new BadRequestError(`Invalid deck: card lookup failed in ${section} (${ref}): ${msg}`);
      }
    };

    const parseEntry = (entry: string): { id: string; quantity: number } => {
      const colon = entry.lastIndexOf(":");
      if (colon <= 0) throw new BadRequestError(`Malformed deck entry (expected "id:qty"): "${entry}"`);
      const qtyStr = entry.slice(colon + 1);
      if (!/^\d+$/.test(qtyStr)) throw new BadRequestError(`Invalid quantity in deck entry: "${entry}"`);
      const quantity = Number(qtyStr);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 255) {
        throw new BadRequestError(`Quantity out of bounds in deck entry: "${entry}"`);
      }
      return { id: entry.slice(0, colon), quantity };
    };

    if (simplified.legendId) {
      deck.legend = await lookup("legend", `legendId "${simplified.legendId}"`, simplified.legendId);
    }
    if (simplified.chosenChampionId) {
      deck.chosenChampion = await lookup(
        "chosenChampion",
        `chosenChampionId "${simplified.chosenChampionId}"`,
        simplified.chosenChampionId,
      );
    }

    deck.cards = await Promise.all(
      simplified.mainDeck.map(async entry => {
        const { id, quantity } = parseEntry(entry);
        return { card: await lookup("mainDeck", `entry "${entry}"`, id), quantity };
      }),
    );
    deck.sideboard = await Promise.all(
      simplified.sideboard.map(async entry => {
        const { id, quantity } = parseEntry(entry);
        return { card: await lookup("sideboard", `entry "${entry}"`, id), quantity };
      }),
    );
    deck.runes = await Promise.all(
      simplified.runes.map(async entry => {
        const { id, quantity } = parseEntry(entry);
        return { card: await lookup("runes", `entry "${entry}"`, id), quantity };
      }),
    );
    deck.battlegrounds = await Promise.all(
      simplified.battlegrounds.map(id => lookup("battlegrounds", `battlegroundId "${id}"`, id)),
    );

    deck.validateFromSimplifiedConstraints();
    return deck;
  }

  /**
   * Enforces the same domain, copy, and zone-size rules as addLegend / addMainCard / addRune / addBattleground
   * after loading from {@link SimplifiedDeck} (direct field assignment bypasses those methods).
   */
  private validateFromSimplifiedConstraints(): void {
    if (this.legend && this.legend.classification?.type !== "Legend") {
      throw new BadRequestError(`${this.legend.name} is not a legend and cannot be added as the legend.`);
    }

    if (this.chosenChampion) {
      if (!this.legend) {
        throw new BadRequestError("Invalid deck: chosen champion requires a legend");
      }
      if (this.chosenChampion.classification?.supertype !== "Champion") {
        throw new BadRequestError(
          `${this.chosenChampion.name} cannot be the chosen champion (not a Champion).`,
        );
      }
    }

    const needsLegend = this.cards.length > 0 || this.sideboard.length > 0 || this.runes.length > 0;
    if (needsLegend && !this.legend) {
      throw new BadRequestError("Invalid deck: main deck, sideboard, or runes require a legend");
    }

    const assertMainOrSideCard = (card: Card) => {
      const cardType = card.classification?.type;
      const cardSupertype = card.classification?.supertype;
      if (cardType === "Legend" || cardSupertype === "Battleground" || cardSupertype === "Rune") {
        throw new BadRequestError(`${card.name} can not be added into the main deck or sideboard.`);
      }

      const legendDomains = this.getLegendDomains();
      if (!legendDomains) {
        throw new BadRequestError("Cannot add cards before a legend is chosen.");
      }
      const cardDomains = card.classification?.domains || [];
      if (cardDomains.some(domain => !legendDomains.includes(domain))) {
        throw new BadRequestError(
          `${card.name} does not match all domains of the legend. Legend domains: ${legendDomains.join(", ")}. Card domains: ${cardDomains.join(", ")}`,
        );
      }
    };

    for (const { card } of this.cards) assertMainOrSideCard(card);
    for (const { card } of this.sideboard) assertMainOrSideCard(card);

    const ids = new Set<string>();
    if (this.chosenChampion) ids.add(this.chosenChampion.id);
    for (const { card } of this.cards) ids.add(card.id);
    for (const { card } of this.sideboard) ids.add(card.id);

    for (const id of ids) {
      const card =
        this.chosenChampion?.id === id
          ? this.chosenChampion
          : this.cards.find(c => c.card.id === id)?.card ?? this.sideboard.find(c => c.card.id === id)?.card;
      if (!card) continue;
      const chosenPart = this.chosenChampion?.id === id ? 1 : 0;
      const mainPart = this.cards.filter(c => c.card.id === id).reduce((s, c) => s + c.quantity, 0);
      const sidePart = this.sideboard.filter(c => c.card.id === id).reduce((s, c) => s + c.quantity, 0);
      if (chosenPart + mainPart + sidePart > 3) {
        throw new BadRequestError(`Cannot have more than 3 copies of ${card.name} in the deck.`);
      }
    }

    const mainTotal =
      this.cards.reduce((sum, c) => sum + c.quantity, 0) + (this.chosenChampion ? 1 : 0);
    if (mainTotal > 40) {
      throw new BadRequestError("Cannot have more than 40 total cards in the main deck.");
    }

    const sideTotal = this.sideboard.reduce((sum, c) => sum + c.quantity, 0);
    if (sideTotal > 8) {
      throw new BadRequestError("Cannot have more than 8 total cards in the sideboard.");
    }

    if (this.runes.length > 0) {
      const legendDomainsForRunes = this.getLegendDomains();
      if (!legendDomainsForRunes || legendDomainsForRunes.length === 0) {
        throw new BadRequestError("Cannot add runes before a legend is chosen.");
      }
      for (const { card } of this.runes) {
        if (card.classification?.supertype !== "Rune") {
          throw new BadRequestError(`${card.name} is not a Rune and cannot be added as a rune.`);
        }
        const cardDomains = card.classification?.domains || [];
        if (cardDomains.some(domain => !legendDomainsForRunes.includes(domain))) {
          throw new BadRequestError(
            `${card.name} does not match all domains of the legend. Legend domains: ${legendDomainsForRunes.join(", ")}. Card domains: ${cardDomains.join(", ")}`,
          );
        }
      }
    }

    const runeTotal = this.runes.reduce((s, c) => s + c.quantity, 0);
    if (runeTotal > 12) {
      throw new BadRequestError("Cannot have more than 12 runes in a deck.");
    }

    const seenBg = new Set<string>();
    for (const card of this.battlegrounds) {
      if (card.classification?.supertype !== "Battleground") {
        throw new BadRequestError(`${card.name} is not a Battleground and cannot be added as a battleground.`);
      }
      if (seenBg.has(card.id)) {
        throw new BadRequestError(`${card.name} is already in the deck.`);
      }
      seenBg.add(card.id);
    }
    if (this.battlegrounds.length > 3) {
      throw new BadRequestError("Cannot have more than 3 battlegrounds in a deck.");
    }
  }
}

export enum DeckIssue {
  NoLegend = "NO_LEGEND",
  NoChosenChampion = "NO_CHOSEN_CHAMPION",
  NotEnoughMainCards = "NOT_ENOUGH_MAIN_CARDS",
  NotEnoughBattlegrounds = "NOT_ENOUGH_BATTLEGROUNDS",
  NotEnoughRunes = "NOT_ENOUGH_RUNES",
}
