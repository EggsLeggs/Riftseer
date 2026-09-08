import { t, Elysia } from "elysia";
import { canRead } from "../../authz/deck-access";
import { ErrorSchema } from "../../schemas";
import { RevisionSchema } from "./schemas";
import { REVISION_LIMIT, unavailable, type DeckRouteContext } from "./shared";

// ─── Deck revision history ────────────────────────────────────────────────────

/** History follows deck read access. */
export function revisionReads(ctx: DeckRouteContext) {
  const { repository, load } = ctx;
  return (
    new Elysia()
      .use(ctx.optionalAuthPlugin)

      // ── GET /decks/:id/revisions ──────────────────────────────────────
      .get(
        "/decks/:id/revisions",
        async ({ params, query, user, set }) => {
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
          // Clamped rather than rejected: the param exists so the deck
          // page's "Recent history" strip can ask for a handful.
          const limit = Math.min(
            Math.max(Math.trunc(query.limit ?? REVISION_LIMIT), 1),
            REVISION_LIMIT,
          );
          const revisions = await repository.listRevisions(loaded.deck.id, limit);
          const printingIds = revisions.flatMap((revision) =>
            revision.changes.map((change) => change.printing_id),
          );
          const [cards, authors] = await Promise.all([
            repository.getResolvedPrintings(printingIds),
            repository.getProfiles(
              revisions
                .map((revision) => revision.author_id)
                .filter((id): id is string => typeof id === "string"),
            ),
          ]);
          const nameById = new Map(cards.map((card) => [card.printing_id, card.name]));
          const authorById = new Map(authors.map((profile) => [profile.id, profile]));

          return {
            items: revisions.map((revision) => ({
              id: revision.id,
              ordinal: revision.ordinal,
              author: revision.author_id ? (authorById.get(revision.author_id) ?? null) : null,
              format_id: revision.format_id,
              created_at: revision.created_at,
              changes: revision.changes.map((change) => ({
                ...change,
                name: nameById.get(change.printing_id) ?? null,
              })),
            })),
            total: revisions.length,
          };
        },
        {
          params: t.Object({ id: t.String() }),
          query: t.Object({ limit: t.Optional(t.Numeric()) }),
          response: {
            200: t.Object({ items: t.Array(RevisionSchema), total: t.Number() }),
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Deck revision history",
            description: "Coalesced edit bursts, newest first.",
          },
        },
      )
  );
}
