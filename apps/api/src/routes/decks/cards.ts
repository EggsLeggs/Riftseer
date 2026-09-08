import { t, Elysia } from "elysia";
import { canRead, canWrite } from "../../authz/deck-access";
import { ErrorSchema } from "../../schemas";
import { CardsResponseSchema, CardChangeSchema } from "./schemas";
import {
  CARD_TAGS_MAX,
  CARD_TAG_LENGTH_MAX,
  CARD_BATCH_MAX,
  unavailable,
  rpcFailure,
  type DeckRouteContext,
} from "./shared";

// ─── Deck cards and card tags ─────────────────────────────────────────────────

/** The one card mutation, applied as a batch by `deck_apply_card_changes`. */
export function cardWrites(ctx: DeckRouteContext) {
  const { repository, load, cardsView } = ctx;
  return (
    new Elysia()
      .use(ctx.authPlugin)

      // ── PUT /decks/:id/cards ──────────────────────────────────────────
      .put(
        "/decks/:id/cards",
        async ({ params, body, user, set }) => {
          if (!repository) return unavailable(set);
          const loaded = await load(params.id, user.id);
          if ("status" in loaded) {
            set.status = loaded.status;
            return loaded.body;
          }
          if (!canWrite(loaded.role)) {
            set.status = canRead(loaded.deck, loaded.role) ? 403 : 404;
            return set.status === 403
              ? { error: "You cannot edit this deck.", code: "FORBIDDEN" }
              : { error: "Deck not found", code: "NOT_FOUND" };
          }

          // One call for the whole batch: the RPC owns revision coalescing
          // and the champion hand-off, and both need a single transaction.
          const result = await repository.callRpc("deck_apply_card_changes", {
            p_deck_id: loaded.deck.id,
            p_author: user.id,
            p_changes: body.changes,
          });
          if (!result.ok) {
            const failure = rpcFailure(result.reason);
            set.status = failure.status;
            return failure.body;
          }

          return await cardsView(
            loaded.deck,
            typeof result.revision_id === "string" ? result.revision_id : null,
          );
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({
            changes: t.Array(CardChangeSchema, { minItems: 1, maxItems: CARD_BATCH_MAX }),
          }),
          response: {
            200: CardsResponseSchema,
            400: ErrorSchema,
            401: ErrorSchema,
            403: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Apply card changes",
            description:
              "A whole batch of zone changes in one transaction. `quantity: 0` removes a card.",
          },
        },
      )
  );
}

/** Manual tags, oracle-keyed. */
export function cardTagWrites(ctx: DeckRouteContext) {
  const { repository, load } = ctx;
  return (
    new Elysia()
      .use(ctx.authPlugin)

      // ── PUT /decks/:id/card-tags ──────────────────────────────────────
      .put(
        "/decks/:id/card-tags",
        async ({ params, body, user, set }) => {
          if (!repository) return unavailable(set);
          const loaded = await load(params.id, user.id);
          if ("status" in loaded) {
            set.status = loaded.status;
            return loaded.body;
          }
          if (!canWrite(loaded.role)) {
            set.status = canRead(loaded.deck, loaded.role) ? 403 : 404;
            return set.status === 403
              ? { error: "You cannot edit this deck.", code: "FORBIDDEN" }
              : { error: "Deck not found", code: "NOT_FOUND" };
          }

          // Only cards actually in the deck can be tagged — tags are
          // annotation on the list, not a freestanding vocabulary, and the
          // check is what bounds a deck's tag rows.
          const cards = await repository.getDeckCards(loaded.deck.id);
          if (!cards.some((card) => card.oracle_id === body.oracle_id)) {
            set.status = 400;
            return { error: "That card is not in this deck.", code: "CARD_NOT_IN_DECK" };
          }

          // Trimmed and deduplicated here so two spellings of a whitespace
          // variant cannot occupy two PK slots.
          const tags = [...new Set(body.tags.map((tag) => tag.trim()).filter(Boolean))].slice(
            0,
            CARD_TAGS_MAX,
          );
          await repository.setDeckCardTags(loaded.deck.id, body.oracle_id, tags);
          return { oracle_id: body.oracle_id, tags };
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({
            oracle_id: t.String(),
            // Replace-wholesale: the request states the full list.
            tags: t.Array(t.String({ maxLength: CARD_TAG_LENGTH_MAX }), {
              maxItems: CARD_TAGS_MAX,
            }),
          }),
          response: {
            200: t.Object({ oracle_id: t.String(), tags: t.Array(t.String()) }),
            400: ErrorSchema,
            401: ErrorSchema,
            403: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Replace a card's tags",
            description:
              "Manual tags for one card in this deck, keyed by oracle. Not revisioned and absent from text export.",
          },
        },
      )
  );
}
