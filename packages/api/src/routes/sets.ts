import { Elysia, t } from "elysia";
import type { CardDataProvider } from "@riftseer/core";

export function setsRoutes(cardProvider: CardDataProvider) {
  return new Elysia()
    // ── GET /sets ─────────────────────────────────────────────────────────────
    .get(
      "/sets",
      async () => {
        const sets = await cardProvider.getSets();
        return { count: sets.length, sets };
      },
      {
        response: t.Object({
          count: t.Number(),
          sets: t.Array(
            t.Object({
              setCode: t.String(),
              setName: t.String(),
              cardCount: t.Number(),
              isPromo: t.Boolean(),
              publishedOn: t.Nullable(t.String()),
            }),
          ),
        }),
        detail: {
          tags: ["Sets"],
          summary: "List all sets",
          description: "Returns all known card sets with card counts.",
        },
      },
    );
}
