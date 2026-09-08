import { t, Elysia } from "elysia";
import { canRead } from "../../authz/deck-access";
import { ErrorSchema } from "../../schemas";
import { unavailable, type DeckRouteContext } from "./shared";

// ─── Deck favorites ───────────────────────────────────────────────────────────

/** Favoriting is per user, so both routes need one. */
export function favoriteWrites(ctx: DeckRouteContext) {
  const { repository, load } = ctx;
  return (
    new Elysia()
      .use(ctx.authPlugin)

      // ── POST /decks/:id/favorite ──────────────────────────────────────
      .post(
        "/decks/:id/favorite",
        async ({ params, user, set }) => {
          if (!repository) return unavailable(set);
          const loaded = await load(params.id, user.id);
          if ("status" in loaded) {
            set.status = loaded.status;
            return loaded.body;
          }
          // Reading is the only requirement — favoriting is a bookmark,
          // not an edit. An unreadable deck 404s like everywhere else.
          if (!canRead(loaded.deck, loaded.role)) {
            set.status = 404;
            return { error: "Deck not found", code: "NOT_FOUND" };
          }
          await repository.addFavorite(loaded.deck.id, user.id);
          const counts = await repository.getFavoriteCounts([loaded.deck.id]);
          return { favorited: true, favorite_count: counts.get(loaded.deck.id) ?? 0 };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({ favorited: t.Boolean(), favorite_count: t.Number() }),
            401: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: { tags: ["Decks"], summary: "Favorite a deck", description: "Idempotent." },
        },
      )

      // ── DELETE /decks/:id/favorite ────────────────────────────────────
      .delete(
        "/decks/:id/favorite",
        async ({ params, user, set }) => {
          if (!repository) return unavailable(set);
          const loaded = await load(params.id, user.id);
          if ("status" in loaded) {
            set.status = loaded.status;
            return loaded.body;
          }
          if (!canRead(loaded.deck, loaded.role)) {
            set.status = 404;
            return { error: "Deck not found", code: "NOT_FOUND" };
          }
          await repository.removeFavorite(loaded.deck.id, user.id);
          const counts = await repository.getFavoriteCounts([loaded.deck.id]);
          return { favorited: false, favorite_count: counts.get(loaded.deck.id) ?? 0 };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({ favorited: t.Boolean(), favorite_count: t.Number() }),
            401: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: { tags: ["Decks"], summary: "Unfavorite a deck", description: "Idempotent." },
        },
      )
  );
}
