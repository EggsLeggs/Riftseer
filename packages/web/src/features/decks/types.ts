/**
 * Request/response shapes for `/api/v1/decks/*`.
 *
 * Derived from the Elysia route definitions through the type-only `App` import,
 * exactly like `features/admin/types.ts`: a change to a `t` schema in
 * `packages/api/src/routes/decks.ts` surfaces here as a compile error rather
 * than a field that silently stops arriving.
 *
 * Deck vocabulary that is not wire-shaped — zones, zone labels, legality
 * statuses, violation codes — is imported from `@riftseer/types/deck` instead,
 * because the validator and the builder must agree on it and the API only ever
 * echoes it.
 */

import type { treaty } from "@elysiajs/eden";
import type { App } from "@riftseer/api";
import type { DeckZone } from "@riftseer/types/deck";

export type { DeckZone };
export { DECK_ZONES, DECK_ZONE_LABELS } from "@riftseer/types/deck";

type V1 = ReturnType<typeof treaty<App>>["api"]["v1"];
type DeckRoutes = V1["decks"];
type DeckById = ReturnType<DeckRoutes>;

/** The request body an Eden treaty method accepts. */
type Body<F extends (...args: never) => unknown> = Parameters<F>[0];

/** The 2xx payload an Eden treaty method resolves to. */
type Ok<F extends (...args: never) => unknown> =
  Awaited<ReturnType<F>> extends infer R
    ? R extends { error: null; data: infer D }
      ? D
      : never
    : never;

/**
 * A route whose success is a 201 has no 200 for Eden to single out, so it folds
 * every declared response — including the error bodies — into `data`. Pick the
 * success member by a field only it carries.
 */
type Success<T, K extends PropertyKey> = Extract<T, Record<K, unknown>>;

// ─── Reads ────────────────────────────────────────────────────────────────────

export type DeckListPage = Ok<DeckRoutes["get"]>;

/** A deck as it appears in a list: metadata and the caller's role, no cards. */
export type DeckSummary = DeckListPage["items"][number];

/** Cards, derived tokens, violations, and — for the owner — sharing state. */
export type DeckDetail = Ok<DeckById["get"]>;

export type DeckFormat = NonNullable<DeckSummary["format"]>;

export type DeckOwner = NonNullable<DeckSummary["owner"]>;

/** One row of a deck list: a printing, its zone, quantity and champion flag. */
export type DeckCard = DeckDetail["cards"][number];

/**
 * A token the deck makes. Derived from `makes_token` edges, never stored
 * membership, so it has no quantity and cannot be added or removed — only its
 * printing can be chosen.
 */
export type DeckToken = DeckDetail["tokens"][number];

export type DeckViolation = DeckDetail["violations"][number];

export type DeckCollaborator = NonNullable<DeckDetail["collaborators"]>[number];

export type DeckRevisionsPage = Ok<DeckById["revisions"]["get"]>;

export type DeckRevision = DeckRevisionsPage["items"][number];

export type DeckRevisionChange = DeckRevision["changes"][number];

export type DeckExport = Ok<DeckById["export"]["get"]>;

// ─── Writes ───────────────────────────────────────────────────────────────────

export type DeckCreateInput = Body<DeckRoutes["post"]>;

/** A new deck: metadata only, since it has no cards yet to report. */
export type DeckCreateResult = Success<Ok<DeckRoutes["post"]>, "visibility">;

export type DeckPatch = Body<DeckById["patch"]>;

/**
 * `quantity: 0` removes the card; the whole array applies in one transaction.
 *
 * `zone` is the one field restated rather than derived. The route builds its
 * zone schema by mapping `DECK_ZONES`, which TypeBox cannot see as a tuple, so
 * the literal union does not survive the Eden round trip and arrives as
 * `never`. `DeckZone` is that same vocabulary, from the same module the route
 * imports it from, so the two cannot drift.
 */
export type DeckCardChange = Omit<
  Body<DeckById["cards"]["put"]>["changes"][number],
  "zone"
> & { zone: DeckZone };

/** What a card mutation returns: the re-rendered list, tokens and violations. */
export type DeckCardsResult = Ok<DeckById["cards"]["put"]>;

export type DeckImportInput = Body<DeckRoutes["import"]["post"]>;

export type DeckImportResult = Success<
  Ok<DeckRoutes["import"]["post"]>,
  "unresolved"
>;

/** A text line the importer could not resolve; the rest of the list still landed. */
export type DeckImportProblem = DeckImportResult["unresolved"][number];

export type DeckInviteResult = Ok<DeckById["invite"]["post"]>;

export type DeckJoinResult = Ok<ReturnType<DeckRoutes["join"]>["post"]>;

export type DeckCollaboratorResult = Ok<DeckById["collaborators"]["post"]>;

/**
 * `private` needs a relationship, `unlisted` is reachable by its id and appears
 * in nobody else's list, `public` is browsable.
 */
export type DeckVisibility = NonNullable<DeckCreateInput["visibility"]>;

/** The roles an owner can hand out. The owner's own role is not assignable. */
export type DeckCollaboratorRole = NonNullable<
  NonNullable<Body<DeckById["invite"]["post"]>>["role"]
>;

/** Every role the API reports on a deck, including the one nobody is given. */
export type DeckRole = DeckCollaboratorRole | "owner";

// ─── Results ──────────────────────────────────────────────────────────────────

/**
 * Deck writes resolve rather than throw, so a view can render the API's machine
 * `code` (e.g. `FORBIDDEN`) instead of a stack trace — and so a server action's
 * failure crosses the server/client boundary as data.
 */
export type DeckResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; status?: number };

// ─── Predicates ───────────────────────────────────────────────────────────────

/** Roles the API accepts card and metadata writes from. `null` is a stranger. */
export function canEditDeck(role: string | null | undefined): boolean {
  return role === "owner" || role === "editor";
}

/** Only the owner may delete a deck or manage its collaborator roster. */
export function ownsDeck(role: string | null | undefined): boolean {
  return role === "owner";
}
