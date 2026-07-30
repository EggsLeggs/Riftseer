import { Elysia, t } from "elysia";
import type { CardDataProvider } from "@riftseer/core";
import { FormatSchema } from "../schemas";

export function formatsRoutes(cardProvider: CardDataProvider) {
  return new Elysia()
    // ── GET /formats ──────────────────────────────────────────────────────────
    // Public list of play formats, in display order. Retired formats are hidden
    // here; admins see them through GET /admin/formats.
    .get(
      "/formats",
      async () => {
        // A read failure — most likely the Phase 5 tables not yet applied on
        // this environment — reports "no formats configured" rather than a 500.
        // That is what clients already handle, and it matches how the
        // card-detail payload degrades.
        let formats: Awaited<ReturnType<typeof cardProvider.getFormats>> = [];
        try {
          formats = await cardProvider.getFormats();
        } catch (error) {
          console.error(
            JSON.stringify({
              message: "failed to load formats",
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
        return { count: formats.length, formats };
      },
      {
        response: t.Object({
          count: t.Number(),
          formats: t.Array(FormatSchema),
        }),
        detail: {
          tags: ["Formats"],
          summary: "List play formats",
          description:
            "Returns the active play formats in display order. Card legalities " +
            "on the card-detail payload carry one entry per format listed here.",
        },
      },
    );
}
