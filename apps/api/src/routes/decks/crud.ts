import { t, Elysia } from "elysia";
import type { DeckRole, DeckRow, DeckVisibility } from "../../repos/decks.repo";
import { canRead, canWrite, roleFor } from "../../authz/deck-access";
import { ErrorSchema } from "../../schemas";
import { DeckSummarySchema, DeckDetailSchema, VisibilitySchema } from "./schemas";
import {
  NAME_MAX,
  DESCRIPTION_MAX,
  unavailable,
  deckShape,
  ownerProfile,
  viewerKey,
  type DeckRouteContext,
} from "./shared";

// ─── Decks: list, read, create, patch, delete ─────────────────────────────────

/** Who is asking changes the answer, but anonymous is allowed. */
export function deckReads(ctx: DeckRouteContext) {
  const { repository, viewDedup, load, detail, summarize } = ctx;
  return (
    new Elysia()
      .use(ctx.optionalAuthPlugin)

      // ── GET /decks ────────────────────────────────────────────────────
      .get(
        "/decks",
        async ({ user, query, set }) => {
          if (!repository) return unavailable(set);

          // `filter=favorites` is its own listing: the caller's
          // favorites, whoever owns them, pruned to what is still
          // readable — an unfavorited-under-you deck simply disappears.
          if (query.filter === "favorites") {
            if (!user) {
              set.status = 401;
              return {
                error: "Missing or invalid Authorization header",
                code: "MISSING_TOKEN",
              };
            }
            const favorites = await repository.listFavoriteDecks(user.id);
            const favRoles = new Map<string, DeckRole | null>(
              await Promise.all(
                favorites.map(
                  async (deck) => [deck.id, await roleFor(repository, deck, user.id)] as const,
                ),
              ),
            );
            const readable = favorites.filter((deck) =>
              canRead(deck, favRoles.get(deck.id) ?? null),
            );
            return {
              items: await summarize(readable, favRoles, user.id),
              total: readable.length,
            };
          }

          let ownerId: string | undefined;
          let owner: { id: string; handle: string; username: string } | null = null;
          if (query.handle) {
            owner = await repository.getProfileByHandle(query.handle.toLowerCase());
            if (!owner) {
              set.status = 404;
              return { error: "Profile not found", code: "NOT_FOUND" };
            }
            ownerId = owner.id;
          } else {
            if (!user) {
              set.status = 401;
              return {
                error: "Missing or invalid Authorization header",
                code: "MISSING_TOKEN",
              };
            }
            ownerId = user.id;
          }

          const owned = await repository.listDecksOwnedBy(ownerId);
          const shared =
            user && ownerId === user.id ? await repository.listDecksSharedWith(user.id) : [];

          const seen = new Set<string>();
          const decks: DeckRow[] = [];
          for (const deck of [...owned, ...shared]) {
            if (seen.has(deck.id)) continue;
            seen.add(deck.id);
            decks.push(deck);
          }

          // Concurrent, not serial: a user with fifty decks would otherwise
          // pay fifty round trips before the response could start.
          const roles = new Map<string, DeckRole | null>(
            await Promise.all(
              decks.map(
                async (deck) => [deck.id, await roleFor(repository, deck, user?.id)] as const,
              ),
            ),
          );

          // A list is a browse surface: `private` needs a relationship and
          // `unlisted` is reachable only by its id, so neither belongs to
          // anyone else's listing.
          const visible = decks.filter((deck) => {
            if (deck.owner_id === user?.id) return true;
            if (roles.get(deck.id)) return true;
            return deck.visibility === "public";
          });

          return {
            items: await summarize(visible, roles, user?.id),
            total: visible.length,
          };
        },
        {
          query: t.Object({
            handle: t.Optional(t.String()),
            // A union of literals, not t.UnionEnum: Elysia fills an absent
            // optional UnionEnum with its first member.
            filter: t.Optional(t.Union([t.Literal("favorites")])),
          }),
          response: {
            200: t.Object({ items: t.Array(DeckSummarySchema), total: t.Number() }),
            401: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "List decks",
            description:
              "Your own decks and decks shared with you, or a user's decks by ?handle. Another user's private and unlisted decks are never listed.",
          },
        },
      )

      // ── GET /decks/:id ────────────────────────────────────────────────
      .get(
        "/decks/:id",
        async ({ params, user, set }) => {
          if (!repository) return unavailable(set);
          const loaded = await load(params.id, user?.id);
          if ("status" in loaded) {
            set.status = loaded.status;
            return loaded.body;
          }
          if (!canRead(loaded.deck, loaded.role)) {
            // Deliberately a 404: a 403 confirms the deck exists.
            set.status = 404;
            return { error: "Deck not found", code: "NOT_FOUND" };
          }
          return await detail(loaded.deck, loaded.role, user?.id);
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: DeckDetailSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Get a deck",
            description:
              "Resolved cards, derived tokens and format violations. Unlisted decks resolve by id.",
          },
        },
      )

      // ── POST /decks/:id/views ─────────────────────────────────────────
      .post(
        "/decks/:id/views",
        async ({ params, user, request, set }) => {
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
          // Your own deck is not an audience.
          if (loaded.role === "owner") return { counted: false };

          const key = `deckview:${loaded.deck.id}:${await viewerKey(user?.id, request)}`;
          const fresh = await viewDedup(key);
          if (fresh) {
            await repository.callRpc("deck_increment_views", {
              p_deck_id: loaded.deck.id,
            });
          }
          return { counted: fresh };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({ counted: t.Boolean() }),
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Count a view",
            description:
              "Fire-and-forget from the deck page. Deduplicated per viewer for six hours; owner views never count.",
          },
        },
      )
  );
}

