import type { DeckEntry, DeckViolation } from "@riftseer/types/deck";
import { validateDeck } from "@riftseer/types/deck-validate";
import { getRedisClient } from "@riftseer/core/server";
import type {
  DeckCommentRow,
  DeckCardBase,
  DeckCardRow,
  DeckDataRepository,
  DeckRole,
  DeckRow,
  FormatRow,
  ProfileStub,
} from "../../repos/decks.repo";
import { roleFor } from "../../authz/deck-access";
import type { createAuthPlugin } from "../../plugins/auth";
import type { createOptionalAuthPlugin } from "../../plugins/optional-auth";

// ─── Deck route helpers ───────────────────────────────────────────────────────
//
// Limits, derivations and the loaders the route groups share. The access
// rules themselves are `../../authz/deck-access.ts`.

export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 500;
export const REVISION_LIMIT = 50;

export const FOLDER_NAME_MAX = 80;

export const COMMENT_BODY_MAX = 2000;
/** Matches the migration's CHECK; the eighth reply flattens into the seventh. */
export const COMMENT_DEPTH_MAX = 7;
/** One read; cursor pagination arrives when a deck ever hits this. */
export const COMMENT_LIST_LIMIT = 500;

/** Manual tags per card. Annotation, not taxonomy — a hard cap keeps it that. */
export const CARD_TAGS_MAX = 20;
export const CARD_TAG_LENGTH_MAX = 40;
/**
 * The most rows one `deck_apply_card_changes` call may carry.
 *
 * `PUT /decks/:id/cards` states it as `maxItems` on the request schema; import
 * builds its batch from free text and has to apply the same bound itself, or a
 * 100 000-character paste becomes a single transaction of several thousand rows.
 */
export const CARD_BATCH_MAX = 200;
/** One view per viewer per deck per six hours. */
const VIEW_DEDUP_TTL_SECONDS = 21_600;

export async function defaultViewDedup(key: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    const stored = await redis.set(key, "1", { nx: true, ex: VIEW_DEDUP_TTL_SECONDS });
    return stored === "OK";
  } catch {
    // A Redis hiccup drops a view rather than double-counting it.
    return false;
  }
}

/**
 * Who is viewing, without storing anything about them: a user id when signed
 * in, otherwise a digest of address + client + UTC day that the API never
 * persists — the Redis key is the only place it exists, and it expires.
 */
