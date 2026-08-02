import type { Oracle, Printing } from "./types.ts";

/**
 * One entry in a deck.
 *
 * A deck list is a list of *physical cards*, so `id` is a printing id — that
 * is what short-form deck strings already in the wild encode. But every
 * construction rule (type, supertype, domain matching) reads *oracle* fields,
 * because they are properties of the card rather than the cardboard.
 *
 * Rather than thread both objects through the deck model, flatten the five
 * fields the rules actually need. Deck code then reads `card.card_type`
 * instead of optional-chaining into a JSONB blob that may or may not be there.
 */
export interface DeckCard {
  /** Printing id — the identity a deck list stores. */
  id: string;
  name: string;
  card_type?: string;
  supertype?: string | null;
  domains: string[];
}

/** Pair an oracle with one of its printings for deck construction. */
export function toDeckCard(oracle: Oracle, printing: Printing): DeckCard {
  return {
    id: printing.id,
    name: oracle.name,
    card_type: oracle.card_type,
    supertype: oracle.supertype,
    domains: oracle.domains,
  };
}