/** A real user is required for every write. */
export function deckWrites(ctx: DeckRouteContext) {
  const { repository, load, detail } = ctx;
  return (
    new Elysia()
      .use(ctx.authPlugin)

      // ── POST /decks ───────────────────────────────────────────────────
      .post(
        "/decks",
        async ({ body, user, set }) => {
          if (!repository) return unavailable(set);
          const name = body.name.trim();
          if (name.length < 1 || name.length > NAME_MAX) {
            set.status = 400;
            return {
              error: `Deck name must be 1–${NAME_MAX} characters.`,
              code: "INVALID_NAME",
            };
          }

          const format = body.format
            ? await repository.getFormatByCode(body.format)
            : await repository.getFormatByCode("standard");
          if (!format) {
            set.status = 400;
            return { error: "Unknown format.", code: "UNKNOWN_FORMAT" };
          }

          const deck = await repository.createDeck({
            owner_id: user.id,
            format_id: format.id,
            name,
            description: body.description?.trim() || null,
            primer: body.primer ?? null,
            visibility: (body.visibility ?? "private") as DeckVisibility,
          });

          set.status = 201;
          return {
            ...deckShape(deck, format, await ownerProfile(repository, user.id), "owner"),
            // Brand new, so zero by definition — no count query needed.
            favorite_count: 0,
            is_favorited: false,
          };
        },
        {
          body: t.Object({
            name: t.String({ minLength: 1, maxLength: NAME_MAX }),
            description: t.Optional(t.String({ maxLength: DESCRIPTION_MAX })),
            primer: t.Optional(t.String()),
            format: t.Optional(t.String()),
            visibility: t.Optional(VisibilitySchema),
          }),
          response: {
            201: t.Omit(DeckDetailSchema, ["cards", "tokens", "violations"]),
            400: ErrorSchema,
            401: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Create a deck",
            description:
              "Creates an empty deck owned by the caller. `format` is a format code " +
              "(default `standard`); `visibility` defaults to `private`. Add cards " +
              "with PUT /decks/:id/cards.",
          },
        },
      )

      // ── PATCH /decks/:id ──────────────────────────────────────────────
      .patch(
        "/decks/:id",
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

          const patch: Record<string, unknown> = {};
          if (body.name !== undefined) {
            const name = body.name.trim();
            if (name.length < 1 || name.length > NAME_MAX) {
              set.status = 400;
              return {
                error: `Deck name must be 1–${NAME_MAX} characters.`,
                code: "INVALID_NAME",
              };
            }
            patch.name = name;
          }
          if (body.description !== undefined) {
            patch.description = body.description?.trim() || null;
          }
          if (body.primer !== undefined) patch.primer = body.primer || null;
          if (body.visibility !== undefined) {
            // Who can see a deck is the owner's call, not an editor's. An
            // editor is invited to help build, which is not consent to have
            // the deck published — so this one field outranks canWrite.
            if (loaded.role !== "owner") {
              set.status = 403;
              return {
                error: "Only the owner can change who can see this deck.",
                code: "OWNER_REQUIRED",
              };
            }
            patch.visibility = body.visibility;
          }
          if (body.format !== undefined) {
            const format = await repository.getFormatByCode(body.format);
            if (!format) {
              set.status = 400;
              return { error: "Unknown format.", code: "UNKNOWN_FORMAT" };
            }
            patch.format_id = format.id;
          }

          if (Object.keys(patch).length === 0) {
            set.status = 400;
            return { error: "No changes supplied.", code: "EMPTY_PATCH" };
          }

          const updated = (await repository.updateDeck(loaded.deck.id, patch)) ?? loaded.deck;
          return await detail(updated, loaded.role, user.id);
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({
            name: t.Optional(t.String({ maxLength: NAME_MAX })),
            description: t.Optional(t.Nullable(t.String({ maxLength: DESCRIPTION_MAX }))),
            primer: t.Optional(t.Nullable(t.String())),
            format: t.Optional(t.String()),
            visibility: t.Optional(VisibilitySchema),
          }),
          response: {
            200: DeckDetailSchema,
            400: ErrorSchema,
            401: ErrorSchema,
            403: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Update deck metadata",
            description:
              "Name, description, primer, format and visibility. Owner or editor, " +
              "except `visibility`, which only the owner may change — being invited " +
              "to help build is not consent to be published.",
          },
        },
      )

      // ── DELETE /decks/:id ─────────────────────────────────────────────
      .delete(
        "/decks/:id",
        async ({ params, user, set }) => {
          if (!repository) return unavailable(set);
          const loaded = await load(params.id, user.id);
          if ("status" in loaded) {
            set.status = loaded.status;
            return loaded.body;
          }
          if (loaded.role !== "owner") {
            set.status = canRead(loaded.deck, loaded.role) ? 403 : 404;
            return set.status === 403
              ? { error: "Only the owner can delete a deck.", code: "FORBIDDEN" }
              : { error: "Deck not found", code: "NOT_FOUND" };
          }
          await repository.deleteDeck(loaded.deck.id);
          return { message: "Deck deleted." };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({ message: t.String() }),
            401: ErrorSchema,
            403: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Delete a deck",
            description: "Owner only. A deck the caller cannot read answers 404, never 403.",
          },
        },
      )
  );
}
