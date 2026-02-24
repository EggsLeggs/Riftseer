import { Card } from "./types";

export class Deck {
  id: string;
  legend: Card | null;
  chosenChampion: Card | null;
  cards: { card: Card; quantity: number }[];
  sideboard: { card: Card; quantity: number }[];
  runes: { card: Card; quantity: number }[];
  battlegrounds: Card[];

  constructor() {
    this.id = crypto.randomUUID();
    this.legend = null;
    this.cards = [];
    this.sideboard = [];
    this.chosenChampion = null;
    this.runes = [];
    this.battlegrounds = [];
  }

  /**
   * Set the legend for this deck.
   * Throws if the card is not a Legend or a legend is already chosen.
   */
  addLegend(card: Card) {
    if (card.classification?.supertype !== "Legend") {
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
    const cardSupertype = card.classification?.supertype;
    if (cardSupertype === "Legend" || cardSupertype === "Battleground" || cardSupertype === "Rune") {
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

    if (cardSupertype === "Champion" 
        && this.chosenChampion === null 
        && this.legend?.related_champions?.some(c => c.id === card.id)) {
      this.chosenChampion = card;
      quantity -= 1;
        if (quantity <= 0) {
            return;
        }
    }

    if (this.getTotalMainCardCount() + quantity > 40) {
      throw new Error("Cannot have more than 40 total cards in the main deck.");
    }

    const target = toSideboard ? this.sideboard : this.cards;
    const existingEntry = target.find(c => c.card.id === card.id);
    if (existingEntry) {
      existingEntry.quantity += quantity;
    } else {
      target.push({ card, quantity });
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
    if (card.classification?.supertype !== "Rune") {
      throw new Error(`${card.name} is not a Rune and cannot be added as a rune.`);
    }

    const cardDomains = card.classification?.domains || [];
    if (cardDomains.some(domain => !this.getLegendDomains()?.includes(domain))) {
      throw new Error(`${card.name} does not match all domains of the legend. Legend domains: ${this.getLegendDomains()?.join(", ")}. Card domains: ${cardDomains.join(", ")}`);
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
   * Remove the legend and reset all dependent state (cards, sideboard, runes, chosenChampion).
   */
  removeLegend() {
    if (!this.legend) {
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
}

export enum DeckIssue {
  NoLegend = "NO_LEGEND",
  NoChosenChampion = "NO_CHOSEN_CHAMPION",
  NotEnoughMainCards = "NOT_ENOUGH_MAIN_CARDS",
  NotEnoughBattlegrounds = "NOT_ENOUGH_BATTLEGROUNDS",
  NotEnoughRunes = "NOT_ENOUGH_RUNES",
}
