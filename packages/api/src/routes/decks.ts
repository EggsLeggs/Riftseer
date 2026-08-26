import { Elysia, t } from "elysia";
import { normalizeCardName } from "@riftseer/types/parser";
import {
  DECK_ZONES,
  zoneForCard,
  type DeckEntry,
  type DeckViolation,
  type DeckZone,
} from "@riftseer/types/deck";
import { validateDeck } from "@riftseer/types/deck-validate";
import {
  formatDeckText,
  parseDeckText,
  type DeckTextCard,
} from "@riftseer/types/deck-text";
import { authAdminClient } from "../lib/supabase";
import {
  createDeckDataRepository,
  DeckRepositoryError,
  type CollaboratorRole,
  type DeckCardBase,
  type DeckCardChange,
  type DeckCardRow,
  type DeckDataRepository,
  type DeckRole,
  type DeckRow,
  type DeckVisibility,
  type FormatRow,
  type ProfileStub,
} from "../lib/deck-data";
import { authPlugin as defaultAuthPlugin, type createAuthPlugin } from "../plugins/auth";
import {
  optionalAuthPlugin as defaultOptionalAuthPlugin,
  type createOptionalAuthPlugin,
} from "../plugins/optional-auth";
import { ErrorSchema } from "../schemas";

// ─── Deck routes ──────────────────────────────────────────────────────────────
//
// The authorisation boundary. The Worker holds a service-role key and bypasses
// RLS entirely, so the rules below are the ones that actually decide who reads
// and who writes:
//
//   owner   — everything, and the only role that may delete the deck, manage
//             the collaborator roster, or change `visibility`
//   editor  — card mutations and metadata patches, but not `visibility`:
//             being invited to help build is not consent to be published
//   viewer  — read only
//
// Visibility is orthogonal to role. `public` is readable by anyone and listed;
// `unlisted` is readable by anyone holding the id but never appears in another
// user's list — which is why the migration's policies grant no read on it and
// this file does; `private` is owner and collaborators only.

export interface DeckRoutesOptions {
  repository?: DeckDataRepository | null;
  authPlugin?: ReturnType<typeof createAuthPlugin>;
  optionalAuthPlugin?: ReturnType<typeof createOptionalAuthPlugin>;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const FormatSchema = t.Object({
  id: t.String(),
  code: t.String(),
  name: t.String(),
});

const ProfileStubSchema = t.Object({
  id: t.String(),
  handle: t.String(),
  username: t.String(),
});

const DeckSummarySchema = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  visibility: t.String(),
  format: t.Nullable(FormatSchema),
  owner: t.Nullable(ProfileStubSchema),
  role: t.Nullable(t.String()),
  created_at: t.String(),
  updated_at: t.String(),
});

const CardBaseFields = {
  printing_id: t.String(),
  oracle_id: t.String(),
  name: t.String(),
  card_type: t.Nullable(t.String()),
  supertype: t.Nullable(t.String()),
  is_token: t.Boolean(),
  domains: t.Array(t.String()),
  energy: t.Nullable(t.Number()),
  might: t.Nullable(t.Number()),
  power: t.Nullable(t.Number()),
  set_code: t.Nullable(t.String()),
  collector_number: t.Nullable(t.String()),
  rarity: t.Nullable(t.String()),
  public_slug: t.Nullable(t.String()),
  has_hosted_image: t.Boolean(),
};

const DeckCardSchema = t.Object({
  ...CardBaseFields,
  zone: t.String(),
  quantity: t.Number(),
  is_champion: t.Boolean(),
});

const DeckTokenSchema = t.Object({
  ...CardBaseFields,
  /** Deck oracles whose `makes_token` edges put this token here. */
  sources: t.Array(t.String()),
});

const ViolationSchema = t.Object({
  code: t.String(),
  severity: t.String(),
  zone: t.Optional(t.String()),
  oracle_id: t.Optional(t.String()),
  printing_id: t.Optional(t.String()),
  scope: t.Optional(t.String()),
  status: t.Optional(t.String()),
  count: t.Optional(t.Number()),
  limit: t.Optional(t.Number()),
  message: t.String(),
});

const CollaboratorSchema = t.Object({
  user_id: t.String(),
  handle: t.Nullable(t.String()),
  username: t.Nullable(t.String()),
  role: t.String(),
  added_via: t.String(),
  created_at: t.String(),
});

