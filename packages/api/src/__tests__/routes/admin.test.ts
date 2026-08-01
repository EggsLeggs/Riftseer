import { beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { CONFIRMABLE_RECONCILIATION_FIELDS } from "@riftseer/types/reconciliation";
import {
  AdminRepositoryError,
  type AdminAuditPage,
  type AdminAuditQuery,
  type AdminCardLegalities,
  type AdminCardRelationships,
  type AdminCardRulings,
  type AdminDataRepository,
  type AdminFormat,
  type AdminReconciliationEntry,
  type AdminReconciliationPage,
  type AdminReconciliationQuery,
  type AdminRulePreview,
  type AdminRulingsPage,
  type AdminRulingsQuery,
  type AdminRpcResult,
  type AdminSlugCard,
} from "../../lib/admin-data";
import { createAuthPlugin } from "../../plugins/auth";
import { createAdminPlugin } from "../../plugins/admin-auth";
import {
  adminRoutes,
  type AdminImageBindings,
  type AdminImageJob,
} from "../../routes/admin";
import { authRoutes } from "../../routes/auth";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

const testTokenResolver = async (token: string) => {
  if (token === "admin-token") {
    return {
      id: ADMIN_ID,
      email: "admin@example.com",
      created_at: "2026-07-30T00:00:00Z",
    };
  }
  if (token === "user-token") {
    return {
      id: USER_ID,
      email: "user@example.com",
      created_at: "2026-07-30T00:00:00Z",
    };
  }
  return null;
};

const testAuthPlugin = createAuthPlugin(testTokenResolver);

const testAdminPlugin = createAdminPlugin(
  testTokenResolver,
  () => ` ${ADMIN_ID}, `,
);

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

class StubAdminRepository implements AdminDataRepository {
  calls: RpcCall[] = [];
  nextResult: AdminRpcResult | null = null;
  nextError: AdminRepositoryError | null = null;
  slugCard: AdminSlugCard | null = {
    id: "card-1",
    name: "Test Card",
    name_normalized: "test card",
    collector_number: "12",
    set: { set_code: "OGN", set_name: "Origins" },
    metadata: { alternate_art: false, signature: false },
  };
  takenSlugs = new Set<string>();

  async callRpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<AdminRpcResult> {
    this.calls.push({ name, args });
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }
    const result = this.nextResult ?? { ok: true };
    this.nextResult = null;
    return result;
  }

  async getSlugCard(): Promise<AdminSlugCard | null> {
    return this.slugCard;
  }

  lastSlugQuery?: { baseSlug: string; excludeCardId?: string };

  async getTakenSlugs(
    baseSlug: string,
    excludeCardId?: string,
  ): Promise<Set<string>> {
    this.lastSlugQuery = { baseSlug, excludeCardId };
    // Mirror the repository's prefix scoping so the tests exercise the same
    // candidate set the database would return.
    return new Set(
      [...this.takenSlugs].filter((slug) => slug.startsWith(baseSlug)),
    );
  }

  auditQueries: AdminAuditQuery[] = [];
  auditPage: AdminAuditPage = { entries: [], total: 0 };
  auditError: AdminRepositoryError | null = null;

  async listAuditLog(query: AdminAuditQuery): Promise<AdminAuditPage> {
    this.auditQueries.push(query);
    if (this.auditError) {
      const error = this.auditError;
      this.auditError = null;
      throw error;
    }
    return this.auditPage;
  }

  formats: AdminFormat[] = [
    {
      id: "format-1",
      code: "standard",
      name: "Standard",
      sort_order: 0,
      active: true,
      legality_count: 2,
      override_count: 1,
    },
  ];

  async listFormats(): Promise<AdminFormat[]> {
    return this.formats;
  }

  /** Null models a card id that does not exist, so the route must 404. */
  legalities: AdminCardLegalities | null = {
    card_id: "card-1",
    oracle_key: "test card",
    entries: [
      {
        format_id: "format-1",
        format_code: "standard",
        format_name: "Standard",
        format_active: true,
        oracle_status: "banned",
        printing_status: "legal",
        effective_status: "legal",
      },
    ],
  };

  async listCardLegalities(): Promise<AdminCardLegalities | null> {
    return this.legalities;
  }

  rulings: AdminCardRulings | null = {
    card_id: "card-1",
    oracle_key: "test card",
    entries: [
      {
        id: "99999999-9999-4999-8999-999999999999",
        type: "ruling",
        text: "Applies to every printing.",
        dated: "2026-05-01",
        source: null,
        active: true,
        scope: "oracle",
        all_printings: true,
        shared: false,
        target_count: 1,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
    ],
  };

  async listCardRulings(): Promise<AdminCardRulings | null> {
    return this.rulings;
  }

  relationships: AdminCardRelationships | null = {
    card_id: "card-1",
    oracle_key: "test card",
    oracle_entries: [
      {
        kind: "related_legends",
        related_card_id: "card-2",
        action: "add",
      },
    ],
    printing_entries: [],
  };

  async listCardRelationships(): Promise<AdminCardRelationships | null> {
    return this.relationships;
  }

  reconciliationQueries: AdminReconciliationQuery[] = [];
  reconciliationPage: AdminReconciliationPage = {
    entries: [],
    total: 0,
    counts: { pending: 0, confirmed: 0, dismissed: 0 },
  };

  async listReconciliation(
    query: AdminReconciliationQuery,
  ): Promise<AdminReconciliationPage> {
    this.reconciliationQueries.push(query);
    return this.reconciliationPage;
  }

  /** Null models an unknown entry id, so the route must 404 before any RPC. */
  reconciliationEntry: AdminReconciliationEntry | null =
    unmatchedProductEntry();

  async getReconciliationEntry(): Promise<AdminReconciliationEntry | null> {
    return this.reconciliationEntry;
  }

  rulingsQueries: AdminRulingsQuery[] = [];
  rulingsPage: AdminRulingsPage = { rulings: [], total: 0 };

  async listRulings(query: AdminRulingsQuery): Promise<AdminRulingsPage> {
    this.rulingsQueries.push(query);
    return this.rulingsPage;
  }

  /** Captures the AST the route parsed, so tests can assert on it directly. */
  previewedAsts: unknown[] = [];
  rulePreview: AdminRulePreview = { total: 0, sample: [] };

  async previewRule(ast: unknown): Promise<AdminRulePreview> {
    this.previewedAsts.push(ast);
    return this.rulePreview;
  }
}

const ENTRY_ID = "33333333-3333-4333-8333-333333333333";

function unmatchedProductEntry(): AdminReconciliationEntry {
  return {
    id: ENTRY_ID,
    kind: "unmatched_product",
    source: "tcgplayer",
    fingerprint: "product:652952",
    status: "pending",
    payload: {
      product: {
        product_id: 652952,
        name: "Sett Brawler Alternate Art",
        url: "https://www.tcgplayer.com/product/652952/test",
        image_url: null,
        collector_number: "164a",
        group_id: 24344,
        set_code: "OGN",
      },
      card_id: "card-1",
      card_name: "Sett - Brawler",
    },
    proposed_card_id: "card-1",
    note: null,
    resolved_by: null,
    resolved_at: null,
    created_at: "2026-08-01T00:00:00Z",
    last_seen_at: "2026-08-01T00:00:00Z",
  };
}

class StubImageBindings implements AdminImageBindings {
  stored: Array<{ key: string; bytes: number }> = [];
  deleted: string[] = [];
  jobs: AdminImageJob[] = [];
  baseUrl = "https://img.riftseer.com";

  bucket = {
    put: async (
      key: string,
      value: ArrayBuffer,
      _options: {
        httpMetadata: { contentType: string; cacheControl: string };
        customMetadata: Record<string, string>;
      },
    ): Promise<unknown> => {
      this.stored.push({ key, bytes: value.byteLength });
      return { key };
    },
    delete: async (key: string): Promise<void> => {
      this.deleted.push(key);
    },
  };

  /** Set to simulate a queue outage on the next send. */
  queueError: Error | null = null;

  queue = {
    send: async (job: AdminImageJob): Promise<void> => {
      if (this.queueError) {
        const error = this.queueError;
        this.queueError = null;
        throw error;
      }
      this.jobs.push(job);
    },
  };
}

function jsonRequest(
  path: string,
  method: string,
  body?: unknown,
  token = "admin-token",
): Request {
  return new Request(`http://localhost/api/v1${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("admin API", () => {
  let repository: StubAdminRepository;
  let imageBindings: StubImageBindings;
  let app: ReturnType<typeof buildAdminApp>;

  function buildAdminApp() {
    return new Elysia({ prefix: "/api/v1" }).use(
      adminRoutes({
        repository,
        imageBindings,
        adminAuthPlugin: testAdminPlugin,
      }),
    );
  }

  beforeEach(() => {
    repository = new StubAdminRepository();
    imageBindings = new StubImageBindings();
    app = buildAdminApp();
  });

  test("rejects missing and non-admin tokens before mutation", async () => {
    const missing = await app.handle(
      new Request("http://localhost/api/v1/admin/cards/card-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch: { name: "Nope" } }),
      }),
    );
    expect(missing.status).toBe(401);

    const nonAdmin = await app.handle(
      jsonRequest(
        "/admin/cards/card-1",
        "PATCH",
        { patch: { name: "Nope" } },
        "user-token",
      ),
    );
    expect(nonAdmin.status).toBe(403);
    expect(await nonAdmin.json()).toEqual({
      error: "Admin access required",
      code: "ADMIN_REQUIRED",
    });
    expect(repository.calls).toHaveLength(0);
  });

  test("normalizes a patched card name and attributes the durable RPC", async () => {
    const response = await app.handle(
      jsonRequest("/admin/cards/card-1", "PATCH", {
        patch: {
          name: "  Thousand-Tailed Watcher  ",
          text: { plain: "Admin text" },
        },
        note: "Fix source typo",
      }),
    );

    expect(response.status).toBe(200);
    expect(repository.calls).toEqual([
      {
        name: "admin_patch_card",
        args: {
          p_card_id: "card-1",
          p_patch: {
            name: "Thousand-Tailed Watcher",
            name_normalized: "thousand tailed watcher",
            oracle_key: "thousand tailed watcher",
            text: { plain: "Admin text" },
          },
          p_note: "Fix source typo",
          p_actor: ADMIN_ID,
        },
      },
      // An edit can move the card into or out of a rule-scoped ruling, so the
      // patch is followed by a per-card rematch rather than waiting for ingest.
      {
        name: "refresh_ruling_matches_for_card",
        args: { p_card_id: "card-1" },
      },
    ]);
  });

  test("rematches rule-scoped rulings after every card mutation", async () => {
    const refreshedBy = async (
      path: string,
      method: string,
      body?: unknown,
    ): Promise<string[]> => {
      repository.calls = [];
      await app.handle(jsonRequest(path, method, body));
      return repository.calls
        .filter((call) => call.name === "refresh_ruling_matches_for_card")
        .map((call) => String(call.args.p_card_id));
    };

    expect(
      await refreshedBy("/admin/cards/card-1", "PATCH", {
        patch: { text: { plain: "[Deathknell]" } },
      }),
    ).toEqual(["card-1"]);
    expect(
      await refreshedBy("/admin/cards/card-1/move", "POST", {
        set_code: "OGN",
      }),
    ).toEqual(["card-1"]);
    expect(
      await refreshedBy("/admin/cards/card-1/relationships", "PUT", {
        entries: [],
      }),
    ).toEqual(["card-1"]);
    // Deleting is a rematch too — the RPC drops the card's memberships.
    expect(await refreshedBy("/admin/cards/card-1", "DELETE")).toEqual([
      "card-1",
    ]);
  });

  test("does not fail an edit when the rematch errors", async () => {
    // The write has already committed by the time the rematch runs, so a
    // failure there must not be reported as a failed edit.
    const realCallRpc = repository.callRpc.bind(repository);
    repository.callRpc = async (name, args) => {
      if (name === "refresh_ruling_matches_for_card") {
        throw new AdminRepositoryError("boom", "XX000");
      }
      return realCallRpc(name, args);
    };

    const response = await app.handle(
      jsonRequest("/admin/cards/card-1", "PATCH", {
        patch: { text: { plain: "Admin text" } },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
  });

  test("creates a manual card with a generated stable slug", async () => {
    const response = await app.handle(
      jsonRequest("/admin/cards", "POST", {
        id: "manual-card",
        definition: {
          name: "Test Card",
          collector_number: "12",
          set: {
            set_code: "ogn",
            set_name: "Origins",
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    const call = repository.calls[0];
    expect(call.name).toBe("admin_create_manual_card");
    expect(call.args.p_actor).toBe(ADMIN_ID);
    expect(call.args.p_definition).toEqual(
      expect.objectContaining({
        name: "Test Card",
        name_normalized: "test card",
        oracle_key: "test card",
        public_slug: "ogn/12/test-card",
        is_token: false,
        set: {
          set_code: "OGN",
          set_name: "Origins",
        },
      }),
    );
  });

  test("regenerates malformed legacy slugs with collision handling", async () => {
    repository.takenSlugs.add("ogn/12/test-card");

    const response = await app.handle(
      jsonRequest(
        "/admin/cards/card-1/regenerate-slug",
        "POST",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      card_id: "card-1",
      public_slug: "ogn/12/test-card-2",
    });
    expect(repository.calls[0]).toEqual({
      name: "admin_set_card_slug",
      args: {
        p_card_id: "card-1",
        p_slug: "ogn/12/test-card-2",
        p_actor: ADMIN_ID,
      },
    });
  });

  test("returns a conflict without leaking a database error", async () => {
    repository.nextError = new AdminRepositoryError(
      "duplicate key value violates unique constraint cards_public_slug_key",
      "23505",
    );

    const response = await app.handle(
      jsonRequest("/admin/cards/card-1", "PATCH", {
        patch: { name: "Conflicting Card" },
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Admin mutation conflicts with existing data",
      code: "ADMIN_CONFLICT",
    });
  });

  test("does not leak a non-conflict database error", async () => {
    repository.nextError = new AdminRepositoryError(
      'function admin_patch_card(text, jsonb) does not exist',
      "42883",
    );

    const response = await app.handle(
      jsonRequest("/admin/cards/card-1", "PATCH", {
        patch: { name: "Broken Card" },
      }),
    );

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: "Admin operation failed",
      code: "ADMIN_OPERATION_FAILED",
    });
    expect(JSON.stringify(body)).not.toContain("admin_patch_card");
    expect(JSON.stringify(body)).not.toContain("42883");
  });

  test("rejects contradictory duplicate relationship entries", async () => {
    const response = await app.handle(
      jsonRequest("/admin/cards/card-1/relationships", "PUT", {
        entries: [
          {
            kind: "related_printings",
            related_card_id: "card-2",
            action: "add",
          },
          {
            kind: "related_printings",
            related_card_id: "card-2",
            action: "remove",
          },
        ],
      }),
    );

    expect(response.status).toBe(400);
    expect(repository.calls).toHaveLength(0);
  });

  test("lists layered relationship overrides", async () => {
    const response = await app.handle(
      jsonRequest("/admin/cards/card-1/relationships", "GET"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      card_id: "card-1",
      oracle_key: "test card",
      oracle_entries: [
        {
          kind: "related_legends",
          related_card_id: "card-2",
          action: "add",
        },
      ],
      printing_entries: [],
    });
  });

  test("returns 404 when listing relationships for an unknown card", async () => {
    repository.relationships = null;
    const response = await app.handle(
      jsonRequest("/admin/cards/nope/relationships", "GET"),
    );
    expect(response.status).toBe(404);
  });

  test("defaults relationship PUT to every printing", async () => {
    const response = await app.handle(
      jsonRequest("/admin/cards/card-1/relationships", "PUT", {
        entries: [
          {
            kind: "related_legends",
            related_card_id: "card-2",
            action: "add",
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(repository.calls[0]).toEqual({
      name: "admin_set_card_relationships",
      args: {
        p_card_id: "card-1",
        p_entries: [
          {
            kind: "related_legends",
            related_card_id: "card-2",
            action: "add",
          },
        ],
        p_all_printings: true,
        p_actor: ADMIN_ID,
      },
    });
  });

  test("passes a printing-scoped relationship PUT through", async () => {
    const response = await app.handle(
      jsonRequest("/admin/cards/card-1/relationships", "PUT", {
        entries: [],
        apply_to_all_printings: false,
      }),
    );

    expect(response.status).toBe(200);
    expect(repository.calls[0]?.args.p_all_printings).toBe(false);
  });

  test("maps a non-empty set deletion to a conflict", async () => {
    repository.nextResult = {
      ok: false,
      reason: "set_not_empty",
      card_count: 2,
    };

    const response = await app.handle(
      jsonRequest("/admin/sets/ogn", "DELETE", {
        reason: "Duplicate set",
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Move or delete every card in the set first",
      code: "SET_NOT_EMPTY",
    });
    expect(repository.calls[0]).toEqual({
      name: "admin_delete_set",
      args: {
        p_set_code: "OGN",
        p_reason: "Duplicate set",
        p_actor: ADMIN_ID,
      },
    });
  });

  test("stores an admin image in R2 and queues the Phase 2 processor", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File([Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      )], "card.png", {
        type: "image/png",
      }),
    );
    form.set("accessibility_text", "Updated card art");

    const response = await app.handle(
      new Request(
        "http://localhost/api/v1/admin/cards/card-1/image",
        {
          method: "POST",
          headers: { Authorization: "Bearer admin-token" },
          body: form,
        },
      ),
    );

    expect(response.status).toBe(202);
    expect(imageBindings.stored).toHaveLength(1);
    expect(imageBindings.stored[0].key).toMatch(
      /^cards\/card-1\/uploads\/[a-f0-9]{64}$/,
    );
    expect(imageBindings.jobs).toHaveLength(1);
    expect(imageBindings.jobs[0]).toEqual(
      expect.objectContaining({
        version: 1,
        cardId: "card-1",
        sourceProvider: "admin",
      }),
    );

    const call = repository.calls[0];
    expect(call.name).toBe("admin_set_card_image");
    expect(call.args.p_media).toEqual(
      expect.objectContaining({
        source_provider: "admin",
        accessibility_text: "Updated card art",
        media_urls: null,
      }),
    );
  });

  test("maps card_not_found to 404", async () => {
    repository.nextResult = { ok: false, reason: "card_not_found" };

    const response = await app.handle(
      jsonRequest("/admin/cards/card-1", "PATCH", {
        patch: { name: "Missing Card" },
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Card not found",
      code: "CARD_NOT_FOUND",
    });
  });

  test("maps set_not_found to 404 when moving a card", async () => {
    repository.nextResult = { ok: false, reason: "set_not_found" };

    const response = await app.handle(
      jsonRequest("/admin/cards/card-1/move", "POST", { set_code: "nope" }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Set not found",
      code: "SET_NOT_FOUND",
    });
  });

  test("reports queued:false but keeps the upload when the queue fails", async () => {
    imageBindings.queueError = new Error("queue unavailable");
    const form = new FormData();
    form.set(
      "file",
      new File([Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      )], "card.png", { type: "image/png" }),
    );

    const response = await app.handle(
      new Request("http://localhost/api/v1/admin/cards/card-1/image", {
        method: "POST",
        headers: { Authorization: "Bearer admin-token" },
        body: form,
      }),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual(
      expect.objectContaining({ ok: true, queued: false }),
    );
    // The upload and the persisted media row must survive: that state is what
    // the ingest catalogue scan re-queues, and rolling back would discard the
    // admin's image.
    expect(imageBindings.jobs).toHaveLength(0);
    expect(imageBindings.stored).toHaveLength(1);
    expect(imageBindings.deleted).toHaveLength(0);
    expect(repository.calls[0]?.name).toBe("admin_set_card_image");
  });

  describe("GET /admin/audit-log", () => {
    const entry = {
      id: 42,
      actor_id: ADMIN_ID,
      action: "card.patch",
      target_type: "card",
      target_id: "card-1",
      detail: { name: "Renamed" },
      created_at: "2026-07-30T12:00:00Z",
    };

    test("requires an admin token", async () => {
      const missing = await app.handle(
        new Request("http://localhost/api/v1/admin/audit-log"),
      );
      expect(missing.status).toBe(401);

      const nonAdmin = await app.handle(
        jsonRequest("/admin/audit-log", "GET", undefined, "user-token"),
      );
      expect(nonAdmin.status).toBe(403);
      expect(repository.auditQueries).toHaveLength(0);
    });

    test("returns entries with the resolved paging window", async () => {
      repository.auditPage = { entries: [entry], total: 1 };

      const response = await app.handle(jsonRequest("/admin/audit-log", "GET"));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        entries: [entry],
        total: 1,
        limit: 50,
        offset: 0,
      });
    });

    test("passes filters through and clamps the limit", async () => {
      await app.handle(
        jsonRequest(
          "/admin/audit-log?limit=5000&offset=20&action=card.delete&target_type=card&target_id=card-9&actor_id=" +
            ADMIN_ID,
          "GET",
        ),
      );

      expect(repository.auditQueries[0]).toEqual({
        limit: 200,
        offset: 20,
        action: "card.delete",
        targetType: "card",
        targetId: "card-9",
        actorId: ADMIN_ID,
      });
    });

    test("floors a negative or unparseable window to the defaults", async () => {
      await app.handle(
        jsonRequest("/admin/audit-log?limit=0&offset=-10", "GET"),
      );

      expect(repository.auditQueries[0]).toEqual(
        expect.objectContaining({ limit: 50, offset: 0 }),
      );
    });

    test("does not leak database messages when the read fails", async () => {
      repository.auditError = new AdminRepositoryError(
        "relation admin_audit_log does not exist",
        "42P01",
      );

      const response = await app.handle(jsonRequest("/admin/audit-log", "GET"));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: "Admin operation failed",
        code: "ADMIN_OPERATION_FAILED",
      });
    });
  });

  describe("reconciliation queue", () => {
    test("requires an admin token", async () => {
      const missing = await app.handle(
        new Request("http://localhost/api/v1/admin/reconciliation"),
      );
      expect(missing.status).toBe(401);

      const nonAdmin = await app.handle(
        jsonRequest(
          `/admin/reconciliation/${ENTRY_ID}/dismiss`,
          "POST",
          {},
          "user-token",
        ),
      );
      expect(nonAdmin.status).toBe(403);
      expect(repository.calls).toHaveLength(0);
    });

    test("defaults to pending entries and clamps the paging window", async () => {
      await app.handle(jsonRequest("/admin/reconciliation", "GET"));
      expect(repository.reconciliationQueries[0]).toEqual({
        limit: 50,
        offset: 0,
        status: "pending",
        kind: undefined,
      });

      await app.handle(
        jsonRequest(
          "/admin/reconciliation?status=dismissed&kind=field_diff&limit=5000&offset=10",
          "GET",
        ),
      );
      expect(repository.reconciliationQueries[1]).toEqual({
        limit: 200,
        offset: 10,
        status: "dismissed",
        kind: "field_diff",
      });
    });

    test("returns entries with status counts for the review tabs", async () => {
      const entry = unmatchedProductEntry();
      repository.reconciliationPage = {
        entries: [entry],
        total: 1,
        counts: { pending: 1, confirmed: 4, dismissed: 2 },
      };

      const response = await app.handle(
        jsonRequest("/admin/reconciliation", "GET"),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        entries: [entry],
        total: 1,
        counts: { pending: 1, confirmed: 4, dismissed: 2 },
        limit: 50,
        offset: 0,
      });
    });

    test("confirming a product writes the durable tcgplayer link", async () => {
      const response = await app.handle(
        jsonRequest(`/admin/reconciliation/${ENTRY_ID}/confirm`, "POST", {
          note: "Same printing, different name upstream",
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        entry_id: ENTRY_ID,
        status: "confirmed",
        card_id: null,
      });
      expect(repository.calls).toEqual([
        {
          name: "admin_resolve_reconciliation_entry",
          args: {
            p_entry_id: ENTRY_ID,
            p_action: "confirm",
            p_card_id: null,
            p_patch: {
              external_ids: { tcgplayer_id: "652952" },
              purchase_uris: {
                tcgplayer: "https://www.tcgplayer.com/product/652952/test",
              },
            },
            p_note: "Same printing, different name upstream",
            p_actor: ADMIN_ID,
          },
        },
      ]);
    });

    test("confirming a field diff patches only that field", async () => {
      repository.reconciliationEntry = {
        ...unmatchedProductEntry(),
        kind: "field_diff",
        fingerprint: "diff:released_at:card-1:2025-11-14",
        payload: {
          ...unmatchedProductEntry().payload,
          field: "released_at",
          current_value: "2025-10-31",
          proposed_value: "2025-11-14",
        },
      };

      const response = await app.handle(
        jsonRequest(`/admin/reconciliation/${ENTRY_ID}/confirm`, "POST", {
          card_id: "  card-7  ",
        }),
      );

      expect(response.status).toBe(200);
      expect(repository.calls[0].args).toEqual(
        expect.objectContaining({
          p_action: "confirm",
          // An explicit card_id overrides ingest's suggestion, trimmed.
          p_card_id: "card-7",
          p_patch: { released_at: "2025-11-14" },
        }),
      );
    });

    // The admin review page disables Confirm from this same list, so a field
    // that is on it but has no case in `buildConfirmPatch` would leave the
    // button enabled on a row the API then rejects.
    test.each([...CONFIRMABLE_RECONCILIATION_FIELDS])(
      "confirms a %s diff",
      async (field) => {
        repository.reconciliationEntry = {
          ...unmatchedProductEntry(),
          kind: "field_diff",
          fingerprint: `diff:${field}:card-1:3`,
          payload: {
            ...unmatchedProductEntry().payload,
            field,
            current_value: "2",
            proposed_value: "3",
          },
        };

        const response = await app.handle(
          jsonRequest(`/admin/reconciliation/${ENTRY_ID}/confirm`, "POST", {}),
        );

        expect(response.status).toBe(200);
        expect(repository.calls[0].args).toEqual(
          expect.objectContaining({ p_action: "confirm" }),
        );
      },
    );

    test("refuses a field the API has no patch for", async () => {
      repository.reconciliationEntry = {
        ...unmatchedProductEntry(),
        kind: "field_diff",
        fingerprint: "diff:text:card-1:Deal 2 damage",
        payload: {
          ...unmatchedProductEntry().payload,
          field: "text",
          current_value: "Deal 1 damage",
          proposed_value: "Deal 2 damage",
        },
      };

      const response = await app.handle(
        jsonRequest(`/admin/reconciliation/${ENTRY_ID}/confirm`, "POST", {}),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "This entry proposes a field the API cannot apply",
        code: "REVIEW_FIELD_UNSUPPORTED",
      });
      expect(repository.calls).toHaveLength(0);
    });

    test("404s an unknown entry before calling the RPC", async () => {
      repository.reconciliationEntry = null;

      const response = await app.handle(
        jsonRequest(`/admin/reconciliation/${ENTRY_ID}/confirm`, "POST", {}),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "Review entry not found",
        code: "REVIEW_ENTRY_NOT_FOUND",
      });
      expect(repository.calls).toHaveLength(0);
    });

    test("rejects a confirmation with no card to link", async () => {
      repository.nextResult = { ok: false, reason: "card_required" };

      const response = await app.handle(
        jsonRequest(`/admin/reconciliation/${ENTRY_ID}/confirm`, "POST", {}),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Choose a card to link this product to",
        code: "CARD_REQUIRED",
      });
    });

    test("reports an already-resolved entry as a conflict", async () => {
      repository.nextResult = {
        ok: false,
        reason: "reconciliation_entry_resolved",
      };

      const response = await app.handle(
        jsonRequest(`/admin/reconciliation/${ENTRY_ID}/dismiss`, "POST", {}),
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "Review entry has already been resolved",
        code: "REVIEW_ENTRY_RESOLVED",
      });
    });

    test("dismissing never touches a card", async () => {
      const response = await app.handle(
        jsonRequest(`/admin/reconciliation/${ENTRY_ID}/dismiss`, "POST", {
          note: "Sealed product",
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        entry_id: ENTRY_ID,
        status: "dismissed",
        card_id: null,
      });
      expect(repository.calls[0]).toEqual({
        name: "admin_resolve_reconciliation_entry",
        args: {
          p_entry_id: ENTRY_ID,
          p_action: "dismiss",
          p_card_id: null,
          p_patch: {},
          p_note: "Sealed product",
          p_actor: ADMIN_ID,
        },
      });
    });
  });

  describe("formats", () => {
    test("lists every format with the counts a delete would cascade", async () => {
      const response = await app.handle(jsonRequest("/admin/formats", "GET"));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        formats: [
          {
            id: "format-1",
            code: "standard",
            name: "Standard",
            sort_order: 0,
            active: true,
            legality_count: 2,
            override_count: 1,
          },
        ],
      });
    });

    test("lowercases a created code and defers ordering to the RPC", async () => {
      const response = await app.handle(
        jsonRequest("/admin/formats", "POST", {
          code: "standard",
          name: "  Standard  ",
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true, code: "standard" });
      expect(repository.calls).toEqual([
        {
          name: "admin_create_format",
          args: {
            p_code: "standard",
            p_name: "Standard",
            p_sort_order: null,
            p_active: true,
            p_actor: ADMIN_ID,
          },
        },
      ]);
    });

    test("rejects a code that is not a lowercase handle", async () => {
      const response = await app.handle(
        jsonRequest("/admin/formats", "POST", {
          code: "Standard Format",
          name: "Standard",
        }),
      );

      expect(response.status).toBe(400);
      expect(repository.calls).toHaveLength(0);
    });

    test("maps a duplicate code to a 409 with a machine code", async () => {
      repository.nextResult = { ok: false, reason: "format_exists" };

      const response = await app.handle(
        jsonRequest("/admin/formats", "POST", {
          code: "standard",
          name: "Standard",
        }),
      );

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "Format code already exists",
        code: "FORMAT_EXISTS",
      });
    });

    test("reads /formats/order as a reorder, not a format code", async () => {
      const response = await app.handle(
        jsonRequest("/admin/formats/order", "PUT", {
          codes: ["limited", "standard"],
        }),
      );

      expect(response.status).toBe(200);
      expect(repository.calls).toEqual([
        {
          name: "admin_reorder_formats",
          args: {
            p_codes: ["limited", "standard"],
            p_actor: ADMIN_ID,
          },
        },
      ]);
    });

    test("rejects a reorder that repeats a code", async () => {
      const response = await app.handle(
        jsonRequest("/admin/formats/order", "PUT", {
          codes: ["standard", "standard"],
        }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Format codes must be unique",
        code: "DUPLICATE_FORMAT",
      });
      expect(repository.calls).toHaveLength(0);
    });

    test("refuses an empty format patch", async () => {
      const response = await app.handle(
        jsonRequest("/admin/formats/standard", "PATCH", { patch: {} }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Patch must contain at least one field",
        code: "EMPTY_PATCH",
      });
      expect(repository.calls).toHaveLength(0);
    });

    test("reports what a delete cascaded away", async () => {
      repository.nextResult = {
        ok: true,
        legalities_removed: 4,
        overrides_removed: 2,
      };

      const response = await app.handle(
        jsonRequest("/admin/formats/standard", "DELETE"),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        code: "standard",
        legalities_removed: 4,
        overrides_removed: 2,
      });
    });

    test("maps an unknown format to a 404", async () => {
      repository.nextResult = { ok: false, reason: "format_not_found" };

      const response = await app.handle(
        jsonRequest("/admin/formats/nope", "DELETE"),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "Format not found",
        code: "FORMAT_NOT_FOUND",
      });
    });
  });

  describe("card legalities", () => {
    test("exposes the card status and the printing override separately", async () => {
      const response = await app.handle(
        jsonRequest("/admin/cards/card-1/legalities", "GET"),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        card_id: "card-1",
        oracle_key: "test card",
        entries: [
          {
            format_id: "format-1",
            format_code: "standard",
            format_name: "Standard",
            format_active: true,
            oracle_status: "banned",
            printing_status: "legal",
            effective_status: "legal",
          },
        ],
      });
    });

    test("404s rather than showing an empty table for an unknown card", async () => {
      repository.legalities = null;

      const response = await app.handle(
        jsonRequest("/admin/cards/nope/legalities", "GET"),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "Card not found",
        code: "CARD_NOT_FOUND",
      });
    });

    test("writes a printing-scoped status by default", async () => {
      const response = await app.handle(
        jsonRequest("/admin/cards/card-1/legalities", "PUT", {
          format_code: "STANDARD",
          status: "banned",
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        card_id: "card-1",
        format_code: "standard",
        scope: "printing",
        status: "banned",
      });
      expect(repository.calls).toEqual([
        {
          name: "admin_set_card_legality",
          args: {
            p_card_id: "card-1",
            p_format_code: "standard",
            p_status: "banned",
            p_all_printings: false,
            p_actor: ADMIN_ID,
          },
        },
      ]);
    });

    test("applies to every printing when asked", async () => {
      const response = await app.handle(
        jsonRequest("/admin/cards/card-1/legalities", "PUT", {
          format_code: "standard",
          status: "not_legal",
          apply_to_all_printings: true,
        }),
      );

      expect(response.status).toBe(200);
      expect(
        (await response.json()) as Record<string, unknown>,
      ).toMatchObject({ scope: "oracle" });
      expect(repository.calls[0].args).toMatchObject({
        p_all_printings: true,
        p_status: "not_legal",
      });
    });

    test("sends `default` as a null status so the row is cleared", async () => {
      const response = await app.handle(
        jsonRequest("/admin/cards/card-1/legalities", "PUT", {
          format_code: "standard",
          status: "default",
        }),
      );

      expect(response.status).toBe(200);
      expect(repository.calls[0].args.p_status).toBeNull();
      expect(
        (await response.json()) as Record<string, unknown>,
      ).toMatchObject({ status: null });
    });

    test("rejects a status outside the allowed set", async () => {
      const response = await app.handle(
        jsonRequest("/admin/cards/card-1/legalities", "PUT", {
          format_code: "standard",
          status: "restricted",
        }),
      );

      expect(response.status).toBe(400);
      expect(repository.calls).toHaveLength(0);
    });
  });

  describe("card rulings", () => {
    const RULING_ID = "99999999-9999-4999-8999-999999999999";

    test("returns the entries visible on this printing", async () => {
      const response = await app.handle(
        jsonRequest("/admin/cards/card-1/rulings", "GET"),
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { entries: unknown[] };
      expect(body.entries).toHaveLength(1);
    });

    test("defaults a new ruling to every printing", async () => {
      repository.nextResult = { ok: true, ruling_id: RULING_ID };

      const response = await app.handle(
        jsonRequest("/admin/cards/card-1/rulings", "POST", {
          type: "ruling",
          text: "  Resolves before the unit readies.  ",
          dated: "2026-03-14",
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ok: true,
        card_id: "card-1",
        ruling_id: RULING_ID,
      });
      expect(repository.calls).toEqual([
        {
          name: "admin_create_card_ruling",
          args: {
            p_card_id: "card-1",
            p_all_printings: true,
            p_type: "ruling",
            p_text: "Resolves before the unit readies.",
            p_dated: "2026-03-14",
            p_source: null,
            p_actor: ADMIN_ID,
          },
        },
      ]);
    });

    test("scopes a ruling to one printing when asked", async () => {
      repository.nextResult = { ok: true, ruling_id: RULING_ID };

      await app.handle(
        jsonRequest("/admin/cards/card-1/rulings", "POST", {
          type: "note",
          text: "This printing has a misprinted cost.",
          apply_to_all_printings: false,
        }),
      );

      expect(repository.calls[0].args).toMatchObject({
        p_all_printings: false,
        p_type: "note",
      });
    });

    test("rejects a blank ruling before reaching the database", async () => {
      const response = await app.handle(
        jsonRequest("/admin/cards/card-1/rulings", "POST", {
          type: "ruling",
          text: "   ",
        }),
      );

      expect(response.status).toBe(400);
      expect(repository.calls).toHaveLength(0);
    });

    test("translates the patch scope flag to the durable shape", async () => {
      const response = await app.handle(
        jsonRequest(`/admin/cards/card-1/rulings/${RULING_ID}`, "PATCH", {
          patch: { text: "  Updated.  ", apply_to_all_printings: false },
        }),
      );

      expect(response.status).toBe(200);
      expect(repository.calls).toEqual([
        {
          name: "admin_patch_card_ruling",
          args: {
            p_card_id: "card-1",
            p_ruling_id: RULING_ID,
            p_patch: { text: "Updated.", all_printings: false },
            p_actor: ADMIN_ID,
          },
        },
      ]);
    });

    test("rejects a ruling id that is not a uuid", async () => {
      const response = await app.handle(
        jsonRequest("/admin/cards/card-1/rulings/not-a-uuid", "DELETE"),
      );

      expect(response.status).toBe(400);
      expect(repository.calls).toHaveLength(0);
    });

    test("maps a ruling from another card to a 404", async () => {
      repository.nextResult = { ok: false, reason: "ruling_not_found" };

      const response = await app.handle(
        jsonRequest(`/admin/cards/card-1/rulings/${RULING_ID}`, "DELETE"),
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "Ruling not found",
        code: "RULING_NOT_FOUND",
      });
    });
  });

  // ── Rulings tab ─────────────────────────────────────────────────────────────

  test("parses a rule query into an AST and stores it beside the source text", async () => {
    const response = await app.handle(
      jsonRequest("/admin/rulings", "POST", {
        type: "ruling",
        text: "Deathknell resolves before the unit leaves play.",
        targets: [{ kind: "query", query: "t:unit kw:deathknell" }],
      }),
    );

    expect(response.status).toBe(200);
    expect(repository.calls).toHaveLength(1);
    const call = repository.calls[0]!;
    expect(call.name).toBe("admin_create_ruling");
    expect(call.args.p_targets).toEqual([
      {
        kind: "query",
        query: "t:unit kw:deathknell",
        ast: {
          op: "and",
          children: [
            { op: "filter", field: "type", value: "unit" },
            { op: "filter", field: "keyword", value: "deathknell" },
          ],
        },
      },
    ]);
  });

  test("accepts printing and oracle targets on one ruling", async () => {
    const response = await app.handle(
      jsonRequest("/admin/rulings", "POST", {
        type: "note",
        text: "Errata applies to both printings.",
        targets: [
          { kind: "printing", card_id: "card-1" },
          { kind: "printing", card_id: "card-2" },
          { kind: "oracle", oracle_key: "sun disc" },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(repository.calls[0]!.args.p_targets).toEqual([
      { kind: "printing", card_id: "card-1" },
      { kind: "printing", card_id: "card-2" },
      { kind: "oracle", oracle_key: "sun disc" },
    ]);
  });

  test("rejects an unparseable rule naming the offending query, before any write", async () => {
    const response = await app.handle(
      jsonRequest("/admin/rulings", "POST", {
        type: "ruling",
        text: "Text",
        targets: [{ kind: "query", query: "nope:bar" }],
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; code: string };
    expect(body.code).toBe("RULING_RULE_INVALID");
    expect(body.error).toContain("nope:bar");
    expect(repository.calls).toHaveLength(0);
  });

  test("rejects a rule that selects nothing rather than attaching to every card", async () => {
    // `++` is stripped as a meta-keyword before parsing, leaving an empty AST —
    // which would otherwise render as `true` and match the whole catalogue.
    const response = await app.handle(
      jsonRequest("/admin/rulings", "POST", {
        type: "ruling",
        text: "Text",
        targets: [{ kind: "query", query: '""' }],
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()) as { code: string }).toMatchObject({
      code: "RULING_RULE_EMPTY",
    });
    expect(repository.calls).toHaveLength(0);
  });

  test("previews a rule without writing anything", async () => {
    repository.rulePreview = {
      total: 2,
      sample: [
        {
          id: "card-1",
          name: "Sun Disc",
          set_code: "OGN",
          collector_number: "21",
          public_slug: "ogn/21/sun-disc",
        },
      ],
    };

    const response = await app.handle(
      jsonRequest("/admin/rulings/preview", "POST", {
        query: "might>=4 t:unit",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      query: "might>=4 t:unit",
      total: 2,
    });
    expect(repository.previewedAsts).toEqual([
      {
        op: "and",
        children: [
          { op: "numeric", field: "might", cmp: "gte", value: 4 },
          { op: "filter", field: "type", value: "unit" },
        ],
      },
    ]);
    // Preview must never mutate.
    expect(repository.calls).toHaveLength(0);
  });

  test("patching targets replaces the whole list and re-parses each rule", async () => {
    const response = await app.handle(
      jsonRequest(
        "/admin/rulings/99999999-9999-4999-8999-999999999999",
        "PATCH",
        {
          patch: {
            text: "Updated",
            targets: [{ kind: "query", query: "d:fury" }],
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    const call = repository.calls[0]!;
    expect(call.name).toBe("admin_patch_ruling");
    expect(call.args.p_patch).toEqual({
      text: "Updated",
      targets: [
        {
          kind: "query",
          query: "d:fury",
          ast: { op: "filter", field: "domain", value: "fury" },
        },
      ],
    });
  });

  test("omitting targets leaves targeting alone", async () => {
    await app.handle(
      jsonRequest(
        "/admin/rulings/99999999-9999-4999-8999-999999999999",
        "PATCH",
        { patch: { active: false } },
      ),
    );

    expect(repository.calls[0]!.args.p_patch).toEqual({ active: false });
  });

  test("reports the shared-ruling guard as a conflict", async () => {
    repository.nextResult = { ok: false, reason: "ruling_is_shared" };
    const response = await app.handle(
      jsonRequest(
        "/admin/cards/card-1/rulings/99999999-9999-4999-8999-999999999999",
        "PATCH",
        { patch: { apply_to_all_printings: false } },
      ),
    );

    expect(response.status).toBe(409);
    expect((await response.json()) as { code: string }).toMatchObject({
      code: "RULING_IS_SHARED",
    });
  });

  test("passes list filters through and does not default the kind filter", async () => {
    await app.handle(jsonRequest("/admin/rulings?q=deathknell", "GET"));
    expect(repository.rulingsQueries[0]).toMatchObject({
      query: "deathknell",
      kind: undefined,
    });

    await app.handle(jsonRequest("/admin/rulings?kind=query", "GET"));
    expect(repository.rulingsQueries[1]).toMatchObject({ kind: "query" });
  });
});

describe("GET /auth/me admin flag", () => {
  const app = new Elysia({ prefix: "/api/v1" }).use(
    authRoutes({
      protectedAuthPlugin: testAuthPlugin,
      getAdminUserIds: () => ADMIN_ID,
    }),
  );

  test("reports true for configured admins", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { Authorization: "Bearer admin-token" },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { is_admin?: boolean };
    expect(body.is_admin).toBe(true);
  });

  test("reports false for other authenticated users", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/me", {
        headers: { Authorization: "Bearer user-token" },
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { is_admin?: boolean };
    expect(body.is_admin).toBe(false);
  });
});
