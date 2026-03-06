import { Elysia, t } from "elysia";
import type { CardDataProvider } from "@riftseer/core";

export function metaRoutes(cardProvider: CardDataProvider, startTime: number) {
  return new Elysia()
    .get(
      "/health",
      () => ({ status: "ok", uptimeMs: Date.now() - startTime }),
      {
        response: t.Object({ status: t.String(), uptimeMs: t.Number() }),
        detail: {
          tags: ["Meta"],
          summary: "Health check",
          description: "Returns 200 if the server is running.",
        },
      },
    )
    .get(
      "/meta",
      () => {
        const { lastRefresh, cardCount } = cardProvider.getStats();
        const cacheAgeSeconds = lastRefresh
          ? Math.floor(Date.now() / 1000 - lastRefresh)
          : null;

        return {
          provider: cardProvider.sourceName,
          cardCount,
          lastRefresh: lastRefresh
            ? new Date(lastRefresh * 1000).toISOString()
            : null,
          cacheAgeSeconds,
          uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        };
      },
      {
        response: t.Object({
          provider: t.String(),
          cardCount: t.Number(),
          lastRefresh: t.Nullable(t.String()),
          cacheAgeSeconds: t.Nullable(t.Number()),
          uptimeSeconds: t.Number(),
        }),
        detail: {
          tags: ["Meta"],
          summary: "Provider metadata",
          description:
            "Returns provider name, cache age, last refresh time, and card count.",
        },
      },
    );
}
