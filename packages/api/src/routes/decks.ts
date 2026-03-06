import { Elysia, t } from "elysia";
import { logger, BadRequestError, type SimplifiedDeck, type SimplifiedDeckProvider } from "@riftseer/core";
import {
  ErrorSchema,
  SimplifiedDeckRequestSchema,
  SimplifiedDeckResponseSchema,
  SimplifiedDeckSchema,
} from "../schemas";

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Validate and parse an "id:qty" entry from the request body. */
export function parseCardEntry(entry: string): { id: string; quantity: number } {
  const colon = entry.lastIndexOf(":");
  if (colon <= 0) throw new BadRequestError(`Invalid entry format (expected "id:qty"): "${entry}"`);
  const id = entry.slice(0, colon);
  const qtyStr = entry.slice(colon + 1);
  if (!/^\d+$/.test(qtyStr)) throw new BadRequestError(`Invalid quantity in entry: "${entry}"`);
  const quantity = parseInt(qtyStr, 10);
  if (quantity < 1 || quantity > 255) throw new BadRequestError(`Quantity must be between 1 and 255 in entry: "${entry}"`);
  return { id, quantity };
}

/** Map an error to an HTTP status code. */
function classifyStatus(error: unknown): 400 | 404 | 500 {
  if (error instanceof BadRequestError) return 400;
  if (error instanceof NotFoundError) return 404;
  return 500;
}

/** Transformation from a SimplifiedDeck object to an object compliant with SimplifiedDeckSchema */
function simplifiedDeckToSchema(deck: SimplifiedDeck): any {
  return {
    legend: deck.legendId,
    mainDeck: deck.mainDeck,
    chosenChampionId: deck.chosenChampionId,
    sideboard: deck.sideboard,
    runes: deck.runes,
    battlegrounds: deck.battlegrounds,
  };
}

export function decksRoutes(deckProvider: SimplifiedDeckProvider) {
  return new Elysia()
    // ── GET /decks/u/:shortForm ───────────────────────────────────────────────
    .get(
      "/decks/u/:shortForm",
      async ({ params, set }) => {
        try {
          const { deck, shortForm } = await deckProvider.getDeckFromShortForm(params.shortForm);
          return { shortForm, deck: simplifiedDeckToSchema(deck) };
        } catch (error) {
          const status = classifyStatus(error);
          set.status = status;
          if (status === 500) {
            logger.error("Unexpected error in GET /decks/u/:shortForm", { error });
            return { error: "Internal server error", code: "INTERNAL_ERROR" };
          }
          return { error: "Invalid deck short form", code: "INVALID_SHORT_FORM" };
        }
      },
      {
        params: t.Object({ shortForm: t.String({ description: "Deck short form string" }) }),
        response: {
          200: SimplifiedDeckResponseSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
        detail: {
          tags: ["Decks"],
          summary: "Get deck from short form",
          description: "Decode a short form deck string back to full deck data.",
        },
      },
    )

    // ── POST /decks/u/:shortForm ──────────────────────────────────────────────
    .post(
      "/decks/u/:shortForm",
      async ({ body, params, set }) => {
        if (!body.cardsToAdd && !body.cardsToRemove) {
          set.status = 400;
          return { error: "No cards to add or remove specified", code: "MISSING_CARDS" };
        }
        try {
          let { deck, shortForm } = await deckProvider.getDeckFromShortForm(params.shortForm);
          if (body.cardsToAdd) {
            const toAdd = body.cardsToAdd.map(parseCardEntry);
            const { deck: updatedDeck, shortForm: updatedShortForm } = await deckProvider.addCards(toAdd, shortForm);
            deck = updatedDeck;
            shortForm = updatedShortForm;
          }
          if (body.cardsToRemove) {
            const toRemove = body.cardsToRemove.map(parseCardEntry);
            const { deck: updatedDeck, shortForm: updatedShortForm } = await deckProvider.removeCards(toRemove, shortForm);
            deck = updatedDeck;
            shortForm = updatedShortForm;
          }
          return { shortForm, deck: simplifiedDeckToSchema(deck) };
        } catch (error) {
          const status = classifyStatus(error);
          set.status = status;
          if (status === 500) {
            logger.error("Unexpected error in POST /decks/u/:shortForm", { error });
            return { error: "Internal server error", code: "INTERNAL_ERROR" };
          }
          if (status === 404) return { error: (error as Error).message, code: "NOT_FOUND" };
          return { error: (error as Error).message, code: "INVALID_INPUT" };
        }
      },
      {
        params: t.Object({ shortForm: t.String({ description: "Deck short form string" }) }),
        body: SimplifiedDeckRequestSchema,
        response: {
          200: SimplifiedDeckResponseSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
        detail: {
          tags: ["Decks"],
          summary: "Update deck cards in short form",
          description:
            "Decode a short form deck string, replace the main deck cards with the provided ones, and return the updated short form and full deck data. Used for sharing decks with custom card lists.",
        },
      },
    )

    // ── POST /decks/u ─────────────────────────────────────────────────────────
    .post(
      "/decks/u",
      async ({ body, set }) => {
        if (!body.cardsToAdd) {
          set.status = 400;
          return { error: "New deck request has missing card list.", code: "MISSING_CARDS" };
        }
        if (body.cardsToRemove) {
          set.status = 400;
          return { error: "New deck request cannot have cards to remove.", code: "INVALID_INPUT" };
        }
        try {
          const toAdd = body.cardsToAdd.map(parseCardEntry);
          const { deck, shortForm } = await deckProvider.addCards(toAdd, undefined);
          return { shortForm, deck: simplifiedDeckToSchema(deck) };
        } catch (error) {
          const status = classifyStatus(error);
          set.status = status;
          if (status === 500) {
            logger.error("Unexpected error in POST /decks/u", { error });
            return { error: "Internal server error", code: "INTERNAL_ERROR" };
          }
          if (status === 404) return { error: (error as Error).message, code: "NOT_FOUND" };
          return { error: (error as Error).message, code: "INVALID_INPUT" };
        }
      },
      {
        body: SimplifiedDeckRequestSchema,
        response: {
          200: SimplifiedDeckResponseSchema,
          400: ErrorSchema,
          404: ErrorSchema,
          500: ErrorSchema,
        },
        detail: {
          tags: ["Decks"],
          summary: "Create new shortform deck with specified cards",
          description:
            "Create a new short form deck string from a provided list of card IDs and quantities. Used for sharing decks with custom card lists without needing an initial short form.",
        },
      },
    );
}
