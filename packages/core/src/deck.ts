import { Card } from "./types";

export class Deck {
    legend: Card | null;
    chosenChampion: Card | null;
    cards: { card: Card; quantity: number }[];
    sideboard: { card: Card; quantity: number }[];
    runes: { card: Card; quantity: number }[];
    battlegrounds: Card[];

    constructor() {
        this.legend = null;
        this.cards = [];
        this.sideboard = [];
        this.chosenChampion = null;
        this.runes = [];
        this.battlegrounds = [];
    }

    // Addition methods
    addLegend(card: Card) {
        if (card.classification?.supertype !== "Legend") {
            throw new Error(`${card.name} is not a Legend and cannot be added as the legend.`);
        }
        if( this.legend ) {
            throw new Error(`A legend has already been chosen for this deck: ${this.legend.name}.`);
        }
        this.legend = card;
    }

    addMainCard(card: Card, quantity: number = 1, toSideboard: boolean = false) {
        const cardSupertype = card.classification?.supertype;
        if (cardSupertype === "Legend" || cardSupertype === "Battleground" || cardSupertype === "Rune") {
            throw new Error(`${card.name} can not be added into the main deck or sideboard.`);
        }

        const legendDomains = this.getLegendDomains()
        if (!legendDomains) {
            throw new Error("Cannot add cards before a legend is chosen.");
        }

        const cardDomains = card.classification?.domains || [];
        if( cardDomains.some(domain => !legendDomains.includes(domain)) ) {
            throw new Error(`${card.name} does not match all domains of the legend. Legend domains: ${legendDomains.join(", ")}. Card domains: ${cardDomains.join(", ")}`);
        }

        const currentCount = this.getCountOfMainCard(card);
        if (currentCount + quantity > 3) {
            throw new Error(`Cannot have more than 3 copies of ${card.name} in the deck.`);
        }

        // TODO: check compatibility with legend
        if( cardSupertype === "Champion" && this.chosenChampion === null) {
            this.chosenChampion = card;
            return;
        }

        if( this.getTotalMainCardCount() + quantity > 40) {
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

    addBattleground(card: Card) {
        if (card.classification?.supertype !== "Battleground") {
            throw new Error(`${card.name} is not a Battleground and cannot be added as a battleground.`);
        }
        if( this.battlegrounds.length == 3) {
            throw new Error("Cannot have more than 3 battlegrounds in a deck.");
        }
        const existingBattleground = this.battlegrounds.find(c => c.id === card.id);
        if (existingBattleground) {
            throw new Error(`${card.name} is already in the deck.`);
        }
        this.battlegrounds.push(card);
    }

    addRune(card: Card, quantity: number = 1) {
        if (card.classification?.supertype !== "Rune") {
            throw new Error(`${card.name} is not a Rune and cannot be added as a rune.`);
        }

        const cardDomains = card.classification?.domains || [];
        if( cardDomains.some(domain => !this.getLegendDomains()?.includes(domain)) ) {
            throw new Error(`${card.name} does not match all domains of the legend. Legend domains: ${this.getLegendDomains()?.join(", ")}. Card domains: ${cardDomains.join(", ")}`);
        }

        const currentRuneCount = this.runes.reduce((count, c) => count + (c.card.id === card.id ? c.quantity : 0), 0);
        if( currentRuneCount == 12) {
            throw new Error("Cannot have more than 12 runes in a deck.");
        }
        const existingEntry = this.runes.find(c => c.card.id === card.id);
        if (existingEntry) {
            existingEntry.quantity += quantity;
        } else {
            this.runes.push({ card, quantity });
        }
    }

    // Removal methods
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

    removeMainCard(cardId: string, quantity: number = 1) {
        // first check main, then remove if any left from sideboard, then if it's the chosen champion
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

    removeBattleground(cardId: string) {
        const oldSize = this.battlegrounds.length;
        this.battlegrounds = this.battlegrounds.filter(c => c.id !== cardId);
        if (this.battlegrounds.length === oldSize) {
            throw new Error(`Battleground with id ${cardId} not found.`);
        }
    }

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

    getIssues(): string[] {
        const issues: string[] = [];
        if (!this.legend) {
            issues.push("No legend chosen.");
        } else {
            if( !this.chosenChampion) {
                issues.push("No champion chosen.");
            }
            if( this.getTotalMainCardCount() < 40) {
                issues.push("Deck has less than 40 main cards.");
            }
            if( this.battlegrounds.length < 3) {
                issues.push("Deck has less than 3 battlegrounds.");
            }
            if( this.runes.reduce((count, c) => count + c.quantity, 0) < 12) {
                issues.push("Deck has less than 12 runes.");
            }
        }

        return issues;
    }

    // Private utility methods
    private getCountOfMainCard(card: Card): number {
        const chosenChampCount = (this.chosenChampion && this.chosenChampion.id === card.id) ? 1 : 0;
        const mainCount = this.cards.find(c => c.card.id === card.id)?.quantity || 0;
        const sideboardCount = this.sideboard.find(c => c.card.id === card.id)?.quantity || 0;
        return chosenChampCount + mainCount + sideboardCount;
    }

    private getTotalMainCardCount(): number {
        return this.cards.reduce((sum, c) => sum + c.quantity, 0) + (this.chosenChampion ? 1 : 0);
    }

    private getLegendDomains(): string[] | null {
        if (!this.legend) return null;
        return this.legend.classification?.domains || null;
    }
    
}