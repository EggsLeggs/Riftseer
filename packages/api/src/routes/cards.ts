import { Elysia, t } from "elysia";
import {
  BadCardSearchQueryError,
  andAst,
  buildOracleDetail,
  filterLeaf,
  finalizeOracle,
  finalizeOracles,
  finalizePrinting,
  finalizePrintings,
  parseCardRequests,
  parseCardSearchQuery,
  validateCardSearchAst,
  type CardDataProvider,
  type CardSearchAst,
  type CardSearchField,
  type Oracle,
  type Printing,
} from "@riftseer/core";
import {
  ErrorSchema,
  OracleDetailSchema,
  OracleSchema,
  PrintingSchema,
  ResolvedCardSchema,
} from "../schemas";

/** Hard cap so callers cannot page arbitrarily deep in one request. */
const MAX_SEARCH_OFFSET = 10_000;
/** Hard cap on per-set fetches to prevent oversized reads. */
const MAX_SET_BROWSE_LIMIT = 2_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Rewrites purchase_uris.tcgplayer to an Impact.com affiliate deep link.
 * Set TCGPLAYER_AFFILIATE_ID to your Impact publisher ID to enable.
 * Deep link format: https://partner.tcgplayer.com/c/{id}/1780961/21018?u={productUrl}
 */
function withAffiliateLinks(
  printing: Printing,
  affiliateId: string | undefined,
): Printing {
  if (!affiliateId || !printing.purchase_uris?.tcgplayer) return printing;
  const affiliateUrl =
    `https://partner.tcgplayer.com/c/${affiliateId}/1780961/21018?u=` +
    encodeURIComponent(printing.purchase_uris.tcgplayer);
  return {
    ...printing,
    purchase_uris: { ...printing.purchase_uris, tcgplayer: affiliateUrl },
  };
}

/** Scryfall-style copyable text: name, type line, then rules text. */
function oracleCopyableText(oracle: Oracle): string {
  const lines: string[] = [oracle.name];
  const typePart = [oracle.card_type, oracle.supertype]
    .filter(Boolean)
    .join(" — ");
  if (typePart) lines.push(typePart);
  if (oracle.text?.plain?.trim()) {
    if (lines.length > 1) lines.push("");
    lines.push(oracle.text.plain.trim());
  }
  return lines.join("\n");
}

