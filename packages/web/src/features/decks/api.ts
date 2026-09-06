/**
 * Public deck reads — no token, so this module is safe in a client component.
 *
 * Everything here is readable by an anonymous caller: a user's public decks by
 * handle, and any single deck the caller can reach by id (`public` always,
 * `unlisted` because holding the link is the credential). Anything that needs a
 * session lives in `server-api.ts` and `actions.ts`, because the browser must
 * never see an access token.
 *
 * A deck the caller may not read answers 404, never 403 — so `null` here means
 * "no deck for you", not "no such deck", and views should not distinguish.
 */

import { createApiClient } from "@/lib/api/client";
import { getJsonFromTreaty, requestFetchInit } from "@/lib/api/request";

import type {
  DeckDetail,
  DeckExport,
  DeckListPage,
  DeckRevisionsPage,
  DeckCommentsPage,
} from "./types";

export { CardApiError } from "@/lib/api/errors";

const decksClient = createApiClient();

export const decksApi = {
  /**
   * One user's decks. Their `private` and `unlisted` decks are never listed,
   * so this is the same answer for every caller.
   */
  async listByHandle(handle: string): Promise<DeckListPage | null> {
    return getJsonFromTreaty<DeckListPage>(() =>
      decksClient.api.v1.decks.get({
        query: { handle },
        fetch: requestFetchInit(),
      }),
    );
  },

  async getDeck(id: string): Promise<DeckDetail | null> {
    return getJsonFromTreaty<DeckDetail>(() =>
      decksClient.api.v1.decks({ id }).get({ fetch: requestFetchInit() }),
    );
  },

  /**
   * Fire-and-forget view ping. Token-less on purpose: signed-out readers are
   * most of a public deck's audience. A failure costs a count, nothing else.
   */
  async countView(id: string): Promise<void> {
    try {
      await decksClient.api.v1.decks({ id }).views.post(undefined, {
        fetch: requestFetchInit(),
      });
    } catch {
      /* not load-bearing */
    }
  },

  /** Comments, flat and newest first; anonymous readers use this path. */
  async listComments(id: string): Promise<DeckCommentsPage | null> {
    return getJsonFromTreaty<DeckCommentsPage>(() =>
      decksClient.api.v1.decks({ id }).comments.get({ fetch: requestFetchInit() }),
    );
  },

  /** Coalesced edit bursts, newest first. `limit` caps how many (1–50). */
  async listRevisions(id: string, limit?: number): Promise<DeckRevisionsPage | null> {
    return getJsonFromTreaty<DeckRevisionsPage>(() =>
      decksClient.api.v1
        .decks({ id })
        .revisions.get({ query: limit != null ? { limit } : {}, fetch: requestFetchInit() }),
    );
  },

  /** Moxfield-style plain text, round-trippable through import. */
  async exportDeck(id: string): Promise<DeckExport | null> {
    return getJsonFromTreaty<DeckExport>(() =>
      decksClient.api.v1.decks({ id }).export.get({ fetch: requestFetchInit() }),
    );
  },
};

/**
 * TanStack Query keys. `mine` is listed here even though the request itself is
 * a server action, so a mutation can invalidate the signed-in user's list from
 * a client component without restating the key.
 */
export const deckQueryKeys = {
  all: ["decks"] as const,
  mine: () => ["decks", "mine"] as const,
  favorites: () => ["decks", "favorites"] as const,
  folders: (deckId?: string) => ["decks", "folders", deckId ?? null] as const,
  folder: (folderId: string) => ["decks", "folder", folderId] as const,
  comments: (id: string) => ["decks", "comments", id] as const,
  byHandle: (handle: string) => ["decks", "handle", handle] as const,
  detail: (id: string) => ["decks", "detail", id] as const,
  revisions: (id: string, limit?: number) =>
    ["decks", "revisions", id, limit ?? null] as const,
  export: (id: string) => ["decks", "export", id] as const,
};
