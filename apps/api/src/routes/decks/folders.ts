import { t, Elysia } from "elysia";
import type { DeckRole } from "../../repos/decks.repo";
import { canRead, roleFor } from "../../authz/deck-access";
import { ErrorSchema } from "../../schemas";
import { DeckSummarySchema, DeckFolderSchema } from "./schemas";
import { FOLDER_NAME_MAX, unavailable, type DeckRouteContext } from "./shared";

// ─── Deck folders ─────────────────────────────────────────────────────────────

/** Folders are private organisation: every route is owner-scoped. */
export function folderRoutes(ctx: DeckRouteContext) {
  const { repository, load, summarize } = ctx;
  return (
    new Elysia()
      .use(ctx.authPlugin)

      // ── Deck folders ──────────────────────────────────────────────────
      // Under `/deck-folders`, not `/decks/folders`: the latter would be
      // swallowed by `/decks/:id`. Folders are private organisation — every
      // route is owner-scoped, and a folder that is not yours 404s.

      .get(
        "/deck-folders",
        async ({ user, query, set }) => {
          if (!repository) return unavailable(set);
          const folders = await repository.listFolders(user.id);
          const items = await repository.getFolderItems(folders.map((f) => f.id));
          return {
            items: folders.map((folder) => {
              const deckIds = items.get(folder.id) ?? [];
              return {
                id: folder.id,
                name: folder.name,
                deck_count: deckIds.length,
                ...(query.deck ? { contains_deck: deckIds.includes(query.deck) } : {}),
                created_at: folder.created_at,
                updated_at: folder.updated_at,
              };
            }),
            total: folders.length,
          };
        },
        {
          query: t.Object({ deck: t.Optional(t.String()) }),
          response: {
            200: t.Object({ items: t.Array(DeckFolderSchema), total: t.Number() }),
            401: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "List your deck folders",
            description:
              "Folders are private organisation: flat, unordered, owner-only. Pass " +
              "`?deck=` to add `contains_deck` to each folder.",
          },
        },
      )

      .post(
        "/deck-folders",
        async ({ user, body, set }) => {
          if (!repository) return unavailable(set);
          const name = body.name.trim();
          if (!name) {
            set.status = 400;
            return { error: "A folder needs a name.", code: "EMPTY_NAME" };
          }
          const folder = await repository.createFolder(user.id, name);
          set.status = 201;
          return {
            id: folder.id,
            name: folder.name,
            deck_count: 0,
            created_at: folder.created_at,
            updated_at: folder.updated_at,
          };
        },
        {
          body: t.Object({ name: t.String({ maxLength: FOLDER_NAME_MAX }) }),
          response: {
            201: DeckFolderSchema,
            400: ErrorSchema,
            401: ErrorSchema,
            503: ErrorSchema,
          },
          detail: { tags: ["Decks"], summary: "Create a deck folder" },
        },
      )

      .get(
        "/deck-folders/:id",
        async ({ user, params, set }) => {
          if (!repository) return unavailable(set);
          const folder = await repository.getFolder(params.id);
          if (!folder || folder.owner_id !== user.id) {
            set.status = 404;
            return { error: "Folder not found", code: "NOT_FOUND" };
          }
          const decks = await repository.listFolderDecks(folder.id);
          // Prune to what the owner can still read: a filed public deck
          // that went private is a bookmark to nothing.
          const roles = new Map<string, DeckRole | null>(
            await Promise.all(
              decks.map(
                async (deck) => [deck.id, await roleFor(repository, deck, user.id)] as const,
              ),
            ),
          );
          const readable = decks.filter((deck) => canRead(deck, roles.get(deck.id) ?? null));
          return {
            folder: {
              id: folder.id,
              name: folder.name,
              deck_count: readable.length,
              created_at: folder.created_at,
              updated_at: folder.updated_at,
            },
            items: await summarize(readable, roles, user.id),
          };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({
              folder: DeckFolderSchema,
              items: t.Array(DeckSummarySchema),
            }),
            401: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "One folder and its decks",
            description:
              "Contents are pruned on read to decks the caller can still read. A folder that is not yours 404s.",
          },
        },
      )

      .patch(
        "/deck-folders/:id",
        async ({ user, params, body, set }) => {
          if (!repository) return unavailable(set);
          const folder = await repository.getFolder(params.id);
          if (!folder || folder.owner_id !== user.id) {
            set.status = 404;
            return { error: "Folder not found", code: "NOT_FOUND" };
          }
          const name = body.name.trim();
          if (!name) {
            set.status = 400;
            return { error: "A folder needs a name.", code: "EMPTY_NAME" };
          }
          const renamed = await repository.renameFolder(folder.id, name);
          const items = await repository.getFolderItems([folder.id]);
          return {
            id: folder.id,
            name: renamed?.name ?? name,
            deck_count: (items.get(folder.id) ?? []).length,
            created_at: folder.created_at,
            updated_at: renamed?.updated_at ?? folder.updated_at,
          };
        },
        {
          params: t.Object({ id: t.String() }),
          body: t.Object({ name: t.String({ maxLength: FOLDER_NAME_MAX }) }),
          response: {
            200: DeckFolderSchema,
            400: ErrorSchema,
            401: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: { tags: ["Decks"], summary: "Rename a deck folder" },
        },
      )

      .delete(
        "/deck-folders/:id",
        async ({ user, params, set }) => {
          if (!repository) return unavailable(set);
          const folder = await repository.getFolder(params.id);
          if (!folder || folder.owner_id !== user.id) {
            set.status = 404;
            return { error: "Folder not found", code: "NOT_FOUND" };
          }
          // Deletes the folder and its item rows; the decks are untouched.
          await repository.deleteFolder(folder.id);
          return { message: "Folder deleted" };
        },
        {
          params: t.Object({ id: t.String() }),
          response: {
            200: t.Object({ message: t.String() }),
            401: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Delete a deck folder",
            description: "Never touches the decks filed in it.",
          },
        },
      )

      .put(
        "/deck-folders/:id/decks/:deckId",
        async ({ user, params, set }) => {
          if (!repository) return unavailable(set);
          const folder = await repository.getFolder(params.id);
          if (!folder || folder.owner_id !== user.id) {
            set.status = 404;
            return { error: "Folder not found", code: "NOT_FOUND" };
          }
          // Filing needs read access, nothing more — a folder item is a
          // bookmark. An unreadable deck 404s exactly as it does by id.
          const loaded = await load(params.deckId, user.id);
          if ("status" in loaded || !canRead(loaded.deck, loaded.role)) {
            set.status = 404;
            return { error: "Deck not found", code: "NOT_FOUND" };
          }
          await repository.addFolderItem(folder.id, loaded.deck.id);
          return { message: "Deck filed" };
        },
        {
          params: t.Object({ id: t.String(), deckId: t.String() }),
          response: {
            200: t.Object({ message: t.String() }),
            401: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "File a deck into a folder",
            description:
              "Idempotent. Any deck the caller can read may be filed — an item is a bookmark, not a claim.",
          },
        },
      )

      .delete(
        "/deck-folders/:id/decks/:deckId",
        async ({ user, params, set }) => {
          if (!repository) return unavailable(set);
          const folder = await repository.getFolder(params.id);
          if (!folder || folder.owner_id !== user.id) {
            set.status = 404;
            return { error: "Folder not found", code: "NOT_FOUND" };
          }
          await repository.removeFolderItem(folder.id, params.deckId);
          return { message: "Deck removed from folder" };
        },
        {
          params: t.Object({ id: t.String(), deckId: t.String() }),
          response: {
            200: t.Object({ message: t.String() }),
            401: ErrorSchema,
            404: ErrorSchema,
            503: ErrorSchema,
          },
          detail: {
            tags: ["Decks"],
            summary: "Remove a deck from a folder",
            description: "Idempotent.",
          },
        },
      )
  );
}
