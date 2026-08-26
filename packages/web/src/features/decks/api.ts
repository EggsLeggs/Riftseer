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

  /** Coalesced edit bursts, newest first. */
  async listRevisions(id: string): Promise<DeckRevisionsPage | null> {
    return getJsonFromTreaty<DeckRevisionsPage>(() =>
      decksClient.api.v1
        .decks({ id })
        .revisions.get({ fetch: requestFetchInit() }),
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
  byHandle: (handle: string) => ["decks", "handle", handle] as const,
  detail: (id: string) => ["decks", "detail", id] as const,
  revisions: (id: string) => ["decks", "revisions", id] as const,
  export: (id: string) => ["decks", "export", id] as const,
};