const DeckDetailSchema = t.Object({
  id: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  primer: t.Nullable(t.String()),
  visibility: t.String(),
  format: t.Nullable(FormatSchema),
  owner: t.Nullable(ProfileStubSchema),
  role: t.Nullable(t.String()),
  created_at: t.String(),
  updated_at: t.String(),
  cards: t.Array(DeckCardSchema),
  tokens: t.Array(DeckTokenSchema),
  violations: t.Array(ViolationSchema),
  collaborators: t.Optional(t.Array(CollaboratorSchema)),
  invite_code: t.Optional(t.Nullable(t.String())),
  invite_role: t.Optional(t.Nullable(t.String())),
});

const CardsResponseSchema = t.Object({
  revision_id: t.Nullable(t.String()),
  cards: t.Array(DeckCardSchema),
  tokens: t.Array(DeckTokenSchema),
  violations: t.Array(ViolationSchema),
});

const RevisionSchema = t.Object({
  id: t.String(),
  ordinal: t.Number(),
  author: t.Nullable(ProfileStubSchema),
  format_id: t.String(),
  created_at: t.String(),
  changes: t.Array(
    t.Object({
      zone: t.String(),
      oracle_id: t.String(),
      printing_id: t.String(),
      name: t.Nullable(t.String()),
      qty_before: t.Number(),
      qty_after: t.Number(),
    }),
  ),
});

const VisibilitySchema = t.Union([
  t.Literal("private"),
  t.Literal("unlisted"),
  t.Literal("public"),
]);

const RoleSchema = t.Union([t.Literal("editor"), t.Literal("viewer")]);

const ZoneSchema = t.Union(DECK_ZONES.map((zone) => t.Literal(zone)) as never);

