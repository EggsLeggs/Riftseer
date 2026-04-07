import { Elysia, t } from "elysia";
import { parseCardRequests, type CardDataProvider, type Card } from "@riftseer/core";
import { CardSchema, ErrorSchema, ResolvedCardSchema } from "../schemas";

/**
 * Rewrites purchase_uris.tcgplayer to an Impact.com affiliate deep link.
 * Set TCGPLAYER_AFFILIATE_ID to your Impact publisher ID to enable.
 * Deep link format: https://partner.tcgplayer.com/c/{id}/1780961/21018?u={productUrl}
 */
function withAffiliateLinks(card: Card, affiliateId: string | undefined): Card {
  if (!affiliateId || !card.purchase_uris?.tcgplayer) return card;
  const affiliateUrl =
    `https://partner.tcgplayer.com/c/${affiliateId}/1780961/21018?u=` +
    encodeURIComponent(card.purchase_uris.tcgplayer);
  return {
    ...card,
    purchase_uris: { ...card.purchase_uris, tcgplayer: affiliateUrl },
  };
}

/** Scryfall-style copyable text: name, type line, then rules text. */
function cardCopyableText(card: Card): string {
  const lines: string[] = [card.name];
  const typePart = [card.classification?.type, card.classification?.supertype]
    .filter(Boolean)
    .join(" — ");
  if (typePart) lines.push(typePart);
  if (card.text?.plain?.trim()) {
    if (lines.length > 1) lines.push("");
    lines.push(card.text.plain.trim());
  }
  return lines.join("\n");
}

function stripPrices(card: Card): Card {
  return { ...card, prices: undefined };
}