export function cardsRoutes(cardProvider: CardDataProvider) {
  const affiliateId = process.env.TCGPLAYER_AFFILIATE_ID || undefined;
  const siteOrigin = process.env.SITE_ORIGIN || undefined;

  /** Prices are opt-in; affiliate rewriting is not. Both are printing-level. */
  const preparePrinting = (
    printing: Printing,
    include: string | undefined,
  ): Printing => {
    const withLinks = withAffiliateLinks(printing, affiliateId);
    return include === "prices" ? withLinks : { ...withLinks, prices: undefined };
  };

  const prepareOracle = (oracle: Oracle, include: string | undefined): Oracle => {
    const next: Oracle = { ...oracle };
    if (next.preferred_printing) {
      next.preferred_printing = preparePrinting(next.preferred_printing, include);
    }
    if (next.printings) {
      next.printings = next.printings.map((p) => preparePrinting(p, include));
    }
    return next;
  };

  const oracleOut = (oracle: Oracle, include: string | undefined) =>
    finalizeOracle(prepareOracle(oracle, include), siteOrigin);
  const oraclesOut = (oracles: Oracle[], include: string | undefined) =>
    finalizeOracles(
      oracles.map((o) => prepareOracle(o, include)),
      siteOrigin,
    );
  const printingOut = (printing: Printing, include: string | undefined) =>
    finalizePrinting(preparePrinting(printing, include), siteOrigin);
  const printingsOut = (printings: Printing[], include: string | undefined) =>
    finalizePrintings(
      printings.map((p) => preparePrinting(p, include)),
      siteOrigin,
    );

  /**
   * Resolve a public slug to an oracle plus the printing it named.
   *
   * A printing slug has set/collector segments; an oracle slug is a single
   * name segment. Trying the shape the slug looks like first (and the other
   * as a fallback) is what lets one site route serve `/card/brush` and
   * `/card/ogn/12a/signature/sun-disc` alike.
   */
  async function resolveSlug(
    slug: string,
  ): Promise<{ oracle: Oracle; printing: Printing | null } | null> {
    const looksLikePrinting = slug.includes("/");

    if (!looksLikePrinting) {
      const oracle = await cardProvider.getOracleBySlug(slug);
      if (oracle) return { oracle, printing: null };
    }

    const printing = await cardProvider.getPrintingBySlug(slug);
    if (printing) {
      const oracle = await cardProvider.getOracleById(printing.oracle_id);
      return oracle ? { oracle, printing } : null;
    }

    if (looksLikePrinting) {
      const oracle = await cardProvider.getOracleBySlug(slug);
      if (oracle) return { oracle, printing: null };
    }
    return null;
  }

  /**
   * The printing a caller asked for becomes the one the oracle shows. Callers
   * that fetched a specific printing want the card described through it, not
   * through whichever printing ingest happened to prefer.
   */
  function viewedThrough(oracle: Oracle, printing: Printing | null): Oracle {
    return printing ? { ...oracle, preferred_printing: printing } : oracle;
  }

  return new Elysia()
    // ── GET /cards/random ─────────────────────────────────────────────────────
    .get(
      "/cards/random",
      async ({ query, set }) => {
        const oracle = await cardProvider.getRandomOracle();
        if (!oracle) {
          set.status = 404;
          return { error: "No cards available", code: "NOT_FOUND" };
        }
        return oracleOut(oracle, query.include);
      },
      {
        query: t.Object({
          include: t.Optional(t.String({ description: "Extra fields to include, e.g. `prices`" })),
        }),
        response: {
          200: OracleSchema,
          404: ErrorSchema,
        },
        detail: {
          tags: ["Cards"],
          summary: "Get a random card",
          description: "Returns a single random card, with its preferred printing.",
        },
      },
    )

    // ── GET /cards/detail ─────────────────────────────────────────────────────
    // Registered before /cards/:id so "detail" is never read as an oracle id.
    .get(
      "/cards/detail",
      async ({ query, set }) => {
        const oracleId = query.oracle?.trim();
        const printingId = query.printing?.trim();
        const slug = query.slug?.trim().replace(/^\/+|\/+$/g, "");

        const given = [oracleId, printingId, slug].filter(Boolean);
        if (given.length !== 1) {
          set.status = 400;
          return {
            error: "Provide exactly one of `oracle`, `printing` or `slug`.",
            code: "BAD_REQUEST",
          };
        }

        let oracle: Oracle | null = null;
        let printing: Printing | null = null;

        if (oracleId) {
          oracle = await cardProvider.getOracleById(oracleId);
        } else if (printingId) {
          // The legacy `/card/<printing-id>` site route lands here: a printing
          // id resolves to its oracle, viewed through that printing.
          printing = await cardProvider.getPrintingById(printingId);
          if (printing) oracle = await cardProvider.getOracleById(printing.oracle_id);
        } else {
          const resolved = await resolveSlug(slug!);
          oracle = resolved?.oracle ?? null;
          printing = resolved?.printing ?? null;
        }

        if (!oracle) {
          set.status = 404;
          return { error: "Card not found", code: "NOT_FOUND" };
        }

        const current = printing ?? oracle.preferred_printing ?? null;
        if (!current) {
          set.status = 404;
          return { error: "Card has no printings", code: "NOT_FOUND" };
        }

        const detail = await buildOracleDetail(
          prepareOracle(oracle, query.include),
          current,
          cardProvider,
          {
            siteOrigin,
            prepare: (p) => preparePrinting(p, query.include),
          },
        );

        return {
          ...detail,
          oracle: finalizeOracle(detail.oracle, siteOrigin),
          printing: finalizePrinting(detail.printing, siteOrigin),
          printings: finalizePrintings(detail.printings, siteOrigin),
        };
      },
      {
        query: t.Object({
          oracle: t.Optional(
            t.String({ description: "Oracle UUID. Mutually exclusive with the others." }),
          ),
          printing: t.Optional(
            t.String({
              description:
                "Printing id. Resolves to its oracle and marks that printing current.",
            }),
          ),
          slug: t.Optional(
            t.String({
              description:
                "Oracle slug (`brush`) or printing slug (`ogn/12a/signature/sun-disc`).",
            }),
          ),
          include: t.Optional(t.String({ description: "Extra fields to include, e.g. `prices`" })),
        }),
        response: {
          200: OracleDetailSchema,
          400: ErrorSchema,
          404: ErrorSchema,
        },
        detail: {
          tags: ["Cards"],
          summary: "Get the card page payload",
          description:
            "Everything the public card page needs in one request: the oracle, the " +
            "printing being viewed, every printing of the card, its relationship " +
            "refs, resolved marketplace links, rulings and legalities. Look up by " +
            "`oracle`, `printing` or `slug` — exactly one is required.",
        },
      },
    )

    // ── GET /cards/:id ────────────────────────────────────────────────────────
    .get(
      "/cards/:id",
      async ({ params, query, set }) => {
        // Accept whichever oracle handle the caller has. A uuid is the id; a
        // bare word is far more likely to be an oracle_key or slug, and making
        // a caller know which of the three they hold is a footgun for no gain.
        const oracle = UUID_RE.test(params.id)
          ? await cardProvider.getOracleById(params.id)
          : ((await cardProvider.getOracleByKey(params.id)) ??
            (await cardProvider.getOracleBySlug(params.id)));
        if (!oracle) {
          set.status = 404;
          return { error: "Card not found", code: "NOT_FOUND" };
        }
        return oracleOut(oracle, query.include);
      },
      {
        params: t.Object({
          id: t.String({ description: "Oracle UUID, oracle_key or slug" }),
        }),
        query: t.Object({
          include: t.Optional(t.String({ description: "Extra fields to include, e.g. `prices`" })),
        }),
        response: {
          200: OracleSchema,
          404: ErrorSchema,
        },
        detail: {
          tags: ["Cards"],
          summary: "Get a card by oracle id",
          description: "Returns one card by its stable oracle UUID.",
        },
      },
    )

    // ── GET /cards/:id/text ───────────────────────────────────────────────────
    .get(
      "/cards/:id/text",
      async ({ params }) => {
        const oracle = await cardProvider.getOracleById(params.id);
        if (!oracle) {
          return new Response(
            JSON.stringify({ error: "Card not found", code: "NOT_FOUND" }),
            { status: 404, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(oracleCopyableText(oracle), {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      },
      {
        params: t.Object({ id: t.String({ description: "Oracle UUID" }) }),
        response: {
          200: t.String({ description: "Copy-pasteable plain-text card summary (text/plain; charset=utf-8)" }),
          404: ErrorSchema,
        },
        detail: {
          tags: ["Cards"],
          summary: "Get a card as plain text",
          description: "Returns copy-pasteable text (name, type line, rules).",
        },
      },
    )

    // ── GET /cards/by-slug/* ──────────────────────────────────────────────────
    // The wildcard matches the full slug path (with slashes), so both
    // /cards/by-slug/brush and /cards/by-slug/ogn/12a/sun-disc land here.
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
        const resolved = await resolveSlug(slug);
        if (!resolved) {
          set.status = 404;
          return { error: "Card not found", code: "NOT_FOUND" };
        }
        return oracleOut(
          viewedThrough(resolved.oracle, resolved.printing),
          query.include,
        );
      },
      {
        params: t.Object({
          "*": t.String({
            description: "Wildcard slug path — oracle or printing.",
          }),
        }),
        query: t.Object({
          include: t.Optional(t.String({ description: "Extra fields to include, e.g. `prices`" })),
        }),
        response: {
          200: OracleSchema,
          400: ErrorSchema,
          404: ErrorSchema,
        },
        detail: {
          tags: ["Cards"],
          summary: "Get a card by public slug",
          description:
            "Look up a card by an oracle slug (`brush`) or a printing slug " +
            "(`ogn/12a/signature/sun-disc`). A printing slug returns the card " +
            "with that printing as `preferred_printing`.",
        },
      },
    )

    // ── GET /printings/:id ────────────────────────────────────────────────────
    .get(
      "/printings/:id",
      async ({ params, query, set }) => {
        const printing = await cardProvider.getPrintingById(params.id);
        if (!printing) {
          set.status = 404;
          return { error: "Printing not found", code: "NOT_FOUND" };
        }
        return printingOut(printing, query.include);
      },
      {
        params: t.Object({ id: t.String({ description: "Printing id (ObjectId)" }) }),
        query: t.Object({
          include: t.Optional(t.String({ description: "Extra fields to include, e.g. `prices`" })),
        }),
        response: {
          200: PrintingSchema,
          404: ErrorSchema,
        },
        detail: {
          tags: ["Cards"],
          summary: "Get one printing",
          description:
            "Returns a single physical printing. Use `/cards/:id` for the rules object.",
        },
      },
    )

    // ── GET /cards ────────────────────────────────────────────────────────────
    .get(
      "/cards",
      async ({ query, set }) => {
        const parsedLimit = parseInt(query.limit ?? "", 10);
        const parsedOffset = parseInt(query.offset ?? "", 10);
        const offset =
          Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
        const offsetTooLarge =
          Number.isFinite(parsedOffset) && parsedOffset > MAX_SEARCH_OFFSET;
        const empty = { cards: [] as Oracle[], printings: [] as Printing[] };

        // browse=all: paginated all-cards browse, no search term required.
        if (query.browse === "all") {
          if (offsetTooLarge) {
            set.status = 400;
            return { error: "offset too large", code: "OFFSET_TOO_LARGE" };
          }
          const pageLimit = Math.min(
            Math.max(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 60, 1),
            100,
          );
          const { oracles, total } = await cardProvider.browseOracles({
            limit: pageLimit,
            offset,
          });
          const cards = oraclesOut(oracles, query.include);
          return {
            ...empty,
            unique: "oracle" as const,
            count: cards.length,
            total,
            offset,
            limit: pageLimit,
            cards,
          };
        }

        const rawQuery = (query.name ?? query.q ?? "").trim();
        const hasStructuredFilter = Boolean(
          query.type?.trim() || query.artist?.trim() || query.rarity?.trim(),
        );

        // Browse a set: GET /cards?set=OGN with no other search input. A set
        // listing is a list of physical cards, so it is always printing-shaped.
        if (query.set && !rawQuery && !hasStructuredFilter) {
          const setLimit = Math.min(
            Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : MAX_SET_BROWSE_LIMIT,
            MAX_SET_BROWSE_LIMIT,
          );
          const rows = await cardProvider.getPrintingsBySet(query.set, {
            limit: setLimit,
          });
          const printings = printingsOut(rows, query.include);
          return {
            ...empty,
            unique: "prints" as const,
            count: printings.length,
            printings,
          };
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
        // additional AND conjuncts, so UI chips compose with the typed query.
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

        if (offsetTooLarge) {
          set.status = 400;
          return { error: "offset too large", code: "OFFSET_TOO_LARGE" };
        }

        // Pass fuzzy: false only when the caller explicitly opts out, so the
        // default path runs autocomplete scoring instead of exact-only lookup.
        const exactOnly = query.fuzzy === "0" || query.fuzzy === "false";
        const pageLimit =
          Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;
        const clampedLimit = Math.min(Math.max(pageLimit, 1), 100);
        const opts = {
          set: query.set,
          collector: query.collector,
          fuzzy: exactOnly ? false : undefined,
          limit: clampedLimit,
          offset,
        };

        if (query.unique === "prints") {
          const {
            printings: rows,
            oracles: owners,
            total,
          } = await cardProvider.searchPrintingsByAst(ast, {
            ...opts,
            unique: "prints",
          });
          const printings = printingsOut(rows, query.include);
          return {
            ...empty,
            unique: "prints" as const,
            count: printings.length,
            total,
            offset,
            limit: clampedLimit,
            printings,
            // The owning cards, so a client rendering a type line or rules
            // text alongside each printing does not need a request per row.
            cards: finalizeOracles(owners, siteOrigin),
          };
        }

        const { oracles, total } = await cardProvider.searchOraclesByAst(ast, {
          ...opts,
          unique: "oracle",
        });
        const cards = oraclesOut(oracles, query.include);
        return {
          ...empty,
          unique: "oracle" as const,
          count: cards.length,
          total,
          offset,
          limit: clampedLimit,
          cards,
        };
      },
      {
        query: t.Object({
          name: t.Optional(
            t.String({
              description:
                "Card search query. Plain words run as full-text name search; supports `t:type`, `a:artist`, `r:rarity`, `kw:`, `is:`, exact `!Name` / `!\"Sun Disc\"`, negation `-t:foo`, explicit `or`, and parentheses `(...)`.",
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
              description: "Optional explicit rarity filter, merged as `AND r:value`. Rarity is printing-level.",
            }),
          ),
          set: t.Optional(t.String({ description: "Set code filter, e.g. OGN" })),
          collector: t.Optional(t.String({ description: "Collector number filter" })),
          fuzzy: t.Optional(
            t.String({
              description: "Pass `false` or `0` to disable fuzzy/autocomplete matching (exact name only).",
            }),
          ),
          browse: t.Optional(t.String({ description: "Pass `all` to browse every card without a search query." })),
          unique: t.Optional(
            t.String({
              description:
                "`oracle` (default) returns one row per card in `cards`; `prints` returns one row per printing in `printings`.",
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
            unique: t.UnionEnum(["oracle", "prints"], {
              description: "Which array carries the results.",
            }),
            count: t.Number({ description: "Rows in this response" }),
            cards: t.Array(OracleSchema, {
              description: "Populated when `unique` is `oracle`; empty otherwise.",
            }),
            printings: t.Array(PrintingSchema, {
              description: "Populated when `unique` is `prints`; empty otherwise.",
            }),
            total: t.Optional(
              t.Number({ description: "Total matching rows for this query" }),
            ),
            offset: t.Optional(t.Number()),
            limit: t.Optional(t.Number({ description: "Requested page size" })),
          }),
          400: ErrorSchema,
        },
        detail: {
          tags: ["Cards"],
          summary: "Search cards",
          description:
            "A result row is a card (`object: \"oracle\"`) carrying the matching " +
            "printing as `preferred_printing`. Pass `unique=prints` for genuinely " +
            "printing-level questions (`is:alternate`, a set/collector filter), " +
            "which returns printings in `printings` instead. " +
            "Optional URL filters (`type`, `artist`, `rarity`) are merged as " +
            "additional AND conjuncts. Pass `fuzzy=false` for exact-name-only lookups.",
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
          // Callers send the token *contents* (`Brush`, `Vayne|VEN-SP3`), which
          // we wrap so one parser handles every entry point. A caller that
          // sends the brackets too would otherwise produce `[[[[Brush]]]]`,
          // which parses to the literal `[[Brush` — so strip them first.
          const inner = r.trim().replace(/^\[\[|\]\]$/g, "");
          const parsed = parseCardRequests(`[[${inner}]]`);
          return parsed[0] ?? { raw: r, name: inner };
        });

        const results = await Promise.all(
          requests.map((req) => cardProvider.resolveRequest(req)),
        );

        return {
          count: results.length,
          results: results.map((result) => ({
            ...result,
            oracle: result.oracle
              ? oracleOut(result.oracle, body.include)
              : null,
            printing: result.printing
              ? printingOut(result.printing, body.include)
              : null,
          })),
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
            "Resolve up to 20 card name strings. This is an oracle lookup that also " +
            "picks a printing: the one the request named, or the card's preferred " +
            "one. Accepts plain names or [[Name|SET-123]] format. " +
            "Used by the Reddit bot and for batch lookups from the site.",
          requestBody: {
            content: {
              "application/json": {
                example: { requests: ["Sun Disc", "Stalwart Poro", "NonExistentCard"] },
              },
            },
          },
        },
      },
    );
}
