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
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
      ...overrides,
    };
    this.decks.set(deck.id, deck);
    return deck;
  }

  async callRpc(name: string, args: Record<string, unknown>): Promise<DeckRpcResult> {
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
    decksRoutes({ repository: repo, authPlugin, optionalAuthPlugin }),
  );
}

let repository: StubDeckRepository;
let app: ReturnType<typeof makeApp>;

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