export async function viewerKey(userId: string | undefined, request: Request): Promise<string> {
  if (userId) return userId;
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const agent = request.headers.get("user-agent") ?? "";
  const day = new Date().toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${ip}|${agent}|${day}`),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function unavailable(set: { status?: number | string }) {
  set.status = 503;
  return { error: "Service unavailable", code: "SERVICE_UNAVAILABLE" } as const;
}

export function toEntries(cards: DeckCardRow[]): DeckEntry[] {
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

export interface DeckToken extends DeckCardBase {
  sources: string[];
}

export interface DeckCollaboratorView {
  user_id: string;
  handle: string | null;
  username: string | null;
  role: string;
  added_via: string;
  created_at: string;
}

/** Exactly {@link DeckDetailSchema}; named so handlers keep a concrete return type. */
export interface DeckDetailPayload {
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
  favorite_count: number;
  view_count: number;
  is_favorited?: boolean;
  cards: Array<DeckCardRow & { tags: string[] }>;
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
export async function deriveTokens(
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
        .pruneTokenPrintings(
          deckId,
          stale.map((row) => row.oracle_id),
        )
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
      .pruneTokenPrintings(
        deckId,
        stale.map((row) => row.oracle_id),
      )
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

export async function validate(
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
export function rpcFailure(reason: string | undefined): {
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

export function deckShape(
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
    view_count: deck.view_count,
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
export async function ownerProfile(
  repository: DeckDataRepository,
  userId: string,
): Promise<ProfileStub | null> {
  const [profile] = await repository.getProfiles([userId]);
  return profile ?? null;
}
/**
 * What every deck route group shares: the repository, the two auth plugins,
 * the view dedup and the loaders that turn rows into wire shapes. Built once
 * by `decksRoutes()` in `index.ts` and handed to each group.
 */
export function createDeckRouteContext(options: {
  repository: DeckDataRepository | null;
  viewDedup: (key: string) => Promise<boolean>;
  authPlugin: ReturnType<typeof createAuthPlugin>;
  optionalAuthPlugin: ReturnType<typeof createOptionalAuthPlugin>;
}) {
  const { repository, viewDedup, authPlugin, optionalAuthPlugin } = options;

  /**
   * Tags joined by oracle onto every row of that card. A tag whose oracle has
   * left the deck simply matches nothing.
   */
  function withTags<T extends { oracle_id: string }>(
    cards: T[],
    tagRows: Array<{ oracle_id: string; tag: string }>,
  ): Array<T & { tags: string[] }> {
    const byOracle = new Map<string, string[]>();
    for (const row of tagRows) {
      const list = byOracle.get(row.oracle_id);
      if (list) list.push(row.tag);
      else byOracle.set(row.oracle_id, [row.tag]);
    }
    return cards.map((card) => ({ ...card, tags: byOracle.get(card.oracle_id) ?? [] }));
  }

  /** Summary rows for a listing, with formats, owners and favorites batched. */
  async function summarize(
    decks: DeckRow[],
    roles: Map<string, DeckRole | null>,
    userId: string | undefined,
  ) {
    const repo = repository!;
    const deckIds = decks.map((deck) => deck.id);
    const formatIds = [...new Set(decks.map((deck) => deck.format_id))];
    const [formatEntries, profiles, favoriteCounts, favorited] = await Promise.all([
      Promise.all(formatIds.map(async (id) => [id, await repo.getFormat(id)] as const)),
      repo.getProfiles([...new Set(decks.map((deck) => deck.owner_id))]),
      repo.getFavoriteCounts(deckIds),
      userId ? repo.getFavoritesFor(userId, deckIds) : null,
    ]);
    const formats = new Map<string, FormatRow | null>(formatEntries);
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    return decks.map((deck) => ({
      id: deck.id,
      name: deck.name,
      description: deck.description,
      visibility: deck.visibility,
      format: formats.get(deck.format_id) ?? null,
      owner: byId.get(deck.owner_id) ?? null,
      role: roles.get(deck.id) ?? null,
      view_count: deck.view_count,
      created_at: deck.created_at,
      updated_at: deck.updated_at,
      favorite_count: favoriteCounts.get(deck.id) ?? 0,
      ...(favorited ? { is_favorited: favorited.has(deck.id) } : {}),
    }));
  }

  /** A stored comment as the wire shape, with the caller's delete and like rights. */
  function commentView(
    row: DeckCommentRow,
    authors: Map<string, { id: string; handle: string; username: string }>,
    userId: string | undefined,
    isDeckOwner: boolean,
    likes?: { count: number; liked?: boolean },
  ) {
    const deleted = row.deleted_at !== null;
    return {
      id: row.id,
      parent_id: row.parent_id,
      depth: row.depth,
      body: deleted ? null : row.body,
      deleted,
      created_at: row.created_at,
      author: row.author_id ? (authors.get(row.author_id) ?? null) : null,
      like_count: likes?.count ?? 0,
      ...(userId
        ? {
            can_delete: !deleted && (isDeckOwner || row.author_id === userId),
            is_liked: likes?.liked ?? false,
          }
        : {}),
    };
  }

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
    userId?: string,
  ): Promise<DeckDetailPayload> {
    const repo = repository!;
    const [cards, tagRows, format, owners, favoriteCounts, favorited] = await Promise.all([
      repo.getDeckCards(deck.id),
      repo.getDeckCardTags(deck.id),
      repo.getFormat(deck.format_id),
      repo.getProfiles([deck.owner_id]),
      repo.getFavoriteCounts([deck.id]),
      userId ? repo.getFavoritesFor(userId, [deck.id]) : null,
    ]);
    const [tokens, violations] = await Promise.all([
      deriveTokens(repo, deck.id, cards),
      validate(repo, deck, cards),
    ]);

    const payload: DeckDetailPayload = {
      ...deckShape(deck, format, owners[0] ?? null, role),
      favorite_count: favoriteCounts.get(deck.id) ?? 0,
      ...(favorited ? { is_favorited: favorited.has(deck.id) } : {}),
      cards: withTags(cards, tagRows),
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
    const [cards, tagRows] = await Promise.all([
      repo.getDeckCards(deck.id),
      repo.getDeckCardTags(deck.id),
    ]);
    const [tokens, violations] = await Promise.all([
      deriveTokens(repo, deck.id, cards),
      validate(repo, deck, cards),
    ]);
    return {
      revision_id: revisionId,
      cards: withTags(cards, tagRows),
      tokens,
      violations,
    };
  }

  return {
    repository,
    viewDedup,
    authPlugin,
    optionalAuthPlugin,
    withTags,
    summarize,
    commentView,
    load,
    detail,
    cardsView,
  };
}

export type DeckRouteContext = ReturnType<typeof createDeckRouteContext>;
