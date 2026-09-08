import { Elysia } from "elysia";
import { authAdminClient } from "../../lib/supabase";
import {
  createDeckDataRepository,
  DeckRepositoryError,
  type DeckDataRepository,
} from "../../repos/decks.repo";
import { authPlugin as defaultAuthPlugin, type createAuthPlugin } from "../../plugins/auth";
import {
  optionalAuthPlugin as defaultOptionalAuthPlugin,
  type createOptionalAuthPlugin,
} from "../../plugins/optional-auth";
import { defaultViewDedup, createDeckRouteContext } from "./shared";
import { cardTagWrites, cardWrites } from "./cards";
import { collaboratorWrites } from "./collaborators";
import { commentReads, commentWrites } from "./comments";
import { deckReads, deckWrites } from "./crud";
import { exportReads, importWrites } from "./export";
import { favoriteWrites } from "./favorites";
import { folderRoutes } from "./folders";
import { revisionReads } from "./revisions";

// ─── Deck routes ──────────────────────────────────────────────────────────────
//
// The rules that decide who reads and who writes a deck are
// `../../authz/deck-access.ts`; the handlers in this directory apply them and
// nothing else. Route groups are mounted in the order below because the
// OpenAPI spec lists paths in registration order.

export interface DeckRoutesOptions {
  repository?: DeckDataRepository | null;
  authPlugin?: ReturnType<typeof createAuthPlugin>;
  optionalAuthPlugin?: ReturnType<typeof createOptionalAuthPlugin>;
  /** Base for hosted card image URLs; lazy because bindings arrive per-request. */
  imageBaseUrl?: () => string;
  /**
   * Answers "is this a fresh view?" for a dedup key. Injected so route tests
   * need no Upstash; the default is Redis `SET NX` with a six-hour TTL. With
   * no Redis configured views are not counted at all — the six-hour promise
   * in the privacy policy holds either way.
   */
  viewDedup?: (key: string) => Promise<boolean>;
}

export function decksRoutes(options: DeckRoutesOptions = {}) {
  const repository =
    options.repository ??
    (authAdminClient
      ? createDeckDataRepository(authAdminClient, { imageBaseUrl: options.imageBaseUrl })
      : null);
  const ctx = createDeckRouteContext({
    repository,
    viewDedup: options.viewDedup ?? defaultViewDedup,
    authPlugin: options.authPlugin ?? defaultAuthPlugin,
    optionalAuthPlugin: options.optionalAuthPlugin ?? defaultOptionalAuthPlugin,
  });

  return (
    new Elysia()
      .onError(({ code, error, status }) => {
        if (error instanceof DeckRepositoryError) {
          console.error(
            JSON.stringify({
              message: "deck repository error",
              error: error.message,
              databaseCode: error.databaseCode,
            }),
          );
          return status(500, { error: "Deck request failed", code: "DECK_FAILED" });
        }
        if (code === "VALIDATION" || code === "PARSE") {
          return status(400, { error: "Invalid deck request", code: "INVALID_REQUEST" });
        }
      })

      // ── Reads: who is asking changes the answer, but anonymous is allowed ──
      .use(deckReads(ctx))
      .use(commentReads(ctx))
      .use(exportReads(ctx))
      .use(revisionReads(ctx))

      // ── Writes: a real user is required for every one of them ─────────────
      .use(deckWrites(ctx))
      .use(cardWrites(ctx))
      .use(commentWrites(ctx))
      .use(favoriteWrites(ctx))
      .use(cardTagWrites(ctx))
      .use(collaboratorWrites(ctx))
      .use(folderRoutes(ctx))
      .use(importWrites(ctx))
  );
}