export function cardsRoutes(cardProvider: CardDataProvider) {
  const affiliateId = process.env.TCGPLAYER_AFFILIATE_ID || undefined;
  const affiliate = (card: Card) => withAffiliateLinks(card, affiliateId);
  const prepare = (card: Card, include: string | undefined) =>
    include === "prices" ? affiliate(card) : stripPrices(affiliate(card));

  return new Elysia()
    // ── GET /cards/random ─────────────────────────────────────────────────────
    .get(
      "/cards/random",
      async ({ query, set }) => {
        const card = await cardProvider.getRandomCard();
        if (!card) {
          set.status = 404;
          return { error: "No cards available", code: "NOT_FOUND" };
        }
        return prepare(card, query.include);
      },
      {
        query: t.Object({
          include: t.Optional(t.String({ description: "Extra fields to include, e.g. `prices`" })),
        }),
        response: {
          200: CardSchema,
          404: ErrorSchema,
        },
        detail: {
          tags: ["Cards"],
          summary: "Get a random card",
          description: "Returns a single random card from the index.",
        },
      },
    )

    // ── GET /cards/:id ────────────────────────────────────────────────────────
    .get(
      "/cards/:id",
      async ({ params, query, set }) => {
        const card = await cardProvider.getCardById(params.id);
        if (!card) {
          set.status = 404;
          return { error: "Card not found", code: "NOT_FOUND" };
        }
        return prepare(card, query.include);
      },
      {
        params: t.Object({ id: t.String({ description: "Card UUID" }) }),
        query: t.Object({
          include: t.Optional(t.String({ description: "Extra fields to include, e.g. `prices`" })),
        }),
        response: {
          200: CardSchema,
          404: ErrorSchema,
        },
        detail: {
          tags: ["Cards"],
          summary: "Get card by ID",
          description: "Returns a single card by its stable UUID.",
        },
      },
    )

    // ── GET /cards/:id/text ───────────────────────────────────────────────────
    .get(
      "/cards/:id/text",
      async ({ params }) => {
        const card = await cardProvider.getCardById(params.id);
        if (!card) {
          return new Response(
            JSON.stringify({ error: "Card not found", code: "NOT_FOUND" }),
            { status: 404, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(cardCopyableText(card), {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      },
      {
        params: t.Object({ id: t.String({ description: "Card UUID" }) }),
        response: {
          200: t.String({ description: "Copy-pasteable plain-text card summary (text/plain; charset=utf-8)" }),
          404: ErrorSchema,
        },
        detail: {
          tags: ["Cards"],
          summary: "Get card as plain text",
          description: "Returns copy-pasteable text (name, type line, rules).",
        },
      },
    )

    // ── GET /cards ────────────────────────────────────────────────────────────
    .get(
      "/cards",
      async ({ query, set }) => {
        const parsedLimit = parseInt(query.limit ?? "", 10);
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;

        // Browse set: GET /cards?set=OGN — return all cards in set, ordered by collector number
        if (query.set && !query.name?.trim()) {
          const cards = await cardProvider.getCardsBySet(query.set, {
            limit: limit ?? 2000,
          });
          return { count: cards.length, cards: cards.map((c) => prepare(c, query.include)) };
        }

        if (!query.name?.trim()) {
          set.status = 400;
          return {
            error: "Missing required query parameter: name",
            code: "MISSING_PARAM",
          };
        }

        // Pass fuzzy: false only when the caller explicitly opts out, so the
        // default path runs autocomplete scoring instead of exact-only lookup.
        const exactOnly = query.fuzzy === "0" || query.fuzzy === "false";
        const cards = await cardProvider.searchByName(query.name, {
          set: query.set,
          collector: query.collector,
          fuzzy: exactOnly ? false : undefined,
          limit: limit ?? 10,
        });

        return { count: cards.length, cards: cards.map((c) => prepare(c, query.include)) };
      },
      {
        query: t.Object({
          name: t.Optional(t.String({ description: "Card name to search for" })),
          set: t.Optional(t.String({ description: "Set code filter, e.g. OGN" })),
          collector: t.Optional(t.String({ description: "Collector number filter" })),
          fuzzy: t.Optional(
            t.String({
              description: "Pass `false` or `0` to disable fuzzy/autocomplete matching (exact name only).",
            }),
          ),
          limit: t.Optional(t.String({ description: "Max results (default 10)" })),
          include: t.Optional(t.String({ description: "Extra fields to include, e.g. `prices`" })),
        }),
        response: {
          200: t.Object({ count: t.Number(), cards: t.Array(CardSchema) }),
          400: ErrorSchema,
        },
        detail: {
          tags: ["Cards"],
          summary: "Search cards by name",
          description:
            "Search for cards by name with optional set/collector filters. " +
            "Autocomplete and fuzzy matching run by default; use `fuzzy=false` or `fuzzy=0` for exact-name-only lookup.",
        },
      },
    )

    // ── POST /cards/resolve ───────────────────────────────────────────────────
    .post(
      "/cards/resolve",
      async ({ body, set }) => {
        if (body.requests.length > 20) {
          set.status = 400;
          return { error: "Too many requests: maximum is 20", code: "TOO_MANY_REQUESTS" };
        }
        const requests = body.requests.map((r: string) => {
          const parsed = parseCardRequests(`[[${r}]]`);
          return parsed[0] ?? { raw: r, name: r };
        });

        const results = await Promise.all(
          requests.map((req) => cardProvider.resolveRequest(req)),
        );

        return {
          count: results.length,
          results: results.map((r) => r.card ? { ...r, card: prepare(r.card, body.include) } : r),
        };
      },
      {
        body: t.Object({
          requests: t.Array(t.String(), {
            description:
              "Array of card name strings (plain name OR [[Name|SET]] format, up to 20)."
          }),
          include: t.Optional(t.String({ description: "Extra fields to include, e.g. `prices`" })),
        }),
        response: {
          200: t.Object({ count: t.Number(), results: t.Array(ResolvedCardSchema) }),
          400: ErrorSchema,
        },
        detail: {
          tags: ["Cards"],
          summary: "Batch resolve card requests",
          description:
            "Resolve up to 20 card name strings to their best matching cards. " +
            "Accepts plain names or [[Name|SET-123]] format. " +
            "Used by the Reddit bot and can be used by the frontend for batch lookups.",
          requestBody: {
            content: {
              "application/json": {
                example: { requests: ["Sun Disc", "Stalwart Poro", "NonExistentCard"] },
              },
            },
          },
        },
      },
    )


}
