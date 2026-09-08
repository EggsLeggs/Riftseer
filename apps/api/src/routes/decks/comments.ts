import { t, Elysia } from "elysia";
import { canRead } from "../../authz/deck-access";
import { ErrorSchema } from "../../schemas";
import { DeckCommentSchema } from "./schemas";
import {
  COMMENT_BODY_MAX,
  COMMENT_DEPTH_MAX,
  COMMENT_LIST_LIMIT,
  unavailable,
  type DeckRouteContext,
} from "./shared";

// ─── Deck comments ────────────────────────────────────────────────────────────

/** The thread is readable by whoever can read the deck. */
export function commentReads(ctx: DeckRouteContext) {
  const { repository, load, commentView } = ctx;
  return (
    new Elysia()
      .use(ctx.optionalAuthPlugin)

      // ── GET /decks/:id/comments ───────────────────────────────────────
      .get(
        "/decks/:id/comments",
        async ({ params, user, set }) => {
          if (!repository) return unavailable(set);
          const loaded = await load(params.id, user?.id);
          if ("status" in loaded) {
            set.status = loaded.status;
            return loaded.body;
          }
          if (!canRead(loaded.deck, loaded.role)) {
            set.status = 404;
            return { error: "Deck not found", code: "NOT_FOUND" };
          }
          const rows = await repository.listComments(loaded.deck.id, COMMENT_LIST_LIMIT);
          const authorIds = [
            ...new Set(
              rows.map((row) => row.author_id).filter((id): id is string => typeof id === "string"),
            ),
          ];
          const commentIds = rows.map((row) => row.id);
          const profiles = await repository.getProfiles(authorIds);
          // Likes are decorative. A missing table or a likes read
          // failing must not take the thread down with it.
          let likeCounts = new Map<string, number>();
          let liked: Set<string> | null = null;
          try {
            [likeCounts, liked] = await Promise.all([
              repository.getCommentLikeCounts(commentIds),
              user?.id ? repository.getCommentLikesFor(user.id, commentIds) : Promise.resolve(null),
            ]);
          } catch {
            likeCounts = new Map();
            liked = null;
          }
          const authors = new Map(profiles.map((profile) => [profile.id, profile]));
          const isDeckOwner = loaded.role === "owner";
          return {
            items: rows.map((row) =>
              commentView(row, authors, user?.id, isDeckOwner, {
                count: likeCounts.get(row.id) ?? 0,
                liked: liked?.has(row.id),
              }),
            ),
            total: rows.length,
          };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({ items: t.Array(DeckCommentSchema), total: t.Number() }),
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "List comments",
            description: "One flat list, newest first; the client builds the tree from parent_id.",
          },
        },
      )
  );
}

