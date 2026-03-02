import { Deck } from "../deck";
import { DeckSerializer } from "../serialiser";
import { Card, SimplifiedDeck } from "../types";
import { SimplifiedDeckProvider } from "../provider";

export class SimplifiedDeckProviderImpl implements SimplifiedDeckProvider {
  serialiser: DeckSerializer;
  cardLookupFn: (id: string) => Promise<Card>;

  constructor(serialiser: DeckSerializer, cardLookupFn: (id: string) => Promise<Card>) {
    this.serialiser = serialiser;
    this.cardLookupFn = cardLookupFn;
  }
  
  async addCards(cards: {id: string, quantity: number}[], deckShortForm?: string): Promise<{ deck: SimplifiedDeck; shortForm: string; }> {
    let deck: Deck;

    if( deckShortForm ) {
      const simplifiedDeck = this.serialiser.deserializeDeck(deckShortForm);
      deck = await Deck.fromSimplifiedDeck(simplifiedDeck, this.cardLookupFn);
    } else {
      deck = new Deck();
    }

    for (const { id, quantity } of cards) {
      deck.addCard(await this.cardLookupFn(id), quantity);
    }

    const simplifiedResult = await deck.toSimplifiedDeck();

    return {
      deck: simplifiedResult,
      shortForm: this.serialiser.serializeDeck(simplifiedResult)
    }
  }

  async removeCards(cards: {id: string, quantity: number}[], deckShortForm: string): Promise<{deck: SimplifiedDeck, shortForm: string}> {
    const simplifiedDeck = this.serialiser.deserializeDeck(deckShortForm);
    const deck = await Deck.fromSimplifiedDeck(simplifiedDeck, this.cardLookupFn);

    for (const { id, quantity } of cards) {
      deck.removeCard(id, quantity);
    }

    const simplifiedResult = deck.toSimplifiedDeck();

    return {
      deck: simplifiedResult,
      shortForm: this.serialiser.serializeDeck(simplifiedResult)
    }
  }

  async getDeckFromShortForm(deckShortForm: string): Promise<{deck: SimplifiedDeck, shortForm: string}> {
    const simplifiedDeck = this.serialiser.deserializeDeck(deckShortForm);
    return {
      deck: simplifiedDeck,
      shortForm: deckShortForm
    };
  }
}