import { Deck } from "../deck";
import { DeckSerializer } from "../serialiser";
import { Card, SimplifiedDeck } from "../types";
import { SimplifiedDeckProvider } from "../provider";

export class SimplifiedDeckProviderImpl implements SimplifiedDeckProvider {
  serialiser: DeckSerializer;
  cardLookupFn: (id: string) => Card;

  constructor(serialiser: DeckSerializer, cardLookupFn: (id: string) => Card) {
    this.serialiser = serialiser;
    this.cardLookupFn = cardLookupFn;
  }
  
  addCards(cards: {id: string, quantity: number}[], deckShortForm?: string): {deck: SimplifiedDeck, shortForm: string} {
    let deck;

    if( deckShortForm ) {
      const simplifiedDeck = this.serialiser.deserializeDeck(deckShortForm);
      deck = Deck.fromSimplifiedDeck(simplifiedDeck, this.cardLookupFn);
    } else {
      deck = new Deck();
    }

    for (const { id, quantity } of cards) {
      deck.addCard(this.cardLookupFn(id), quantity);
    }

    const simplifiedResult = deck.toSimplifiedDeck();

    return {
      deck: simplifiedResult,
      shortForm: this.serialiser.serializeDeck(simplifiedResult)
    }
  }

  removeCards(cards: {id: string, quantity: number}[], deckShortForm: string): {deck: SimplifiedDeck, shortForm: string} {
    const simplifiedDeck = this.serialiser.deserializeDeck(deckShortForm);
    const deck = Deck.fromSimplifiedDeck(simplifiedDeck, this.cardLookupFn);

    for (const { id, quantity } of cards) {
      deck.removeCard(id, quantity);
    }

    const simplifiedResult = deck.toSimplifiedDeck();

    return {
      deck: simplifiedResult,
      shortForm: this.serialiser.serializeDeck(simplifiedResult)
    }
  }

  getDeckFromShortForm(deckShortForm: string): {deck: SimplifiedDeck, shortForm: string} {
    const simplifiedDeck = this.serialiser.deserializeDeck(deckShortForm);
    return {
      deck: simplifiedDeck,
      shortForm: deckShortForm
    };
  }
}