/** Posting, deleting and liking need a signed-in user. */
export function commentWrites(ctx: DeckRouteContext) {
  const { repository, load, commentView } = ctx;
  return (
    new Elysia()
      .use(ctx.authPlugin)

      // ── POST /decks/:id/comments ──────────────────────────────────────
      .post(
        "/decks/:id/comments",
        async ({ params, body, user, set }) => {
          if (!repository) return unavailable(set);
          const loaded = await load(params.id, user.id);
          if ("status" in loaded) {
            set.status = loaded.status;
            return loaded.body;
          }
          // Any signed-in reader may comment; writing the deck is not
          // required. Unreadable is 404, as everywhere.
          if (!canRead(loaded.deck, loaded.role)) {
            set.status = 404;
            return { error: "Deck not found", code: "NOT_FOUND" };
          }
          const text = body.body.trim();
          if (!text) {
            set.status = 400;
            return { error: "A comment needs some text.", code: "EMPTY_COMMENT" };
          }

          let depth = 0;
          let parentId: string | null = null;
          if (body.parent_id) {
            const parent = await repository.getComment(body.parent_id);
            if (!parent || parent.deck_id !== loaded.deck.id) {
              set.status = 400;
              return { error: "No such comment to reply to.", code: "NO_SUCH_PARENT" };
            }
            // The cap flattens rather than refuses: reply eight becomes a
            // sibling of reply seven, which is what the collapsed UI shows
            // anyway. Reuse the grandparent so client-side nesting cannot
            // exceed the capped level via parent_id.
            if (parent.depth >= COMMENT_DEPTH_MAX) {
              parentId = parent.parent_id;
              depth = COMMENT_DEPTH_MAX;
            } else {
              parentId = parent.id;
              depth = parent.depth + 1;
            }
          }

          const row = await repository.insertComment({
            deck_id: loaded.deck.id,
            author_id: user.id,
            parent_id: parentId,
            depth,
            body: text,
          });
          const profiles = await repository.getProfiles([user.id]);
          const authors = new Map(profiles.map((profile) => [profile.id, profile]));
          set.status = 201;
          return commentView(row, authors, user.id, loaded.role === "owner");
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({
            body: t.String({ maxLength: COMMENT_BODY_MAX }),
            parent_id: t.Optional(t.String()),
          }),
          response: {
            201: DeckCommentSchema,
            400: ErrorSchema,
            401: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Comment on a deck",
            description:
              "Any signed-in reader of the deck. Pass `parent_id` to reply; depth is " +
              "capped at 7 and deeper replies flatten to that level.",
          },
        },
      )

      // ── DELETE /decks/:id/comments/:commentId ─────────────────────────
      .delete(
        "/decks/:id/comments/:commentId",
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
          const comment = await repository.getComment(params.commentId);
          if (!comment || comment.deck_id !== loaded.deck.id) {
            set.status = 404;
            return { error: "Comment not found", code: "NOT_FOUND" };
          }
          // The author moderates themselves; the deck's owner moderates
          // their page. Nobody else.
          const mayDelete = loaded.role === "owner" || comment.author_id === user.id;
          if (!mayDelete) {
            set.status = 403;
            return { error: "You cannot delete this comment.", code: "FORBIDDEN" };
          }
          await repository.softDeleteComment(comment.id);
          return { message: "Comment deleted" };
        },
        {
          params: t.Object({ id: t.String(), commentId: t.String() }),
          response: {
            200: t.Object({ message: t.String() }),
            401: ErrorSchema,
            403: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Delete a comment",
            description: "Author or deck owner. Always a tombstone, so replies keep their place.",
          },
        },
      )

      // ── POST /decks/:id/comments/:commentId/like ──────────────────────
      .post(
        "/decks/:id/comments/:commentId/like",
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
          const comment = await repository.getComment(params.commentId);
          if (!comment || comment.deck_id !== loaded.deck.id) {
            set.status = 404;
            return { error: "Comment not found", code: "NOT_FOUND" };
          }
          await repository.addCommentLike(comment.id, user.id);
          const counts = await repository.getCommentLikeCounts([comment.id]);
          return { liked: true, like_count: counts.get(comment.id) ?? 0 };
        },
        {
          params: t.Object({ id: t.String(), commentId: t.String() }),
          response: {
            200: t.Object({ liked: t.Boolean(), like_count: t.Number() }),
            401: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Like a comment",
            description: "Idempotent. Any signed-in reader of the deck.",
          },
        },
      )

      // ── DELETE /decks/:id/comments/:commentId/like ────────────────────
      .delete(
        "/decks/:id/comments/:commentId/like",
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
          const comment = await repository.getComment(params.commentId);
          if (!comment || comment.deck_id !== loaded.deck.id) {
            set.status = 404;
            return { error: "Comment not found", code: "NOT_FOUND" };
          }
          await repository.removeCommentLike(comment.id, user.id);
          const counts = await repository.getCommentLikeCounts([comment.id]);
          return { liked: false, like_count: counts.get(comment.id) ?? 0 };
        },
        {
          params: t.Object({ id: t.String(), commentId: t.String() }),
          response: {
            200: t.Object({ liked: t.Boolean(), like_count: t.Number() }),
            401: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Unlike a comment",
            description: "Idempotent.",
          },
        },
      )
  );
}
