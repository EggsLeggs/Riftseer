import { beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { normalizeCardName } from "@riftseer/types/parser";
import type { DeckZone, FormatRules, LegalityMap } from "@riftseer/types/deck";
import {
  type CollaboratorRole,
  type DeckCardBase,
  type DeckCollaboratorRow,
  type DeckDataRepository,
  type DeckPatch,
  type DeckRevision,
  type DeckRow,
  type DeckRpcResult,
  type FormatRow,
  type NewDeck,
  type ProfileStub,
} from "../../lib/deck-data.ts";
import { createAuthPlugin } from "../../plugins/auth.ts";
import { createOptionalAuthPlugin } from "../../plugins/optional-auth.ts";
import { decksRoutes } from "../../routes/decks.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const EDITOR_ID = "22222222-2222-4222-8222-222222222222";
const STRANGER_ID = "33333333-3333-4333-8333-333333333333";

const FORMAT: FormatRow = {
  id: "44444444-4444-4444-8444-444444444444",
  code: "standard",
  name: "Standard",
};

const PROFILES: ProfileStub[] = [
  { id: OWNER_ID, handle: "owner", username: "Owner" },
  { id: EDITOR_ID, handle: "editor", username: "Editor" },
  { id: STRANGER_ID, handle: "stranger", username: "Stranger" },
];

function card(
  printingId: string,
  oracleId: string,
  name: string,
  cardType: string,
  overrides: Partial<DeckCardBase> = {},
): DeckCardBase {
  return {
    printing_id: printingId,
    oracle_id: oracleId,
    name,
    name_normalized: normalizeCardName(name),
    card_type: cardType,
    supertype: null,
    is_token: false,
    domains: ["Fury"],
    energy: 1,
    might: 2,
    power: null,
    set_code: "OGN",
    collector_number: printingId.slice(-3),
    rarity: "Common",
    public_slug: `ogn/${printingId}`,
    has_hosted_image: true,
    ...overrides,
  };
}

const LEGEND = card(
  "aaaaaaaaaaaaaaaaaaaaa001",
  "55555555-5555-4555-8555-555555555001",
  "Test Legend",
  "Legend",
);
const UNIT = card(
  "aaaaaaaaaaaaaaaaaaaaa002",
  "55555555-5555-4555-8555-555555555002",
  "Test Unit",
  "Unit",
  // One catalogue entry with art, so the tests can tell a schema that carries
  // `image` from one that silently strips it (Elysia drops unknown fields).
  {
    image: {
      small: "https://img.example/unit/small.webp?v=abc",
      normal: "https://img.example/unit/normal.webp?v=abc",
    },
  },
);
const RUNE = card(
  "aaaaaaaaaaaaaaaaaaaaa003",
  "55555555-5555-4555-8555-555555555003",
  "Test Rune",
  "Rune",
);
const TOKEN = card(
  "aaaaaaaaaaaaaaaaaaaaa004",
  "55555555-5555-4555-8555-555555555004",
  "Test Token",
  "Unit",
  { is_token: true },
);

const CATALOGUE = [LEGEND, UNIT, RUNE, TOKEN];

interface StoredCard {
  zone: DeckZone;
  printing_id: string;
  oracle_id: string;
  quantity: number;
  is_champion: boolean;
}

/**
 * An in-memory deck store, including `deck_apply_card_changes`, so the mutation
 * tests exercise a real round trip rather than asserting a mock was called.
 */
class StubDeckRepository implements DeckDataRepository {
  decks = new Map<string, DeckRow>();
  cards = new Map<string, StoredCard[]>();
  collaborators = new Map<string, DeckCollaboratorRow[]>();
  tokenChoices = new Map<string, Array<{ oracle_id: string; printing_id: string }>>();
  cardTags = new Map<string, Array<{ oracle_id: string; tag: string }>>();
  revisions = new Map<string, DeckRevision[]>();
  edges: Array<{ from_oracle_id: string; to_oracle_id: string }> = [];
  legalities: LegalityMap = {};
  prunedOracleIds: string[] = [];
  private nextId = 1;

  seedDeck(overrides: Partial<DeckRow> = {}): DeckRow {
    const deck: DeckRow = {
      id: `deck-${this.nextId++}`,
      owner_id: OWNER_ID,
      format_id: FORMAT.id,
      name: "Test deck",
      description: null,
      primer: null,
      visibility: "private",
      invite_code: null,
      invite_role: null,
      view_count: 0,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
      ...overrides,
    };
    this.decks.set(deck.id, deck);
    return deck;
  }

  async callRpc(name: string, args: Record<string, unknown>): Promise<DeckRpcResult> {
    if (name === "deck_increment_views") {
      const deck = this.decks.get(String(args.p_deck_id));
      if (deck) {
        // Deliberately no `updated_at` bump — the migration's trigger guard.
        this.decks.set(deck.id, { ...deck, view_count: deck.view_count + 1 });
      }
      return { ok: true };
    }
    if (name !== "deck_apply_card_changes") return { ok: false, reason: "unknown_rpc" };
    const deckId = String(args.p_deck_id);
    if (!this.decks.has(deckId)) return { ok: false, reason: "deck_not_found" };
    const changes = args.p_changes;
    if (!Array.isArray(changes)) return { ok: false, reason: "invalid_changes" };

    const rows = this.cards.get(deckId) ?? [];
    const changeLog: DeckRevision["changes"] = [];

    for (const raw of changes as Array<Record<string, unknown>>) {
      const zone = String(raw.zone) as DeckZone;
      const printingId = String(raw.printing_id);
      const quantity = Math.max(Number(raw.quantity ?? 0), 0);
      const index = rows.findIndex(
        (row) => row.zone === zone && row.printing_id === printingId,
      );
      const before = index >= 0 ? rows[index]!.quantity : 0;
      const oracleId = String(raw.oracle_id ?? rows[index]?.oracle_id ?? "");
      if (!oracleId) return { ok: false, reason: "missing_oracle_id" };

      if (quantity === 0) {
        if (index >= 0) rows.splice(index, 1);
      } else {
        const isChampion = raw.is_champion === true;
        if (isChampion) for (const row of rows) row.is_champion = false;
        const next: StoredCard = {
          zone,
          printing_id: printingId,
          oracle_id: oracleId,
          quantity,
          is_champion: isChampion,
        };
        if (index >= 0) rows[index] = next;
        else rows.push(next);
      }
      if (before !== quantity) {
        changeLog.push({
          zone,
          oracle_id: oracleId,
          printing_id: printingId,
          qty_before: before,
          qty_after: quantity,
        });
      }
    }

    this.cards.set(deckId, rows);
    if (changeLog.length === 0) return { ok: true, revision_id: null };

    const list = this.revisions.get(deckId) ?? [];
    const revision: DeckRevision = {
      id: `rev-${list.length + 1}`,
      ordinal: list.length + 1,
      author_id: String(args.p_author),
      format_id: FORMAT.id,
      created_at: "2026-08-01T00:00:00Z",
      changes: changeLog,
    };
    list.push(revision);
    this.revisions.set(deckId, list);
    return { ok: true, revision_id: revision.id };
  }

  async getDeck(deckId: string) {
    return this.decks.get(deckId) ?? null;
  }

  async getDeckByInviteCode(code: string) {
    return [...this.decks.values()].find((deck) => deck.invite_code === code) ?? null;
  }

  async listDecksOwnedBy(ownerId: string) {
    return [...this.decks.values()].filter((deck) => deck.owner_id === ownerId);
  }

  async listDecksSharedWith(userId: string) {
    return [...this.collaborators.entries()]
      .filter(([, rows]) => rows.some((row) => row.user_id === userId))
      .flatMap(([deckId]) => {
        const deck = this.decks.get(deckId);
        return deck ? [deck] : [];
      });
  }

  async createDeck(input: NewDeck) {
    return this.seedDeck({
      owner_id: input.owner_id,
      format_id: input.format_id,
      name: input.name,
      description: input.description ?? null,
      primer: input.primer ?? null,
      visibility: input.visibility ?? "private",
    });
  }

  async updateDeck(deckId: string, patch: DeckPatch) {
    const deck = this.decks.get(deckId);
    if (!deck) return null;
    const updated = { ...deck, ...patch };
    this.decks.set(deckId, updated);
    return updated;
  }

  async deleteDeck(deckId: string) {
    this.decks.delete(deckId);
    this.cards.delete(deckId);
  }

  async getDeckCards(deckId: string) {
    const byId = new Map(CATALOGUE.map((entry) => [entry.printing_id, entry]));
    return (this.cards.get(deckId) ?? []).map((row) => ({
      ...byId.get(row.printing_id)!,
      zone: row.zone,
      quantity: row.quantity,
      is_champion: row.is_champion,
    }));
  }

  async getFormat(formatId: string) {
    return formatId === FORMAT.id ? FORMAT : null;
  }

  async getFormatByCode(code: string) {
    return code === FORMAT.code ? FORMAT : null;
  }

  async getFormatRules(): Promise<FormatRules> {
    return {
      zones: [
        { zone: "legend", min_count: 1, max_count: 1, copy_limit: null },
        { zone: "main", min_count: 40, max_count: 40, copy_limit: 3 },
        { zone: "runes", min_count: 12, max_count: 12, copy_limit: null },
      ],
    };
  }

  async getLegalityMap() {
    return this.legalities;
  }

  async getTokenEdges(oracleIds: string[]) {
    return this.edges.filter((edge) => oracleIds.includes(edge.from_oracle_id));
  }

  async getTokenPrintingChoices(deckId: string) {
    return this.tokenChoices.get(deckId) ?? [];
  }

  async pruneTokenPrintings(deckId: string, oracleIds: string[]) {
    this.prunedOracleIds.push(...oracleIds);
    this.tokenChoices.set(
      deckId,
      (this.tokenChoices.get(deckId) ?? []).filter(
        (row) => !oracleIds.includes(row.oracle_id),
      ),
    );
  }

  async getPreferredPrintings(oracleIds: string[]) {
    return CATALOGUE.filter((entry) => oracleIds.includes(entry.oracle_id)).map((entry) => ({
      oracle_id: entry.oracle_id,
      printing_id: entry.printing_id,
    }));
  }

  async getResolvedPrintings(printingIds: string[]) {
    return CATALOGUE.filter((entry) => printingIds.includes(entry.printing_id));
  }

  async findPrintingsByNames(names: string[]) {
    return CATALOGUE.filter((entry) => names.includes(entry.name_normalized));
  }

  async listRevisions(deckId: string, limit: number) {
    return [...(this.revisions.get(deckId) ?? [])].reverse().slice(0, limit);
  }

  favorites = new Map<string, Set<string>>(); // deck_id -> user ids
  comments = new Map<string, {
    id: string;
    deck_id: string;
    author_id: string | null;
    parent_id: string | null;
    depth: number;
    body: string | null;
    created_at: string;
    deleted_at: string | null;
  }>();

  async listComments(deckId: string, limit: number) {
    return [...this.comments.values()]
      .filter((row) => row.deck_id === deckId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  async getComment(commentId: string) {
    return this.comments.get(commentId) ?? null;
  }

  async insertComment(input: {
    deck_id: string;
    author_id: string;
    parent_id: string | null;
    depth: number;
    body: string;
  }) {
    const row = {
      id: `comment-${this.nextId++}`,
      ...input,
      created_at: `2026-08-01T00:00:${String(this.nextId).padStart(2, "0")}Z`,
      deleted_at: null,
    };
    this.comments.set(row.id, row);
    return row;
  }

  async softDeleteComment(commentId: string) {
    const row = this.comments.get(commentId);
    if (row) this.comments.set(commentId, { ...row, body: null, deleted_at: "2026-08-02T00:00:00Z" });
  }

  commentLikes = new Map<string, Set<string>>(); // comment_id -> user ids

  async getCommentLikeCounts(commentIds: string[]) {
    const counts = new Map<string, number>();
    for (const id of commentIds) {
      const users = this.commentLikes.get(id);
      if (users?.size) counts.set(id, users.size);
    }
    return counts;
  }

  async getCommentLikesFor(userId: string, commentIds: string[]) {
    return new Set(commentIds.filter((id) => this.commentLikes.get(id)?.has(userId)));
  }

  async addCommentLike(commentId: string, userId: string) {
    const users = this.commentLikes.get(commentId) ?? new Set<string>();
    users.add(userId);
    this.commentLikes.set(commentId, users);
  }

  async removeCommentLike(commentId: string, userId: string) {
    this.commentLikes.get(commentId)?.delete(userId);
  }
  folders = new Map<string, { id: string; owner_id: string; name: string; created_at: string; updated_at: string }>();
  folderItems = new Map<string, string[]>(); // folder_id -> deck ids, newest first

  async listFolders(ownerId: string) {
    return [...this.folders.values()].filter((f) => f.owner_id === ownerId);
  }

  async getFolder(folderId: string) {
    return this.folders.get(folderId) ?? null;
  }

  async createFolder(ownerId: string, name: string) {
    const folder = {
      id: `folder-${this.nextId++}`,
      owner_id: ownerId,
      name,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    };
    this.folders.set(folder.id, folder);
    return folder;
  }

  async renameFolder(folderId: string, name: string) {
    const folder = this.folders.get(folderId);
    if (!folder) return null;
    const renamed = { ...folder, name, updated_at: "2026-08-02T00:00:00Z" };
    this.folders.set(folderId, renamed);
    return renamed;
  }

  async deleteFolder(folderId: string) {
    this.folders.delete(folderId);
    this.folderItems.delete(folderId);
  }

  async getFolderItems(folderIds: string[]) {
    const items = new Map<string, string[]>();
    for (const id of folderIds) {
      const deckIds = this.folderItems.get(id);
      if (deckIds) items.set(id, [...deckIds]);
    }
    return items;
  }

  async addFolderItem(folderId: string, deckId: string) {
    const deckIds = this.folderItems.get(folderId) ?? [];
    if (!deckIds.includes(deckId)) this.folderItems.set(folderId, [deckId, ...deckIds]);
  }

  async removeFolderItem(folderId: string, deckId: string) {
    this.folderItems.set(
      folderId,
      (this.folderItems.get(folderId) ?? []).filter((id) => id !== deckId),
    );
  }

  async listFolderDecks(folderId: string) {
    return (this.folderItems.get(folderId) ?? []).flatMap((id) => {
      const deck = this.decks.get(id);
      return deck ? [deck] : [];
    });
  }

  async getFavoriteCounts(deckIds: string[]) {
    const counts = new Map<string, number>();
    for (const id of deckIds) {
      const users = this.favorites.get(id);
      if (users?.size) counts.set(id, users.size);
    }
    return counts;
  }

  async getFavoritesFor(userId: string, deckIds: string[]) {
    return new Set(deckIds.filter((id) => this.favorites.get(id)?.has(userId)));
  }

  async addFavorite(deckId: string, userId: string) {
    const users = this.favorites.get(deckId) ?? new Set<string>();
    users.add(userId);
    this.favorites.set(deckId, users);
  }

  async removeFavorite(deckId: string, userId: string) {
    this.favorites.get(deckId)?.delete(userId);
  }

  async listFavoriteDecks(userId: string) {
    return [...this.decks.values()].filter((deck) =>
      this.favorites.get(deck.id)?.has(userId),
    );
  }

  async getDeckCardTags(deckId: string) {
    return [...(this.cardTags.get(deckId) ?? [])].sort((a, b) =>
      a.tag.localeCompare(b.tag),
    );
  }

  async setDeckCardTags(deckId: string, oracleId: string, tags: string[]) {
    const kept = (this.cardTags.get(deckId) ?? []).filter(
      (row) => row.oracle_id !== oracleId,
    );
    this.cardTags.set(deckId, [
      ...kept,
      ...tags.map((tag) => ({ oracle_id: oracleId, tag })),
    ]);
  }

  async getCollaborators(deckId: string) {
    return this.collaborators.get(deckId) ?? [];
  }

  async getCollaboratorRole(deckId: string, userId: string) {
    return (
      (this.collaborators.get(deckId) ?? []).find((row) => row.user_id === userId)?.role ??
      null
    );
  }

  async addCollaborator(
    deckId: string,
    userId: string,
    role: CollaboratorRole,
    addedVia: "invite" | "link",
  ) {
    const rows = (this.collaborators.get(deckId) ?? []).filter(
      (row) => row.user_id !== userId,
    );
    rows.push({
      user_id: userId,
      role,
      added_via: addedVia,
      created_at: "2026-08-01T00:00:00Z",
    });
    this.collaborators.set(deckId, rows);
  }

  async removeCollaborator(deckId: string, userId: string) {
    this.collaborators.set(
      deckId,
      (this.collaborators.get(deckId) ?? []).filter((row) => row.user_id !== userId),
    );
  }

  async getProfileByHandle(handle: string) {
    return PROFILES.find((profile) => profile.handle === handle) ?? null;
  }

  async getProfiles(ids: string[]) {
    return PROFILES.filter((profile) => ids.includes(profile.id));
  }

  async setInvite(deckId: string, code: string, role: CollaboratorRole) {
    const deck = this.decks.get(deckId);
    if (deck) this.decks.set(deckId, { ...deck, invite_code: code, invite_role: role });
  }

  async clearInvite(deckId: string) {
    const deck = this.decks.get(deckId);
    if (deck) this.decks.set(deckId, { ...deck, invite_code: null, invite_role: null });
  }
}

// ─── Harness ──────────────────────────────────────────────────────────────────

const TOKENS: Record<string, string> = {
  "owner-token": OWNER_ID,
  "editor-token": EDITOR_ID,
  "stranger-token": STRANGER_ID,
};

const resolveToken = async (token: string) => {
  const id = TOKENS[token];
  return id ? { id, email: `${id}@example.com`, created_at: "2026-08-01" } : null;
};

const authPlugin = createAuthPlugin(resolveToken);
const optionalAuthPlugin = createOptionalAuthPlugin(resolveToken);

/** Response bodies are `unknown` under `tsc`; the assertions below read fields. */
function jsonOf(response: Response): Promise<any> {
  return response.json() as Promise<any>;
}

function makeApp(repo: StubDeckRepository) {
  return new Elysia({ prefix: "/api/v1" }).use(
    decksRoutes({
      repository: repo,
      authPlugin,
      optionalAuthPlugin,
      viewDedup: async (key) => {
        seenViewKeys.add(key);
        return dedupAnswers;
      },
    }),
  );
}

let repository: StubDeckRepository;
let app: ReturnType<typeof makeApp>;
/** What the injected view dedup saw, and what it should answer. */
const seenViewKeys = new Set<string>();
let dedupAnswers = true;

function headersFor(token?: string): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

function request(method: string, path: string, token?: string, body?: unknown) {
  return app.handle(
    new Request(`http://localhost/api/v1${path}`, {
      method,
      headers: headersFor(token),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}

beforeEach(() => {
  seenViewKeys.clear();
  dedupAnswers = true;
  repository = new StubDeckRepository();
  app = makeApp(repository);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("deck authorisation", () => {
  test("an anonymous request cannot mutate cards", async () => {
    const deck = repository.seedDeck({ visibility: "public" });
    const response = await request("PUT", `/decks/${deck.id}/cards`, undefined, {
      changes: [
        { zone: "main", printing_id: UNIT.printing_id, oracle_id: UNIT.oracle_id, quantity: 1 },
      ],
    });
    expect(response.status).toBe(401);
    expect(repository.cards.get(deck.id) ?? []).toHaveLength(0);
  });

  test("an editor collaborator may edit but may not delete the deck", async () => {
    const deck = repository.seedDeck();
    await repository.addCollaborator(deck.id, EDITOR_ID, "editor", "invite");

    const patch = await request("PATCH", `/decks/${deck.id}`, "editor-token", {
      name: "Renamed",
    });
    expect(patch.status).toBe(200);
    expect(repository.decks.get(deck.id)?.name).toBe("Renamed");

    const removal = await request("DELETE", `/decks/${deck.id}`, "editor-token");
    expect(removal.status).toBe(403);
    expect(repository.decks.has(deck.id)).toBe(true);
  });

  test("an editor cannot publish the owner's private deck", async () => {
    const deck = repository.seedDeck();
    await repository.addCollaborator(deck.id, EDITOR_ID, "editor", "invite");

    const denied = await request("PATCH", `/decks/${deck.id}`, "editor-token", {
      visibility: "public",
    });
    expect(denied.status).toBe(403);
    expect(repository.decks.get(deck.id)?.visibility).toBe("private");

    // The same patch from the owner goes through, so this is about the role and
    // not about the field being rejected outright.
    const allowed = await request("PATCH", `/decks/${deck.id}`, "owner-token", {
      visibility: "public",
    });
    expect(allowed.status).toBe(200);
    expect(repository.decks.get(deck.id)?.visibility).toBe("public");
  });

  test("a viewer collaborator cannot mutate cards", async () => {
    const deck = repository.seedDeck();
    await repository.addCollaborator(deck.id, EDITOR_ID, "viewer", "invite");
    const response = await request("PUT", `/decks/${deck.id}/cards`, "editor-token", {
      changes: [
        { zone: "main", printing_id: UNIT.printing_id, oracle_id: UNIT.oracle_id, quantity: 1 },
      ],
    });
    expect(response.status).toBe(403);
  });

  test("a private deck is invisible to a stranger, by id and in the list", async () => {
    const deck = repository.seedDeck({ visibility: "private" });

    const byId = await request("GET", `/decks/${deck.id}`, "stranger-token");
    expect(byId.status).toBe(404);

    const listed = await request("GET", "/decks?handle=owner", "stranger-token");
    expect(listed.status).toBe(200);
    expect((await jsonOf(listed)).items).toHaveLength(0);

    const own = await request("GET", `/decks/${deck.id}`, "owner-token");
    expect(own.status).toBe(200);
  });

  test("an unlisted deck resolves by id but never appears in another user's list", async () => {
    const deck = repository.seedDeck({ visibility: "unlisted" });

    const byId = await request("GET", `/decks/${deck.id}`, "stranger-token");
    expect(byId.status).toBe(200);
    expect((await jsonOf(byId)).id).toBe(deck.id);

    const anonymous = await request("GET", `/decks/${deck.id}`);
    expect(anonymous.status).toBe(200);

    const listed = await request("GET", "/decks?handle=owner", "stranger-token");
    expect((await jsonOf(listed)).items).toHaveLength(0);

    const mine = await request("GET", "/decks", "owner-token");
    expect((await jsonOf(mine)).items.map((item: { id: string }) => item.id)).toEqual([deck.id]);
  });

  test("only the owner sees the invite code and the collaborator roster", async () => {
    const deck = repository.seedDeck({ visibility: "public" });
    await repository.addCollaborator(deck.id, EDITOR_ID, "editor", "invite");

    const asOwner = await jsonOf(await request("GET", `/decks/${deck.id}`, "owner-token"));
    expect(asOwner.collaborators).toHaveLength(1);
    expect(asOwner.role).toBe("owner");

    const asEditor = await jsonOf(await request("GET", `/decks/${deck.id}`, "editor-token"));
    expect(asEditor.collaborators).toBeUndefined();
    expect(asEditor.invite_code).toBeUndefined();
    expect(asEditor.role).toBe("editor");
  });

  test("only the owner manages collaborators", async () => {
    const deck = repository.seedDeck();
    await repository.addCollaborator(deck.id, EDITOR_ID, "editor", "invite");

    const denied = await request("POST", `/decks/${deck.id}/collaborators`, "editor-token", {
      handle: "stranger",
      role: "viewer",
    });
    expect(denied.status).toBe(403);

    const allowed = await request("POST", `/decks/${deck.id}/collaborators`, "owner-token", {
      handle: "stranger",
      role: "viewer",
    });
    expect(allowed.status).toBe(200);
    expect(await repository.getCollaboratorRole(deck.id, STRANGER_ID)).toBe("viewer");

    const removed = await request(
      "DELETE",
      `/decks/${deck.id}/collaborators?handle=stranger`,
      "owner-token",
    );
    expect(removed.status).toBe(200);
    expect(await repository.getCollaboratorRole(deck.id, STRANGER_ID)).toBeNull();
  });
});

describe("card art on the payload", () => {
  test("a card's derived image rides the deck read; a card without art omits it", async () => {
    const deck = repository.seedDeck({ visibility: "public" });
    repository.cards.set(deck.id, [
      { zone: "legend", printing_id: LEGEND.printing_id, oracle_id: LEGEND.oracle_id, quantity: 1, is_champion: false },
      { zone: "main", printing_id: UNIT.printing_id, oracle_id: UNIT.oracle_id, quantity: 3, is_champion: false },
    ]);

    const response = await request("GET", `/decks/${deck.id}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      cards: Array<{ printing_id: string; image?: { small?: string; normal?: string } }>;
    };
    const unit = body.cards.find((row) => row.printing_id === UNIT.printing_id);
    const legend = body.cards.find((row) => row.printing_id === LEGEND.printing_id);
    expect(unit?.image).toEqual({
      small: "https://img.example/unit/small.webp?v=abc",
      normal: "https://img.example/unit/normal.webp?v=abc",
    });
    expect(legend?.image).toBeUndefined();
  });
});

describe("comments", () => {
  test("comment, reply, tombstone: the moderation model end to end", async () => {
    const deck = repository.seedDeck({ visibility: "public" });

    expect((await request("POST", `/decks/${deck.id}/comments`, undefined, { body: "hi" })).status).toBe(401);
    expect(
      (await request("POST", `/decks/${deck.id}/comments`, "stranger-token", { body: "   " })).status,
    ).toBe(400);

    const posted = await request("POST", `/decks/${deck.id}/comments`, "stranger-token", {
      body: "Nice deck!",
    });
    expect(posted.status).toBe(201);
    const root = (await posted.json()) as { id: string; depth: number; can_delete?: boolean };
    expect(root.depth).toBe(0);
    expect(root.can_delete).toBe(true);

    const replied = await request("POST", `/decks/${deck.id}/comments`, "editor-token", {
      body: "Agreed",
      parent_id: root.id,
    });
    const reply = (await replied.json()) as { id: string; parent_id: string; depth: number };
    expect(reply.parent_id).toBe(root.id);
    expect(reply.depth).toBe(1);

    // A random signed-in user cannot delete somebody else's comment…
    expect(
      (await request("DELETE", `/decks/${deck.id}/comments/${reply.id}`, "stranger-token")).status,
    ).toBe(403);
    // …the deck owner can delete any…
    expect(
      (await request("DELETE", `/decks/${deck.id}/comments/${reply.id}`, "owner-token")).status,
    ).toBe(200);
    // …and the author their own.
    expect(
      (await request("DELETE", `/decks/${deck.id}/comments/${root.id}`, "stranger-token")).status,
    ).toBe(200);

    // Tombstones, not gaps: both rows still list, bodies nulled, and an
    // anonymous reader sees no can_delete at all.
    const listed = await request("GET", `/decks/${deck.id}/comments`);
    const body = (await listed.json()) as {
      items: Array<{ id: string; body: string | null; deleted: boolean; can_delete?: boolean }>;
      total: number;
    };
    expect(body.total).toBe(2);
    expect(body.items.every((item) => item.deleted && item.body === null)).toBe(true);
    expect(body.items.every((item) => item.can_delete === undefined)).toBe(true);
  });

  test("a reply to a comment from another deck is refused", async () => {
    const deck = repository.seedDeck({ visibility: "public" });
    const other = repository.seedDeck({ visibility: "public" });
    const posted = await request("POST", `/decks/${other.id}/comments`, "stranger-token", {
      body: "elsewhere",
    });
    const comment = (await posted.json()) as { id: string };
    const crossed = await request("POST", `/decks/${deck.id}/comments`, "stranger-token", {
      body: "reply",
      parent_id: comment.id,
    });
    expect(crossed.status).toBe(400);
  });

  test("the depth cap flattens instead of refusing", async () => {
    const deck = repository.seedDeck({ visibility: "public" });
    let parentId: string | undefined;
    let depthSevenParentId: string | undefined;
    let last: { id: string; parent_id: string | null; depth: number } = {
      id: "",
      parent_id: null,
      depth: 0,
    };
    for (let i = 0; i < 10; i += 1) {
      const posted = await request("POST", `/decks/${deck.id}/comments`, "stranger-token", {
        body: `reply ${i}`,
        ...(parentId ? { parent_id: parentId } : {}),
      });
      expect(posted.status).toBe(201);
      const row = (await posted.json()) as {
        id: string;
        parent_id: string | null;
        depth: number;
      };
      if (row.depth === 7 && depthSevenParentId === undefined) {
        depthSevenParentId = row.parent_id ?? undefined;
      }
      parentId = row.id;
      last = row;
    }
    expect(last.depth).toBe(7);
    // Deeper replies stay at depth 7 as siblings of the capped parent.
    expect(last.parent_id).toBe(depthSevenParentId);
  });

  test("comments on an unreadable deck answer 404 both ways", async () => {
    const deck = repository.seedDeck();
    expect((await request("GET", `/decks/${deck.id}/comments`, "stranger-token")).status).toBe(404);
    expect(
      (await request("POST", `/decks/${deck.id}/comments`, "stranger-token", { body: "hi" })).status,
    ).toBe(404);
  });

  test("like and unlike are idempotent and update the counts", async () => {
    const deck = repository.seedDeck({ visibility: "public" });
    const posted = await request("POST", `/decks/${deck.id}/comments`, "owner-token", {
      body: "hi",
    });
    const comment = (await posted.json()) as { id: string; like_count: number; is_liked?: boolean };
    expect(comment.like_count).toBe(0);
    expect(comment.is_liked).toBe(false);

    expect((await request("POST", `/decks/${deck.id}/comments/${comment.id}/like`)).status).toBe(401);

    const first = await request(
      "POST",
      `/decks/${deck.id}/comments/${comment.id}/like`,
      "stranger-token",
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ liked: true, like_count: 1 });

    const again = await request(
      "POST",
      `/decks/${deck.id}/comments/${comment.id}/like`,
      "stranger-token",
    );
    expect(await again.json()).toEqual({ liked: true, like_count: 1 });

    const listed = await request("GET", `/decks/${deck.id}/comments`, "stranger-token");
    const body = (await listed.json()) as {
      items: Array<{ like_count: number; is_liked?: boolean }>;
    };
    expect(body.items[0]?.like_count).toBe(1);
    expect(body.items[0]?.is_liked).toBe(true);

    const anonymous = await request("GET", `/decks/${deck.id}/comments`);
    const anonymousBody = (await anonymous.json()) as {
      items: Array<{ like_count: number; is_liked?: boolean }>;
    };
    expect(anonymousBody.items[0]?.like_count).toBe(1);
    expect(anonymousBody.items[0]?.is_liked).toBeUndefined();

    const removed = await request(
      "DELETE",
      `/decks/${deck.id}/comments/${comment.id}/like`,
      "stranger-token",
    );
    expect(await removed.json()).toEqual({ liked: false, like_count: 0 });
  });

  test("a comment on an unreadable deck cannot be liked and answers 404", async () => {
    const deck = repository.seedDeck();
    const posted = await request("POST", `/decks/${deck.id}/comments`, "owner-token", {
      body: "hi",
    });
    const comment = (await posted.json()) as { id: string };
    expect(
      (await request("POST", `/decks/${deck.id}/comments/${comment.id}/like`, "stranger-token"))
        .status,
    ).toBe(404);
  });
});

describe("deck folders", () => {
  test("folders are owner-scoped end to end", async () => {
    expect((await request("POST", "/deck-folders", undefined, { name: "Aggro" })).status).toBe(401);

    const created = await request("POST", "/deck-folders", "owner-token", { name: " Aggro " });
    expect(created.status).toBe(201);
    const folder = (await created.json()) as { id: string; name: string; deck_count: number };
    expect(folder.name).toBe("Aggro");

    // Another user neither sees nor touches it — always 404, never 403.
    expect((await request("GET", `/deck-folders/${folder.id}`, "stranger-token")).status).toBe(404);
    expect(
      (await request("PATCH", `/deck-folders/${folder.id}`, "stranger-token", { name: "X" })).status,
    ).toBe(404);
    expect((await request("DELETE", `/deck-folders/${folder.id}`, "stranger-token")).status).toBe(404);

    const renamed = await request("PATCH", `/deck-folders/${folder.id}`, "owner-token", {
      name: "Aggro brews",
    });
    expect(((await renamed.json()) as { name: string }).name).toBe("Aggro brews");

    expect((await request("DELETE", `/deck-folders/${folder.id}`, "owner-token")).status).toBe(200);
    expect((await request("GET", `/deck-folders/${folder.id}`, "owner-token")).status).toBe(404);
  });

  test("filing needs read access; contents prune what is no longer readable", async () => {
    const created = await request("POST", "/deck-folders", "stranger-token", { name: "Ideas" });
    const folder = (await created.json()) as { id: string };

    const own = repository.seedDeck({ owner_id: STRANGER_ID, visibility: "private", name: "Mine" });
    const publicDeck = repository.seedDeck({ visibility: "public", name: "Theirs" });
    const hidden = repository.seedDeck({ visibility: "private", name: "Hidden" });

    expect(
      (await request("PUT", `/deck-folders/${folder.id}/decks/${own.id}`, "stranger-token")).status,
    ).toBe(200);
    expect(
      (await request("PUT", `/deck-folders/${folder.id}/decks/${publicDeck.id}`, "stranger-token"))
        .status,
    ).toBe(200);
    // An unreadable deck cannot even be filed.
    expect(
      (await request("PUT", `/deck-folders/${folder.id}/decks/${hidden.id}`, "stranger-token")).status,
    ).toBe(404);

    // The public deck goes private after filing: the bookmark stops rendering.
    repository.decks.set(publicDeck.id, { ...publicDeck, visibility: "private" });
    const contents = await request("GET", `/deck-folders/${folder.id}`, "stranger-token");
    const body = (await contents.json()) as { items: Array<{ id: string }>; folder: { deck_count: number } };
    expect(body.items.map((item) => item.id)).toEqual([own.id]);
    expect(body.folder.deck_count).toBe(1);

    // Membership rides the listing when asked about one deck.
    const listed = await request("GET", `/deck-folders?deck=${own.id}`, "stranger-token");
    const listing = (await listed.json()) as { items: Array<{ contains_deck?: boolean }> };
    expect(listing.items[0]?.contains_deck).toBe(true);

    expect(
      (await request("DELETE", `/deck-folders/${folder.id}/decks/${own.id}`, "stranger-token")).status,
    ).toBe(200);
  });
});

describe("view counting", () => {
  test("a reader's view counts once per dedup window; the owner's never does", async () => {
    const deck = repository.seedDeck({ visibility: "public" });

    const first = await request("POST", `/decks/${deck.id}/views`, "stranger-token");
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ counted: true });
    expect(repository.decks.get(deck.id)?.view_count).toBe(1);
    // The trigger guard: counting a view must not float the deck up the
    // browse ordering.
    expect(repository.decks.get(deck.id)?.updated_at).toBe("2026-08-01T00:00:00Z");

    // The injected dedup answers "seen already" for the repeat.
    seenViewKeys.clear();
    dedupAnswers = false;
    const repeat = await request("POST", `/decks/${deck.id}/views`, "stranger-token");
    expect(await repeat.json()).toEqual({ counted: false });
    expect(repository.decks.get(deck.id)?.view_count).toBe(1);
    dedupAnswers = true;

    const owner = await request("POST", `/decks/${deck.id}/views`, "owner-token");
    expect(await owner.json()).toEqual({ counted: false });
    expect(repository.decks.get(deck.id)?.view_count).toBe(1);
  });

  test("an unreadable deck 404s and the count rides the payload", async () => {
    const deck = repository.seedDeck();
    expect((await request("POST", `/decks/${deck.id}/views`, "stranger-token")).status).toBe(404);

    repository.decks.set(deck.id, { ...deck, visibility: "public", view_count: 41 });
    const detail = await request("GET", `/decks/${deck.id}`);
    expect(((await detail.json()) as { view_count: number }).view_count).toBe(41);
  });

  test("anonymous viewers count too, keyed without a user id", async () => {
    const deck = repository.seedDeck({ visibility: "public" });
    const response = await request("POST", `/decks/${deck.id}/views`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ counted: true });
    expect([...seenViewKeys][0]).toMatch(new RegExp(`^deckview:${deck.id}:[0-9a-f]{64}$`));
  });
});

describe("favorites", () => {
  test("favorite and unfavorite are idempotent and update the counts", async () => {
    const deck = repository.seedDeck({ visibility: "public" });

    expect((await request("POST", `/decks/${deck.id}/favorite`)).status).toBe(401);

    const first = await request("POST", `/decks/${deck.id}/favorite`, "stranger-token");
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ favorited: true, favorite_count: 1 });

    const again = await request("POST", `/decks/${deck.id}/favorite`, "stranger-token");
    expect(await again.json()).toEqual({ favorited: true, favorite_count: 1 });

    const detail = await request("GET", `/decks/${deck.id}`, "stranger-token");
    const body = (await detail.json()) as { favorite_count: number; is_favorited?: boolean };
    expect(body.favorite_count).toBe(1);
    expect(body.is_favorited).toBe(true);

    // Anonymous readers see the count but no personal flag.
    const anonymous = await request("GET", `/decks/${deck.id}`);
    const anonymousBody = (await anonymous.json()) as {
      favorite_count: number;
      is_favorited?: boolean;
    };
    expect(anonymousBody.favorite_count).toBe(1);
    expect(anonymousBody.is_favorited).toBeUndefined();

    const removed = await request("DELETE", `/decks/${deck.id}/favorite`, "stranger-token");
    expect(await removed.json()).toEqual({ favorited: false, favorite_count: 0 });
  });

  test("an unreadable deck cannot be favorited and answers 404", async () => {
    const deck = repository.seedDeck();
    const response = await request("POST", `/decks/${deck.id}/favorite`, "stranger-token");
    expect(response.status).toBe(404);
  });

  test("filter=favorites lists only still-readable favorites", async () => {
    const publicDeck = repository.seedDeck({ visibility: "public", name: "Public" });
    const hidden = repository.seedDeck({ visibility: "public", name: "Soon private" });
    await repository.addFavorite(publicDeck.id, STRANGER_ID);
    await repository.addFavorite(hidden.id, STRANGER_ID);
    // The owner locks the second deck after it was favorited.
    repository.decks.set(hidden.id, { ...hidden, visibility: "private" });

    const anonymous = await request("GET", "/decks?filter=favorites");
    expect(anonymous.status).toBe(401);

    const listed = await request("GET", "/decks?filter=favorites", "stranger-token");
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as {
      items: Array<{ id: string; is_favorited?: boolean; favorite_count: number }>;
      total: number;
    };
    expect(body.items.map((item) => item.id)).toEqual([publicDeck.id]);
    expect(body.items[0]?.is_favorited).toBe(true);
    expect(body.items[0]?.favorite_count).toBe(1);
  });
});

describe("card tags", () => {
  function seedWithUnit(visibility: "private" | "public" = "private") {
    const deck = repository.seedDeck({ visibility });
    repository.cards.set(deck.id, [
      { zone: "main", printing_id: UNIT.printing_id, oracle_id: UNIT.oracle_id, quantity: 3, is_champion: false },
    ]);
    return deck;
  }

  test("replace-wholesale, trimmed and deduplicated, and echoed on the deck read", async () => {
    const deck = seedWithUnit();
    const put = await request("PUT", `/decks/${deck.id}/card-tags`, "owner-token", {
      oracle_id: UNIT.oracle_id,
      tags: [" ramp ", "ramp", "removal", "  "],
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ oracle_id: UNIT.oracle_id, tags: ["ramp", "removal"] });

    const detail = await request("GET", `/decks/${deck.id}`, "owner-token");
    const body = (await detail.json()) as { cards: Array<{ oracle_id: string; tags: string[] }> };
    expect(body.cards[0]?.tags).toEqual(["ramp", "removal"]);

    const cleared = await request("PUT", `/decks/${deck.id}/card-tags`, "owner-token", {
      oracle_id: UNIT.oracle_id,
      tags: [],
    });
    expect(cleared.status).toBe(200);
    expect(repository.cardTags.get(deck.id)).toEqual([]);
  });

  test("a card not in the deck cannot be tagged", async () => {
    const deck = seedWithUnit();
    const response = await request("PUT", `/decks/${deck.id}/card-tags`, "owner-token", {
      oracle_id: LEGEND.oracle_id,
      tags: ["ramp"],
    });
    expect(response.status).toBe(400);
  });

  test("permission matrix: editor writes, viewer 403, stranger 404, anonymous 401", async () => {
    const deck = seedWithUnit();
    const body = { oracle_id: UNIT.oracle_id, tags: ["ramp"] };

    expect((await request("PUT", `/decks/${deck.id}/card-tags`, undefined, body)).status).toBe(401);
    expect((await request("PUT", `/decks/${deck.id}/card-tags`, "stranger-token", body)).status).toBe(404);

    await repository.addCollaborator(deck.id, EDITOR_ID, "viewer", "invite");
    expect((await request("PUT", `/decks/${deck.id}/card-tags`, "editor-token", body)).status).toBe(403);

    await repository.removeCollaborator(deck.id, EDITOR_ID);
    await repository.addCollaborator(deck.id, EDITOR_ID, "editor", "invite");
    expect((await request("PUT", `/decks/${deck.id}/card-tags`, "editor-token", body)).status).toBe(200);
  });
});

describe("revision history", () => {
  test("limit is honoured and clamped to the cap", async () => {
    const deck = repository.seedDeck({ visibility: "public" });
    const revisions = Array.from({ length: 8 }, (_, index) => ({
      id: `rev-${index + 1}`,
      ordinal: index + 1,
      author_id: OWNER_ID,
      format_id: FORMAT.id,
      created_at: new Date(2026, 0, index + 1).toISOString(),
      changes: [
        {
          zone: "main" as const,
          oracle_id: UNIT.oracle_id,
          printing_id: UNIT.printing_id,
          qty_before: index,
          qty_after: index + 1,
        },
      ],
    }));
    repository.revisions.set(deck.id, revisions);

    const limited = await request("GET", `/decks/${deck.id}/revisions?limit=3`);
    expect(limited.status).toBe(200);
    const limitedBody = (await limited.json()) as { items: Array<{ ordinal: number }> };
    expect(limitedBody.items.map((item) => item.ordinal)).toEqual([8, 7, 6]);

    // Out-of-range values clamp instead of erroring.
    const clamped = await request("GET", `/decks/${deck.id}/revisions?limit=9999`);
    expect(clamped.status).toBe(200);
    const floorClamped = await request("GET", `/decks/${deck.id}/revisions?limit=0`);
    expect(floorClamped.status).toBe(200);
    const floorBody = (await floorClamped.json()) as { items: unknown[] };
    expect(floorBody.items).toHaveLength(1);

    // No param keeps the old contract.
    const all = await request("GET", `/decks/${deck.id}/revisions`);
    const allBody = (await all.json()) as { items: unknown[] };
    expect(allBody.items).toHaveLength(8);
  });
});

describe("invite links", () => {
  test("redeeming writes a collaborator row that survives regeneration", async () => {
    const deck = repository.seedDeck();
    const created = await jsonOf(await request("POST", `/decks/${deck.id}/invite`, "owner-token", { role: "editor" }));
    expect(created.invite_code).toBeTruthy();

    const joined = await request("POST", `/decks/join/${created.invite_code}`, "editor-token");
    expect(joined.status).toBe(200);
    expect(await repository.getCollaboratorRole(deck.id, EDITOR_ID)).toBe("editor");

    // Regenerating replaces the link only; the collaborator keeps access.
    const regenerated = await jsonOf(await request("POST", `/decks/${deck.id}/invite`, "owner-token", { role: "viewer" }));
    expect(regenerated.invite_code).not.toBe(created.invite_code);
    expect(await repository.getCollaboratorRole(deck.id, EDITOR_ID)).toBe("editor");

    const stale = await request("POST", `/decks/join/${created.invite_code}`, "stranger-token");
    expect(stale.status).toBe(404);
  });
});

describe("card mutation", () => {
  test("a batch round-trips through the deck read", async () => {
    const deck = repository.seedDeck();
    const applied = await request("PUT", `/decks/${deck.id}/cards`, "owner-token", {
      changes: [
        {
          zone: "legend",
          printing_id: LEGEND.printing_id,
          oracle_id: LEGEND.oracle_id,
          quantity: 1,
        },
        {
          zone: "main",
          printing_id: UNIT.printing_id,
          oracle_id: UNIT.oracle_id,
          quantity: 3,
          is_champion: true,
        },
      ],
    });
    expect(applied.status).toBe(200);
    const body = await jsonOf(applied);
    expect(body.revision_id).toBeTruthy();
    expect(body.cards).toHaveLength(2);

    const read = await jsonOf(await request("GET", `/decks/${deck.id}`, "owner-token"));
    expect(read.cards.map((c: { printing_id: string }) => c.printing_id).sort()).toEqual(
      [LEGEND.printing_id, UNIT.printing_id].sort(),
    );
    // 3 of 40 main, 0 of 12 runes — format rules are evaluated on read.
    expect(read.violations.map((v: { code: string }) => v.code)).toContain("zone_under_min");

    const removed = await request("PUT", `/decks/${deck.id}/cards`, "owner-token", {
      changes: [{ zone: "main", printing_id: UNIT.printing_id, quantity: 0 }],
    });
    expect(removed.status).toBe(200);
    expect((await jsonOf(removed)).cards).toHaveLength(1);

    const history = await jsonOf(await request("GET", `/decks/${deck.id}/revisions`, "owner-token"));
    expect(history.total).toBe(2);
    expect(history.items[0].changes[0].name).toBe(UNIT.name);
  });

  test("an unknown zone never reaches the database", async () => {
    const deck = repository.seedDeck();
    const response = await request("PUT", `/decks/${deck.id}/cards`, "owner-token", {
      changes: [{ zone: "graveyard", printing_id: UNIT.printing_id, quantity: 1 }],
    });
    expect(response.status).toBe(400);
    // The status alone would still pass if the 400 came from somewhere else and
    // the stub's `String(raw.zone)` had happily stored the row.
    expect(repository.cards.get(deck.id) ?? []).toHaveLength(0);
    expect(repository.revisions.get(deck.id) ?? []).toHaveLength(0);
  });
});

describe("derived tokens", () => {
  test("membership follows makes_token edges and stale choices are pruned, not raised", async () => {
    const deck = repository.seedDeck();
    repository.cards.set(deck.id, [
      {
        zone: "main",
        printing_id: UNIT.printing_id,
        oracle_id: UNIT.oracle_id,
        quantity: 1,
        is_champion: true,
      },
    ]);
    repository.edges = [{ from_oracle_id: UNIT.oracle_id, to_oracle_id: TOKEN.oracle_id }];
    // A choice left behind by an edge ingest has since removed.
    repository.tokenChoices.set(deck.id, [
      { oracle_id: RUNE.oracle_id, printing_id: RUNE.printing_id },
    ]);

    const body = await jsonOf(await request("GET", `/decks/${deck.id}`, "owner-token"));
    expect(body.tokens).toHaveLength(1);
    expect(body.tokens[0].printing_id).toBe(TOKEN.printing_id);
    expect(body.tokens[0].sources).toEqual([UNIT.oracle_id]);
    expect(repository.prunedOracleIds).toEqual([RUNE.oracle_id]);
  });
});

describe("text interchange", () => {
  test("export and import round-trip a deck list", async () => {
    const deck = repository.seedDeck();
    await request("PUT", `/decks/${deck.id}/cards`, "owner-token", {
      changes: [
        {
          zone: "legend",
          printing_id: LEGEND.printing_id,
          oracle_id: LEGEND.oracle_id,
          quantity: 1,
        },
        {
          zone: "main",
          printing_id: UNIT.printing_id,
          oracle_id: UNIT.oracle_id,
          quantity: 3,
          is_champion: true,
        },
        {
          zone: "runes",
          printing_id: RUNE.printing_id,
          oracle_id: RUNE.oracle_id,
          quantity: 12,
        },
      ],
    });

    const exported = await jsonOf(await request("GET", `/decks/${deck.id}/export`, "owner-token"));
    expect(exported.text).toContain(`3 ${UNIT.name} (OGN) ${UNIT.collector_number} *CH*`);

    const imported = await request("POST", "/decks/import", "owner-token", {
      text: exported.text,
      name: "Round trip",
    });
    expect(imported.status).toBe(201);
    const body = await jsonOf(imported);
    expect(body.unresolved).toEqual([]);
    expect(body.imported).toBe(3);

    const sort = (rows: StoredCard[]) =>
      [...rows].sort((a, b) =>
        `${a.zone}${a.printing_id}`.localeCompare(`${b.zone}${b.printing_id}`),
      );
    expect(sort(repository.cards.get(body.id) ?? [])).toEqual(
      sort(repository.cards.get(deck.id) ?? []),
    );
  });

  test("an unresolvable line is reported and the rest still imports", async () => {
    const response = await request("POST", "/decks/import", "owner-token", {
      text: `Main\n1 ${UNIT.name}\n2 Not A Real Card\nnonsense line`,
    });
    expect(response.status).toBe(201);
    const body = await jsonOf(response);
    expect(body.imported).toBe(1);
    expect(body.unresolved.map((row: { line: number }) => row.line).sort()).toEqual([3, 4]);
  });
});
