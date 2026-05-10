import { Elysia, t } from "elysia";
import {
  BadCardSearchQueryError,
  andAst,
  filterLeaf,
  finalizeCard,
  finalizeCards,
  parseCardRequests,
  parseCardSearchQuery,
  validateCardSearchAst,
  type Card,
  type CardDataProvider,
  type CardSearchAst,
  type CardSearchField,
} from "@riftseer/core";
import { CardSchema, ErrorSchema, ResolvedCardSchema } from "../schemas";

/** Hard cap so callers cannot page arbitrarily deep in one request. */
const MAX_SEARCH_OFFSET = 10_000;

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
  const siteOrigin = process.env.SITE_ORIGIN || undefined;
  const affiliate = (card: Card) => withAffiliateLinks(card, affiliateId);
  const prepare = (card: Card, include: string | undefined) =>
    include === "prices" ? affiliate(card) : stripPrices(affiliate(card));

  /** Apply prepare() (affiliate, prices) and finalize (riftseer_uri hydration). */
  const finalizeOne = (card: Card, include: string | undefined) =>
    finalizeCard(prepare(card, include), siteOrigin, cardProvider);
  const finalizeMany = (cards: Card[], include: string | undefined) =>
    finalizeCards(
      cards.map((c) => prepare(c, include)),
      siteOrigin,
      cardProvider,
    );

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
        return await finalizeOne(card, query.include);
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
        return await finalizeOne(card, query.include);
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

    // ── GET /cards/by-slug/* ──────────────────────────────────────────────────
    // Look up a card by its persisted public_slug.  The wildcard matches the
    // full slug path (with slashes), e.g. /cards/by-slug/ogn/12a/sun-disc.
    .get(
      "/cards/by-slug/*",
      async ({ params, query, set }) => {
        let slug: string;
        try {
          slug = decodeURIComponent(params["*"] ?? "");
        } catch {
          set.status = 400;
          return { error: "Invalid slug", code: "BAD_REQUEST" };
        }
        const card = await cardProvider.getCardByPublicSlug(slug);
        if (!card) {
          set.status = 404;
          return { error: "Card not found", code: "NOT_FOUND" };
        }
        return await finalizeOne(card, query.include);
      },
      {
        params: t.Object({
          "*": t.String({
            description:
              "Wildcard public slug path, e.g. `ogn/12a/signature/sun-disc`",
          }),
        }),
        query: t.Object({
          include: t.Optional(t.String({ description: "Extra fields to include, e.g. `prices`" })),
        }),
        response: {
          200: CardSchema,
          400: ErrorSchema,
          404: ErrorSchema,
        },
        detail: {
          tags: ["Cards"],
          summary: "Get card by public slug",
          description:
            "Look up a single printing by the persisted public_slug — e.g. " +
            "`/cards/by-slug/ogn/12a/signature/sun-disc`. Used by the Next.js " +
            "card detail route.",
        },
      },
    )

    // ── GET /cards ────────────────────────────────────────────────────────────
    .get(
      "/cards",
      async ({ query, set }) => {
        const parsedLimit = parseInt(query.limit ?? "", 10);
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;

        // `q` is an alias for `name`; if both are present, `name` wins so older
        // clients keep working unchanged.
        const rawQuery = (query.name ?? query.q ?? "").trim();
        const hasStructuredFilter = Boolean(
          query.type?.trim() || query.artist?.trim() || query.rarity?.trim(),
        );

        // Browse set: GET /cards?set=OGN with no other search input — return
        // all cards in set, ordered by collector number. Structured filters
        // count as search input and bypass this branch.
        if (query.set && !rawQuery && !hasStructuredFilter) {
          const cards = await cardProvider.getCardsBySet(query.set, {
            limit: limit ?? 2000,
          });
          const finalized = await finalizeMany(cards, query.include);
          return { count: finalized.length, cards: finalized };
        }

        let parsedAst: CardSearchAst | null;
        try {
          parsedAst = parseCardSearchQuery(rawQuery).ast;
        } catch (err) {
          if (err instanceof BadCardSearchQueryError) {
            set.status = 400;
            return { error: err.message, code: "BAD_QUERY" };
          }
          throw err;
        }

        // Merge optional URL-level filters (`type` / `artist` / `rarity`) as
        // additional AND conjuncts. UI chips will plug in here later.
        const extras: CardSearchAst[] = [];
        const addFilter = (field: CardSearchField, value: string | undefined) => {
          if (!value) return;
          const leaf = filterLeaf(field, value);
          if (leaf) extras.push(leaf);
        };
        addFilter("type", query.type);
        addFilter("artist", query.artist);
        addFilter("rarity", query.rarity);

        const ast = andAst(parsedAst, ...extras);
        if (!ast) {
          set.status = 400;
          return {
            error: "Provide a search term (`name` / `q`) or at least one filter.",
            code: "MISSING_PARAM",
          };
        }

        try {
          validateCardSearchAst(ast);
        } catch (err) {
          if (err instanceof BadCardSearchQueryError) {
            set.status = 400;
            return { error: err.message, code: "BAD_QUERY" };
          }
          throw err;
        }

        const parsedOffset = parseInt(query.offset ?? "", 10);
        if (
          Number.isFinite(parsedOffset) &&
          parsedOffset > MAX_SEARCH_OFFSET
        ) {
          set.status = 400;
          return {
            error: "offset too large",
            code: "OFFSET_TOO_LARGE",
          };
        }
        const offset =
          Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

        // Pass fuzzy: false only when the caller explicitly opts out, so the
        // default path runs autocomplete scoring instead of exact-only lookup.
        const exactOnly = query.fuzzy === "0" || query.fuzzy === "false";
        const pageLimit =
          Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;
        const clampedLimit = Math.min(Math.max(pageLimit, 1), 100);

        const { cards, total } = await cardProvider.searchByAst(ast, {
          set: query.set,
          collector: query.collector,
          fuzzy: exactOnly ? false : undefined,
          limit: clampedLimit,
          offset,
        });

        const finalized = await finalizeMany(cards, query.include);
        return {
          count: finalized.length,
          total,
          offset,
          limit: clampedLimit,
          cards: finalized,
        };
      },
      {
        query: t.Object({
          name: t.Optional(
            t.String({
              description:
                "Card search query. Plain words run as full-text name search; supports `t:type`, `a:artist`, `r:rarity`, exact `!Name` / `!\"Sun Disc\"`, negation `-t:foo`, explicit `or`, and parentheses `(...)`.",
            }),
          ),
          q: t.Optional(
            t.String({
              description: "Alias for `name`. When both are present, `name` wins.",
            }),
          ),
          type: t.Optional(
            t.String({
              description: "Optional explicit type filter, merged as `AND t:value` with the parsed query.",
            }),
          ),
          artist: t.Optional(
            t.String({
              description: "Optional explicit artist filter, merged as `AND a:value`.",
            }),
          ),
          rarity: t.Optional(
            t.String({
              description: "Optional explicit rarity filter, merged as `AND r:value`.",
            }),
          ),
          set: t.Optional(t.String({ description: "Set code filter, e.g. OGN" })),
          collector: t.Optional(t.String({ description: "Collector number filter" })),
          fuzzy: t.Optional(
            t.String({
              description: "Pass `false` or `0` to disable fuzzy/autocomplete matching (exact name only).",
            }),
          ),
          limit: t.Optional(t.String({ description: "Max results per page (default 10, max 100)" })),
          offset: t.Optional(
            t.String({ description: "0-based offset into the ranked result set (default 0)" }),
          ),
          include: t.Optional(t.String({ description: "Extra fields to include, e.g. `prices`" })),
        }),
        response: {
          200: t.Object({
            count: t.Number({ description: "Number of cards in this response" }),
            cards: t.Array(CardSchema),
            total: t.Optional(
              t.Number({
                description: "Total matching cards for this query (name search only)",
              }),
            ),
            offset: t.Optional(t.Number()),
            limit: t.Optional(t.Number({ description: "Requested page size (name search only)" })),
          }),
          400: ErrorSchema,
        },
        detail: {
          tags: ["Cards"],
          summary: "Search cards",
          description:
            "Search for cards by name and structured filters. The `name` (or `q`) parameter accepts a small Scryfall-inspired " +
            "query language: `t:`/`a:`/`r:` filters, `!Exact Name`, `-` to negate, lowercase `or`, and `(...)` to group. " +
            "Optional URL filters (`type`, `artist`, `rarity`) are merged as additional AND conjuncts so future UI chips can " +
            "compose with the typed query. Pass `fuzzy=false` for exact-name-only lookups.",
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

        // Finalize all matched cards in a single batched slug lookup.
        const matched = results
          .map((r) => r.card)
          .filter((c): c is Card => c != null);
        const finalized = await finalizeMany(matched, body.include);
        const finalizedById = new Map(finalized.map((c) => [c.id, c]));

        return {
          count: results.length,
          results: results.map((r) =>
            r.card ? { ...r, card: finalizedById.get(r.card.id) ?? r.card } : r,
          ),
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