const CardChangeSchema = t.Object({
  zone: ZoneSchema,
  printing_id: t.String(),
  oracle_id: t.Optional(t.Nullable(t.String())),
  quantity: t.Number({ minimum: 0, maximum: 999 }),
  is_champion: t.Optional(t.Boolean()),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NAME_MAX = 120;
const DESCRIPTION_MAX = 500;
const REVISION_LIMIT = 50;
/**
 * The most rows one `deck_apply_card_changes` call may carry.
 *
 * `PUT /decks/:id/cards` states it as `maxItems` on the request schema; import
 * builds its batch from free text and has to apply the same bound itself, or a
 * 100 000-character paste becomes a single transaction of several thousand rows.
 */
const CARD_BATCH_MAX = 200;

/** Unambiguous alphabet — no 0/O or 1/I, because invite codes get read aloud. */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateInviteCode(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

function unavailable(set: { status?: number | string }) {
  set.status = 503;
  return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" } as const;
}

/** The one place a role is decided. `null` means "no relationship to this deck". */
async function roleFor(
  repository: DeckDataRepository,
  deck: DeckRow,
  userId: string | undefined,
): Promise<DeckRole | null> {
  if (!userId) return null;
  if (deck.owner_id === userId) return "owner";
  return repository.getCollaboratorRole(deck.id, userId);
}

function canRead(deck: DeckRow, role: DeckRole | null): boolean {
  // `unlisted` is readable by id — holding the link is the credential.
  return deck.visibility !== "private" || role !== null;
}

function canWrite(role: DeckRole | null): boolean {
  return role === "owner" || role === "editor";
}

function toEntries(cards: DeckCardRow[]): DeckEntry[] {
  return cards.map((card) => ({
    zone: card.zone,
    oracle_id: card.oracle_id,
    printing_id: card.printing_id,
    quantity: card.quantity,
    is_champion: card.is_champion,
    name: card.name,
    card_type: card.card_type,
    supertype: card.supertype,
    is_token: card.is_token,
    domains: card.domains,
  }));
}

interface DeckToken extends DeckCardBase {
  sources: string[];
}

interface DeckCollaboratorView {
  user_id: string;
  handle: string | null;
  username: string | null;
  role: string;
  added_via: string;
  created_at: string;
}

/** Exactly {@link DeckDetailSchema}; named so handlers keep a concrete return type. */
interface DeckDetailPayload {
  id: string;
  name: string;
  description: string | null;
  primer: string | null;
  visibility: string;
  format: FormatRow | null;
  owner: { id: string; handle: string; username: string } | null;
  role: string | null;
  created_at: string;
  updated_at: string;
  cards: DeckCardRow[];
  tokens: DeckToken[];
  violations: DeckViolation[];
  collaborators?: DeckCollaboratorView[];
  invite_code?: string | null;
  invite_role?: string | null;
}

/**
 * Tokens the deck makes, derived from `makes_token` edges — never stored
 * membership, so a user can neither add nor remove one.
 *
 * `deck_token_printings` rows whose oracle has dropped out of the derived set
 * are ignored and pruned in passing. That happens legitimately whenever ingest
 * adds or removes an edge, so it is never an error and never fails the read.
 */
async function deriveTokens(
  repository: DeckDataRepository,
  deckId: string,
  cards: DeckCardRow[],
): Promise<DeckToken[]> {
  const oracleIds = [...new Set(cards.map((card) => card.oracle_id))].filter(Boolean);
  const edges = await repository.getTokenEdges(oracleIds);
  if (edges.length === 0) {
    const stale = await repository.getTokenPrintingChoices(deckId);
    if (stale.length > 0) {
      await repository
        .pruneTokenPrintings(deckId, stale.map((row) => row.oracle_id))
        .catch(() => undefined);
    }
    return [];
  }

  const sources = new Map<string, string[]>();
  for (const edge of edges) {
    const list = sources.get(edge.to_oracle_id) ?? [];
    if (!list.includes(edge.from_oracle_id)) list.push(edge.from_oracle_id);
    sources.set(edge.to_oracle_id, list);
  }
  const tokenOracleIds = [...sources.keys()];

  const choices = await repository.getTokenPrintingChoices(deckId);
  const stale = choices.filter((choice) => !sources.has(choice.oracle_id));
  if (stale.length > 0) {
    await repository
      .pruneTokenPrintings(deckId, stale.map((row) => row.oracle_id))
      .catch(() => undefined);
  }

  const chosen = new Map<string, string>();
  for (const choice of choices) {
    if (sources.has(choice.oracle_id)) chosen.set(choice.oracle_id, choice.printing_id);
  }
  const needsDefault = tokenOracleIds.filter((id) => !chosen.has(id));
  for (const row of await repository.getPreferredPrintings(needsDefault)) {
    chosen.set(row.oracle_id, row.printing_id);
  }

  const cardsById = await repository.getResolvedPrintings([...chosen.values()]);
  const byPrinting = new Map(cardsById.map((card) => [card.printing_id, card]));
  return tokenOracleIds.flatMap((oracleId) => {
    const printingId = chosen.get(oracleId);
    const card = printingId ? byPrinting.get(printingId) : undefined;
    // An oracle with no printing at all cannot be rendered; it is not an error.
    return card ? [{ ...card, sources: sources.get(oracleId) ?? [] }] : [];
  });
}

async function validate(
  repository: DeckDataRepository,
  deck: DeckRow,
  cards: DeckCardRow[],
): Promise<DeckViolation[]> {
  const rules = await repository.getFormatRules(deck.format_id);
  const legalities = await repository.getLegalityMap(
    deck.format_id,
    [...new Set(cards.map((card) => card.oracle_id))].filter(Boolean),
    [...new Set(cards.map((card) => card.printing_id))].filter(Boolean),
  );
  return validateDeck({ entries: toEntries(cards) }, rules, legalities);
}

/** RPC failure reasons, mapped to the status the client should render. */
function rpcFailure(reason: string | undefined): {
  status: 400 | 404;
  body: { error: string; code: string };
} {
  if (reason === "deck_not_found") {
    return { status: 404, body: { error: "Deck not found", code: "NOT_FOUND" } };
  }
  const messages: Record<string, string> = {
    invalid_changes: "Card changes must be an array.",
    invalid_zone: "One of the changes names a zone that does not exist.",
    missing_printing_id: "Every change must name a printing.",
    missing_oracle_id: "A new card must name its oracle.",
  };
  return {
    status: 400,
    body: {
      error: messages[reason ?? ""] ?? "Card changes were rejected.",
      code: (reason ?? "invalid_changes").toUpperCase(),
    },
  };
}

function deckShape(
  deck: DeckRow,
  format: FormatRow | null,
  owner: { id: string; handle: string; username: string } | null,
  role: DeckRole | null,
) {
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    primer: deck.primer,
    visibility: deck.visibility,
    format,
    owner: owner ?? null,
    role,
    created_at: deck.created_at,
    updated_at: deck.updated_at,
  };
}

/**
 * The creator's own profile, read rather than assumed.
 *
 * A `201` describes the deck it just made, and clients build the profile link
 * from `owner.handle` — a stand-in with an empty handle renders a broken link
 * and a blank name until the deck is fetched again.
 */
async function ownerProfile(
  repository: DeckDataRepository,
  userId: string,
): Promise<ProfileStub | null> {
  const [profile] = await repository.getProfiles([userId]);
  return profile ?? null;
}

function exportCards(cards: DeckCardRow[]): DeckTextCard[] {
  return cards.map((card) => ({
    zone: card.zone,
    quantity: card.quantity,
    name: card.name,
    ...(card.set_code ? { set_code: card.set_code } : {}),
    ...(card.set_code && card.collector_number
      ? { collector_number: card.collector_number }
      : {}),
    ...(card.is_champion ? { is_champion: true } : {}),
  }));
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function decksRoutes(options: DeckRoutesOptions = {}) {
  const repository =
    options.repository ??
    (authAdminClient ? createDeckDataRepository(authAdminClient) : null);
  const routeAuthPlugin = options.authPlugin ?? defaultAuthPlugin;
  const routeOptionalAuthPlugin =
    options.optionalAuthPlugin ?? defaultOptionalAuthPlugin;

  /** Load a deck and the caller's role, or the failure to return instead. */
  async function load(
    deckId: string,
    userId: string | undefined,
  ): Promise<
    | { deck: DeckRow; role: DeckRole | null }
    | { status: 404; body: { error: string; code: string } }
  > {
    const deck = await repository!.getDeck(deckId);
    if (!deck) {
      return { status: 404, body: { error: "Deck not found", code: "NOT_FOUND" } };
    }
    return { deck, role: await roleFor(repository!, deck, userId) };
  }

  async function detail(
    deck: DeckRow,
    role: DeckRole | null,
  ): Promise<DeckDetailPayload> {
    const repo = repository!;
    const [cards, format, owners] = await Promise.all([
      repo.getDeckCards(deck.id),
      repo.getFormat(deck.format_id),
      repo.getProfiles([deck.owner_id]),
    ]);
    const [tokens, violations] = await Promise.all([
      deriveTokens(repo, deck.id, cards),
      validate(repo, deck, cards),
    ]);

    const payload: DeckDetailPayload = {
      ...deckShape(deck, format, owners[0] ?? null, role),
      cards,
      tokens,
      violations,
    };

    if (role === "owner") {
      const collaborators = await repo.getCollaborators(deck.id);
      const profiles = await repo.getProfiles(collaborators.map((row) => row.user_id));
      const byId = new Map(profiles.map((profile) => [profile.id, profile]));
      payload.collaborators = collaborators.map((row) => ({
        user_id: row.user_id,
        handle: byId.get(row.user_id)?.handle ?? null,
        username: byId.get(row.user_id)?.username ?? null,
        role: row.role,
        added_via: row.added_via,
        created_at: row.created_at,
      }));
      payload.invite_code = deck.invite_code;
      payload.invite_role = deck.invite_role;
    }

    return payload;
  }

  /** Cards, tokens and violations after a mutation — what the builder re-renders. */
  async function cardsView(deck: DeckRow, revisionId: string | null) {
    const repo = repository!;
    const cards = await repo.getDeckCards(deck.id);
    const [tokens, violations] = await Promise.all([
      deriveTokens(repo, deck.id, cards),
      validate(repo, deck, cards),
    ]);
    return { revision_id: revisionId, cards, tokens, violations };
  }

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
      .use(
        new Elysia()
          .use(routeOptionalAuthPlugin)

          // ── GET /decks ────────────────────────────────────────────────────
          .get(
            "/decks",
            async ({ user, query, set }) => {
              if (!repository) return unavailable(set);

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
                user && ownerId === user.id
                  ? await repository.listDecksSharedWith(user.id)
                  : [];

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
                    async (deck) =>
                      [deck.id, await roleFor(repository, deck, user?.id)] as const,
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

              const formatIds = [...new Set(visible.map((deck) => deck.format_id))];
              const [formatEntries, profiles] = await Promise.all([
                Promise.all(
                  formatIds.map(
                    async (id) => [id, await repository.getFormat(id)] as const,
                  ),
                ),
                repository.getProfiles([
                  ...new Set(visible.map((deck) => deck.owner_id)),
                ]),
              ]);
              const formats = new Map<string, FormatRow | null>(formatEntries);
              const byId = new Map(profiles.map((profile) => [profile.id, profile]));

              return {
                items: visible.map((deck) => ({
                  id: deck.id,
                  name: deck.name,
                  description: deck.description,
                  visibility: deck.visibility,
                  format: formats.get(deck.format_id) ?? null,
                  owner: byId.get(deck.owner_id) ?? null,
                  role: roles.get(deck.id) ?? null,
                  created_at: deck.created_at,
                  updated_at: deck.updated_at,
                })),
                total: visible.length,
              };
            },
            {
              query: t.Object({ handle: t.Optional(t.String()) }),
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
              return await detail(loaded.deck, loaded.role);
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

          // ── GET /decks/:id/export ─────────────────────────────────────────
          .get(
            "/decks/:id/export",
            async ({ params, user, set }) => {
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
              const cards = await repository.getDeckCards(loaded.deck.id);
              return { name: loaded.deck.name, text: formatDeckText(exportCards(cards)) };
            },
            {
              params: t.Object({ id: t.String() }),
              response: {
                200: t.Object({ name: t.String(), text: t.String() }),
                404: ErrorSchema,
                503: ErrorSchema,
              },
              detail: {
                tags: ["Decks"],
                summary: "Export a deck as text",
                description: "Moxfield-style plain text, round-trippable through import.",
              },
            },
          )

          // ── GET /decks/:id/revisions ──────────────────────────────────────
          .get(
            "/decks/:id/revisions",
            async ({ params, user, set }) => {
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
              const revisions = await repository.listRevisions(
                loaded.deck.id,
                REVISION_LIMIT,
              );
              const printingIds = revisions.flatMap((revision) =>
                revision.changes.map((change) => change.printing_id),
              );
              const [cards, authors] = await Promise.all([
                repository.getResolvedPrintings(printingIds),
                repository.getProfiles(
                  revisions
                    .map((revision) => revision.author_id)
                    .filter((id): id is string => typeof id === "string"),
                ),
              ]);
              const nameById = new Map(cards.map((card) => [card.printing_id, card.name]));
              const authorById = new Map(authors.map((profile) => [profile.id, profile]));

              return {
                items: revisions.map((revision) => ({
                  id: revision.id,
                  ordinal: revision.ordinal,
                  author: revision.author_id
                    ? (authorById.get(revision.author_id) ?? null)
                    : null,
                  format_id: revision.format_id,
                  created_at: revision.created_at,
                  changes: revision.changes.map((change) => ({
                    ...change,
                    name: nameById.get(change.printing_id) ?? null,
                  })),
                })),
                total: revisions.length,
              };
            },
            {
              params: t.Object({ id: t.String() }),
              response: {
                200: t.Object({ items: t.Array(RevisionSchema), total: t.Number() }),
                404: ErrorSchema,
                503: ErrorSchema,
              },
              detail: {
                tags: ["Decks"],
                summary: "Deck revision history",
                description: "Coalesced edit bursts, newest first.",
              },
            },
          ),
      )

      // ── Writes: a real user is required for every one of them ─────────────
      .use(
        new Elysia()
          .use(routeAuthPlugin)

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
              return deckShape(deck, format, await ownerProfile(repository, user.id), "owner");
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
              detail: { tags: ["Decks"], summary: "Create a deck" },
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
              return await detail(updated, loaded.role);
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
              detail: { tags: ["Decks"], summary: "Update deck metadata" },
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
              detail: { tags: ["Decks"], summary: "Delete a deck" },
            },
          )

          // ── PUT /decks/:id/cards ──────────────────────────────────────────
          .put(
            "/decks/:id/cards",
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

              // One call for the whole batch: the RPC owns revision coalescing
              // and the champion hand-off, and both need a single transaction.
              const result = await repository.callRpc("deck_apply_card_changes", {
                p_deck_id: loaded.deck.id,
                p_author: user.id,
                p_changes: body.changes,
              });
              if (!result.ok) {
                const failure = rpcFailure(result.reason);
                set.status = failure.status;
                return failure.body;
              }

              return await cardsView(
                loaded.deck,
                typeof result.revision_id === "string" ? result.revision_id : null,
              );
            },
            {
              params: t.Object({ id: t.String() }),
              body: t.Object({
                changes: t.Array(CardChangeSchema, { minItems: 1, maxItems: CARD_BATCH_MAX }),
              }),
              response: {
                200: CardsResponseSchema,
                400: ErrorSchema,
                401: ErrorSchema,
                403: ErrorSchema,
                404: ErrorSchema,
                503: ErrorSchema,
              },
              detail: {
                tags: ["Decks"],
                summary: "Apply card changes",
                description:
                  "A whole batch of zone changes in one transaction. `quantity: 0` removes a card.",
              },
            },
          )

          // ── POST /decks/:id/invite ────────────────────────────────────────
          .post(
            "/decks/:id/invite",
            async ({ params, body, user, set }) => {
              if (!repository) return unavailable(set);
              const loaded = await load(params.id, user.id);
              if ("status" in loaded) {
                set.status = loaded.status;
                return loaded.body;
              }
              if (loaded.role !== "owner") {
                set.status = canRead(loaded.deck, loaded.role) ? 403 : 404;
                return set.status === 403
                  ? { error: "Only the owner manages invites.", code: "FORBIDDEN" }
                  : { error: "Deck not found", code: "NOT_FOUND" };
              }

              // Regenerating replaces the link and nothing else: redemption
              // wrote a `deck_collaborators` row, so existing collaborators
              // keep their access and stay individually revocable.
              const code = generateInviteCode();
              const role = (body.role ?? "editor") as CollaboratorRole;
              await repository.setInvite(loaded.deck.id, code, role);
              return { invite_code: code, invite_role: role };
            },
            {
              params: t.Object({ id: t.String() }),
              body: t.Object({ role: t.Optional(RoleSchema) }),
              response: {
                200: t.Object({ invite_code: t.String(), invite_role: t.String() }),
                401: ErrorSchema,
                403: ErrorSchema,
                404: ErrorSchema,
                503: ErrorSchema,
              },
              detail: { tags: ["Decks"], summary: "Create or regenerate the invite link" },
            },
          )

          // ── DELETE /decks/:id/invite ──────────────────────────────────────
          .delete(
            "/decks/:id/invite",
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
                  ? { error: "Only the owner manages invites.", code: "FORBIDDEN" }
                  : { error: "Deck not found", code: "NOT_FOUND" };
              }
              await repository.clearInvite(loaded.deck.id);
              return { message: "Invite link disabled." };
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
              detail: { tags: ["Decks"], summary: "Disable the invite link" },
            },
          )

          // ── POST /decks/join/:code ────────────────────────────────────────
          .post(
            "/decks/join/:code",
            async ({ params, user, set }) => {
              if (!repository) return unavailable(set);
              const deck = await repository.getDeckByInviteCode(params.code);
              if (!deck || !deck.invite_role) {
                set.status = 404;
                return { error: "Invite link not found", code: "NOT_FOUND" };
              }
              if (deck.owner_id === user.id) {
                return { deck_id: deck.id, role: "owner" };
              }
              const existing = await repository.getCollaboratorRole(deck.id, user.id);
              if (!existing) {
                await repository.addCollaborator(deck.id, user.id, deck.invite_role, "link");
              }
              return { deck_id: deck.id, role: existing ?? deck.invite_role };
            },
            {
              params: t.Object({ code: t.String() }),
              response: {
                200: t.Object({ deck_id: t.String(), role: t.String() }),
                401: ErrorSchema,
                404: ErrorSchema,
                503: ErrorSchema,
              },
              detail: {
                tags: ["Decks"],
                summary: "Redeem an invite link",
                description:
                  "Inserts a collaborator row, so revoking the link later does not revoke this access.",
              },
            },
          )

          // ── POST /decks/:id/collaborators ─────────────────────────────────
          .post(
            "/decks/:id/collaborators",
            async ({ params, body, user, set }) => {
              if (!repository) return unavailable(set);
              const loaded = await load(params.id, user.id);
              if ("status" in loaded) {
                set.status = loaded.status;
                return loaded.body;
              }
              if (loaded.role !== "owner") {
                set.status = canRead(loaded.deck, loaded.role) ? 403 : 404;
                return set.status === 403
                  ? { error: "Only the owner manages collaborators.", code: "FORBIDDEN" }
                  : { error: "Deck not found", code: "NOT_FOUND" };
              }
              const profile = await repository.getProfileByHandle(body.handle.toLowerCase());
              if (!profile) {
                set.status = 404;
                return { error: "Profile not found", code: "NOT_FOUND" };
              }
              if (profile.id === loaded.deck.owner_id) {
                set.status = 400;
                return { error: "The owner is already on the deck.", code: "IS_OWNER" };
              }
              await repository.addCollaborator(
                loaded.deck.id,
                profile.id,
                body.role ?? "editor",
                "invite",
              );
              return {
                user_id: profile.id,
                handle: profile.handle,
                role: body.role ?? "editor",
              };
            },
            {
              params: t.Object({ id: t.String() }),
              body: t.Object({ handle: t.String(), role: t.Optional(RoleSchema) }),
              response: {
                200: t.Object({
                  user_id: t.String(),
                  handle: t.String(),
                  role: t.String(),
                }),
                400: ErrorSchema,
                401: ErrorSchema,
                403: ErrorSchema,
                404: ErrorSchema,
                503: ErrorSchema,
              },
              detail: { tags: ["Decks"], summary: "Invite a collaborator by handle" },
            },
          )

          // ── DELETE /decks/:id/collaborators ───────────────────────────────
          .delete(
            "/decks/:id/collaborators",
            async ({ params, query, user, set }) => {
              if (!repository) return unavailable(set);
              const loaded = await load(params.id, user.id);
              if ("status" in loaded) {
                set.status = loaded.status;
                return loaded.body;
              }
              if (loaded.role !== "owner") {
                set.status = canRead(loaded.deck, loaded.role) ? 403 : 404;
                return set.status === 403
                  ? { error: "Only the owner manages collaborators.", code: "FORBIDDEN" }
                  : { error: "Deck not found", code: "NOT_FOUND" };
              }
              const profile = await repository.getProfileByHandle(query.handle.toLowerCase());
              if (!profile) {
                set.status = 404;
                return { error: "Profile not found", code: "NOT_FOUND" };
              }
              await repository.removeCollaborator(loaded.deck.id, profile.id);
              return { message: "Collaborator removed." };
            },
            {
              params: t.Object({ id: t.String() }),
              query: t.Object({ handle: t.String() }),
              response: {
                200: t.Object({ message: t.String() }),
                401: ErrorSchema,
                403: ErrorSchema,
                404: ErrorSchema,
                503: ErrorSchema,
              },
              detail: { tags: ["Decks"], summary: "Remove a collaborator" },
            },
          )

          // ── POST /decks/import ────────────────────────────────────────────
          .post(
            "/decks/import",
            async ({ body, user, set }) => {
              if (!repository) return unavailable(set);
              const parsed = parseDeckText(body.text);

              const format = await repository.getFormatByCode(body.format ?? "standard");
              if (!format) {
                set.status = 400;
                return { error: "Unknown format.", code: "UNKNOWN_FORMAT" };
              }

              // Resolving a name (and optional set/collector) to an oracle and
              // printing is the API's job — only it can see the catalogue.
              const candidates = await repository.findPrintingsByNames(
                parsed.cards.map((card) => normalizeCardName(card.name)),
              );
              const byName = new Map<string, DeckCardBase[]>();
              for (const card of candidates) {
                const list = byName.get(card.name_normalized) ?? [];
                list.push(card);
                byName.set(card.name_normalized, list);
              }
              const preferred = new Map(
                (
                  await repository.getPreferredPrintings([
                    ...new Set(candidates.map((card) => card.oracle_id)),
                  ])
                ).map((row) => [row.oracle_id, row.printing_id]),
              );

              const unresolved = [...parsed.errors];
              const changes = new Map<string, DeckCardChange>();

              for (const line of parsed.cards) {
                const pool = byName.get(normalizeCardName(line.name));
                if (!pool || pool.length === 0) {
                  unresolved.push({
                    line: line.line,
                    text: line.name,
                    message: "No card with that name.",
                  });
                  continue;
                }
                const picked = pickPrinting(pool, line.set_code, line.collector_number, preferred);
                // A bare list has no zone headers, so honour the parsed zone
                // only when the card can actually sit there.
                const eligible = zoneForCard(picked.card_type, picked.supertype, picked.is_token);
                const zone: DeckZone = eligible.includes(line.zone) ? line.zone : eligible[0]!;
                const key = `${zone}:${picked.printing_id}`;
                const existing = changes.get(key);
                if (existing) {
                  existing.quantity += line.quantity;
                  existing.is_champion = existing.is_champion || line.is_champion === true;
                  continue;
                }
                // Folding into a row already in the batch is free; a new row is
                // not, so the cap is checked here and the line is reported
                // rather than silently dropped.
                if (changes.size >= CARD_BATCH_MAX) {
                  unresolved.push({
                    line: line.line,
                    text: line.name,
                    message: `An import carries at most ${CARD_BATCH_MAX} distinct cards.`,
                  });
                  continue;
                }
                changes.set(key, {
                  zone,
                  printing_id: picked.printing_id,
                  oracle_id: picked.oracle_id,
                  quantity: line.quantity,
                  is_champion: line.is_champion === true,
                });
              }

              const deck = await repository.createDeck({
                owner_id: user.id,
                format_id: format.id,
                name: (body.name ?? "Imported deck").trim().slice(0, NAME_MAX) || "Imported deck",
                visibility: (body.visibility ?? "private") as DeckVisibility,
              });

              if (changes.size > 0) {
                const result = await repository.callRpc("deck_apply_card_changes", {
                  p_deck_id: deck.id,
                  p_author: user.id,
                  p_changes: [...changes.values()],
                });
                if (!result.ok) {
                  const failure = rpcFailure(result.reason);
                  set.status = failure.status;
                  return failure.body;
                }
              }

              set.status = 201;
              return {
                ...deckShape(deck, format, await ownerProfile(repository, user.id), "owner"),
                imported: changes.size,
                unresolved,
              };
            },
            {
              body: t.Object({
                text: t.String({ maxLength: 100_000 }),
                name: t.Optional(t.String({ maxLength: NAME_MAX })),
                format: t.Optional(t.String()),
                visibility: t.Optional(VisibilitySchema),
              }),
              response: {
                201: t.Composite([
                  t.Omit(DeckDetailSchema, ["cards", "tokens", "violations"]),
                  t.Object({
                    imported: t.Number(),
                    unresolved: t.Array(
                      t.Object({
                        line: t.Number(),
                        text: t.String(),
                        message: t.String(),
                      }),
                    ),
                  }),
                ]),
                400: ErrorSchema,
                401: ErrorSchema,
                404: ErrorSchema,
                503: ErrorSchema,
              },
              detail: {
                tags: ["Decks"],
                summary: "Import a deck from text",
                description:
                  "Moxfield-style text. Lines that cannot be resolved are reported; the rest of the list still imports.",
              },
            },
          ),
      )
  );
}

/**
 * Choose which printing a text line meant: the named one, else the set, else
 * the oracle's preferred printing, else whatever the catalogue lists first.
 */
function pickPrinting(
  pool: DeckCardBase[],
  setCode: string | undefined,
  collectorNumber: string | undefined,
  preferred: Map<string, string>,
): DeckCardBase {
  const set = setCode?.toLowerCase();
  const collector = collectorNumber?.toLowerCase();
  if (set && collector) {
    const exact = pool.find(
      (card) =>
        card.set_code?.toLowerCase() === set &&
        card.collector_number?.toLowerCase() === collector,
    );
    if (exact) return exact;
  }
  if (set) {
    const inSet = pool.find((card) => card.set_code?.toLowerCase() === set);
    if (inSet) return inSet;
  }
  const preferredCard = pool.find(
    (card) => preferred.get(card.oracle_id) === card.printing_id,
  );
  return preferredCard ?? pool[0]!;
}
