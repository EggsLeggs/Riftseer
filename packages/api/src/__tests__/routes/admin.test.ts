import { beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import {
  AdminRepositoryError,
  type AdminDataRepository,
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

  queue = {
    send: async (job: AdminImageJob): Promise<void> => {
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
            text: { plain: "Admin text" },
          },
          p_note: "Fix source typo",
          p_actor: ADMIN_ID,
        },
      },
    ]);
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
