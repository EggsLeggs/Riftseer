import { beforeEach, describe, expect, test } from "bun:test";
import {
  CONFIRMABLE_RECONCILIATION_FIELDS,
  reconciliationFieldScope,
} from "@riftseer/types/reconciliation";
import { Elysia } from "elysia";
import {
  AdminRepositoryError,
  type AdminDataRepository,
  type AdminPrintingDelta,
  type AdminReconciliationEntry,
  type AdminRpcResult,
} from "../../lib/admin-data.ts";
import { createAdminPlugin } from "../../plugins/admin-auth.ts";
import {
  adminRoutes,
  type AdminImageBindings,
  type AdminImageJob,
} from "../../routes/admin.ts";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const ORACLE_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ORACLE_ID = "44444444-4444-4444-8444-444444444444";
const ENTRY_ID = "55555555-5555-4555-8555-555555555555";
const RULING_ID = "66666666-6666-4666-8666-666666666666";
const PRINTING_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";

const tokenResolver = async (token: string) => {
  if (token === "admin-token") return { id: ADMIN_ID, email: "admin@example.com", created_at: "2026-08-01" };
  if (token === "user-token") return { id: USER_ID, email: "user@example.com", created_at: "2026-08-01" };
  return null;
};
const adminPlugin = createAdminPlugin(tokenResolver, () => ADMIN_ID);

type RpcCall = { name: string; args: Record<string, unknown> };

const delta: AdminPrintingDelta = {
  printing_id: PRINTING_ID,
  tags_added: ["Sentinel"],
  tags_removed: [],
  domains_added: [],
  domains_removed: [],
  keywords_added: [],
  keywords_removed: [],
  meta_flags_added: [],
  meta_flags_removed: [],
  name_override: null,
  card_type_override: null,
  supertype_override: null,
  energy_override: null,
  might_override: null,
  power_override: null,
  might_bonus_override: null,
  text_rich_override: null,
  text_plain_override: null,
  equipment_text_override: null,
  cleared_fields: [],
  note: null,
  updated_at: null,
};

function productEntry(): AdminReconciliationEntry {
  return {
    id: ENTRY_ID,
    kind: "unmatched_product",
    source: "tcgplayer",
    fingerprint: "product:652952",
    status: "pending",
    payload: {
      product: {
        product_id: 652952,
        name: "Test Card Alternate Art",
        url: "https://www.tcgplayer.com/product/652952/test",
        image_url: null,
        collector_number: "12a",
        group_id: 1,
        set_code: "OGN",
      },
      printing_id: PRINTING_ID,
      printing_name: "Test Card",
    },
    proposed_printing_id: PRINTING_ID,
    proposed_oracle_id: ORACLE_ID,
    note: null,
    resolved_by: null,
    resolved_at: null,
    created_at: "2026-08-01T00:00:00Z",
    last_seen_at: "2026-08-01T00:00:00Z",
  };
}

class StubRepository implements AdminDataRepository {
  calls: RpcCall[] = [];
  nextResult: AdminRpcResult | null = null;
  nextError: AdminRepositoryError | null = null;
  auditQueries: unknown[] = [];
  reconciliationQueries: unknown[] = [];
  printingQueries: unknown[] = [];
  rulingsQueries: unknown[] = [];
  previewed: Array<{ ast: unknown; limit: number }> = [];
  entry: AdminReconciliationEntry | null = productEntry();
  printingDelta: AdminPrintingDelta | null = delta;
  persistedImages: unknown[] = [];
  takenPrintingSlugs = new Set<string>();
  takenOracleSlugs = new Set<string>();

  async callRpc(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args });
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }
    const result = this.nextResult ?? {
      ok: true,
      oracle_id: ORACLE_ID,
      ruling: { id: RULING_ID },
      legalities_removed: 2,
      overrides_removed: 1,
    };
    this.nextResult = null;
    return result;
  }

  async getSlugPrinting() {
    return { id: PRINTING_ID, name: "Test Card", setCode: "OGN", collectorNumber: "12" };
  }
  async getOracleName(id: string) { return id === ORACLE_ID ? "Test Card" : null; }
  async getPrintingOracleId(id: string) { return id === PRINTING_ID ? ORACLE_ID : null; }
  async getTakenPrintingSlugs() { return this.takenPrintingSlugs; }
  async getTakenOracleSlugs() { return this.takenOracleSlugs; }
  async setPrintingImageSource(printingId: string, media: unknown, actorId: string) {
    this.persistedImages.push({ printingId, media, actorId });
    return printingId === PRINTING_ID;
  }
  async listAuditLog(query: unknown) {
    this.auditQueries.push(query);
    return { entries: [], total: 0 };
  }
  async listFormats() {
    return [{
      id: "format", code: "standard", name: "Standard", sort_order: 0, active: true,
      legality_count: 2, override_count: 1,
      // A null bound is unconstrained, not zero — the sideboard rule below is
      // the shape that distinction has to survive the wire in.
      zone_rules: [{ zone: "sideboard" as const, min_count: null, max_count: 10, copy_limit: 3 }],
      severity_overrides: [{ status: "restricted" as const, severity: "warning" as const }],
    }];
  }
  async getStats() {
    return { sets: 8, oracles: 928, printings: 1304, pendingReview: 167 };
  }
  async listPrintings(query: unknown) {
    this.printingQueries.push(query);
    return {
      printings: [{
        id: PRINTING_ID, name: "Test Card", oracle_id: ORACLE_ID, is_token: false,
        set_code: "OGN", collector_number: "12", rarity: "Rare",
        public_slug: "ogn/12/test-card", source: "riftcodex", deleted_at: null,
        locked_fields: ["rarity"], oracle_locked_fields: ["might"],
        delta_source: "admin" as const, has_hosted_image: true,
      }],
      total: 1,
    };
  }
  async listPrintingLegalities(id: string) {
    return id === PRINTING_ID ? {
      printing_id: PRINTING_ID,
      oracle_id: ORACLE_ID,
      entries: [{ format_id: "format", format_code: "standard", format_name: "Standard", status: "banned" as const, scope: "oracle" as const, note: "Banned in the 2026-07 update" }],
    } : null;
  }
  async listPrintingRulings(id: string) {
    return id === PRINTING_ID ? {
      printing_id: PRINTING_ID,
      oracle_id: ORACLE_ID,
      entries: [{ id: RULING_ID, type: "ruling" as const, text: "Rule", dated: null, source: null, active: true, scope: "rule" as const, shared: true, target_count: 1, created_at: null, updated_at: null }],
    } : null;
  }
  async getPrintingDelta(id: string) {
    return id === PRINTING_ID ? { printing_id: PRINTING_ID, delta: this.printingDelta } : null;
  }
  async listOracleRelationships(id: string) {
    return id === ORACLE_ID ? {
      oracle_id: ORACLE_ID,
      outgoing: [{ kind: "makes_token" as const, oracle_id: OTHER_ORACLE_ID, name: "Token", slug: "token", source: "ingest" as const }],
      incoming: [],
    } : null;
  }
  async listReconciliation(query: unknown) {
    this.reconciliationQueries.push(query);
    return { entries: this.entry ? [this.entry] : [], total: this.entry ? 1 : 0, counts: { pending: 1, confirmed: 0, dismissed: 0 } };
  }
  async getReconciliationEntry() { return this.entry; }
  async listRulings(query: unknown) {
    this.rulingsQueries.push(query);
    return { rulings: [], total: 0 };
  }
  async previewRule(ast: unknown, limit: number) {
    this.previewed.push({ ast, limit });
    return { total: 1, sample: [{ id: PRINTING_ID, name: "Test Card", set_code: "OGN", collector_number: "12", public_slug: "ogn/12/test-card" }] };
  }
}

class StubImages implements AdminImageBindings {
  stored: string[] = [];
  deleted: string[] = [];
  jobs: AdminImageJob[] = [];
  baseUrl = "https://img.riftseer.com";
  bucket = {
    put: async (key: string) => { this.stored.push(key); return {}; },
    delete: async (key: string) => { this.deleted.push(key); },
  };
  queue = { send: async (job: AdminImageJob) => { this.jobs.push(job); } };
}

function request(path: string, method = "GET", body?: unknown, token = "admin-token") {
  return new Request(`http://localhost/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("admin API contracts", () => {
  let repository: StubRepository;
  let images: StubImages;
  let app: ReturnType<typeof makeApp>;

  function makeApp() {
    return new Elysia({ prefix: "/api/v1" }).use(adminRoutes({ repository, imageBindings: images, adminAuthPlugin: adminPlugin }));
  }
  beforeEach(() => {
    repository = new StubRepository();
    images = new StubImages();
    app = makeApp();
  });

  test("auth gate rejects missing and non-admin tokens before any repository call", async () => {
    const path = `/admin/oracles/${ORACLE_ID}`;
    expect((await app.handle(new Request(`http://localhost/api/v1${path}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patch: { power: 1 } }),
    }))).status).toBe(401);
    expect((await app.handle(request(path, "PATCH", { patch: { power: 1 } }, "user-token"))).status).toBe(403);
    expect(repository.calls).toEqual([]);
  });

  test("confirmable reconciliation fields remain exhaustive", () => {
    expect([...CONFIRMABLE_RECONCILIATION_FIELDS]).toEqual([
      "collector_number", "released_at", "rarity", "type", "energy", "might", "power",
    ]);
  });

  // reconciliationFieldScope() tells the admin page which level a confirm will
  // write; buildConfirmPatch() decides where it actually lands. Nothing in the
  // type system holds those together, so assert it for every field rather than
  // leaving a comment asking the next edit to keep them in step.
  test.each([...CONFIRMABLE_RECONCILIATION_FIELDS])(
    "confirming a %s diff writes at the level reconciliationFieldScope names",
    async (field) => {
      const value = field === "released_at" ? "2026-01-01" : "3";
      repository.entry = {
        ...productEntry(),
        kind: "field_diff",
        fingerprint: `diff:${field}:${PRINTING_ID}:${value}`,
        payload: { field, current_value: "1", proposed_value: value, printing_id: PRINTING_ID },
        // A real field_diff never carries one; the API must derive it.
        proposed_oracle_id: null,
      };
      repository.calls = [];

      const response = await app.handle(
        request(`/admin/reconciliation/${ENTRY_ID}/confirm`, "POST", {}),
      );
      expect(response.status).toBe(200);

      const patchedOracle = repository.calls.some((call) => call.name === "admin_patch_oracle");
      expect(patchedOracle).toBe(reconciliationFieldScope(field) === "oracle");

      const resolve = repository.calls.find(
        (call) => call.name === "admin_resolve_reconciliation_entry",
      );
      expect(resolve).toBeDefined();
      // An oracle-scoped confirm must not also smuggle the field onto the printing.
      expect(resolve!.args.p_patch).toEqual(
        reconciliationFieldScope(field) === "oracle" ? {} : { [field]: value },
      );
    },
  );

  test("audit log forwards a bounded, trimmed query", async () => {
    const response = await app.handle(request("/admin/audit-log?limit=999&offset=-2&action=%20oracle.patch%20&target_type=oracle"));
    expect(response.status).toBe(200);
    expect(repository.auditQueries[0]).toEqual({ limit: 200, offset: 0, action: "oracle.patch", targetType: "oracle", targetId: undefined, actorId: undefined });
  });

  test("stats reports oracles and printings separately", async () => {
    const response = await app.handle(request("/admin/stats"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      sets: 8, oracles: 928, printings: 1304, pending_review: 167,
    });
  });

  test("printing list defaults to live, bounds the page and upper-cases the set", async () => {
    const response = await app.handle(request("/admin/printings?limit=999&offset=-5&set=%20ogn%20&q=%20vex%20"));
    expect(response.status).toBe(200);
    expect(repository.printingQueries[0]).toEqual({
      limit: 200, offset: 0, state: "live", q: "vex", setCode: "OGN",
    });
  });

  test("printing list forwards an explicit state", async () => {
    await app.handle(request("/admin/printings?state=deleted"));
    expect(repository.printingQueries[0]).toMatchObject({ state: "deleted" });
  });

  test("reconciliation list defaults to pending and preserves source/kind filters", async () => {
    const response = await app.handle(request("/admin/reconciliation?kind=field_diff&source=gallery&limit=999"));
    expect(response.status).toBe(200);
    expect(repository.reconciliationQueries[0]).toEqual({ limit: 200, offset: 0, status: "pending", kind: "field_diff", source: "gallery" });
  });

  test("confirming an unmatched product writes a locked printing patch", async () => {
    const response = await app.handle(request(`/admin/reconciliation/${ENTRY_ID}/confirm`, "POST", { note: "matched" }));
    expect(response.status).toBe(200);
    expect(repository.calls).toEqual([{ name: "admin_resolve_reconciliation_entry", args: {
      p_entry_id: ENTRY_ID,
      p_action: "confirm",
      p_printing_id: PRINTING_ID,
      p_patch: { tcgplayer_id: "652952", tcgplayer_url: "https://www.tcgplayer.com/product/652952/test" },
      p_note: "matched",
      p_actor: ADMIN_ID,
    } }]);
  });

  test("confirming an oracle field patches the oracle before closing the entry", async () => {
    repository.entry = { ...productEntry(), kind: "field_diff", payload: { field: "energy", current_value: "2", proposed_value: "3", oracle_id: ORACLE_ID }, proposed_printing_id: null };
    const response = await app.handle(request(`/admin/reconciliation/${ENTRY_ID}/confirm`, "POST", {}));
    expect(response.status).toBe(200);
    expect(repository.calls.map((call) => call.name)).toEqual(["admin_patch_oracle", "admin_resolve_reconciliation_entry"]);
    expect(repository.calls[0]?.args.p_patch).toEqual({ energy: 3 });
  });

  test("unsupported reconciliation fields are rejected without a write", async () => {
    repository.entry = { ...productEntry(), kind: "field_diff", payload: { field: "text", proposed_value: "changed" } };
    const response = await app.handle(request(`/admin/reconciliation/${ENTRY_ID}/confirm`, "POST", {}));
    expect(response.status).toBe(400);
    expect(repository.calls).toEqual([]);
  });

  test("dismissing a reconciliation entry never carries a card patch", async () => {
    const response = await app.handle(request(`/admin/reconciliation/${ENTRY_ID}/dismiss`, "POST", { note: "expected" }));
    expect(response.status).toBe(200);
    expect(repository.calls[0]).toEqual({ name: "admin_resolve_reconciliation_entry", args: { p_entry_id: ENTRY_ID, p_action: "dismiss", p_printing_id: null, p_patch: {}, p_note: "expected", p_actor: ADMIN_ID } });
  });

  test("creating an oracle normalizes its keys and collision-suffixes its slug", async () => {
    repository.takenOracleSlugs.add("test-card");
    const response = await app.handle(request("/admin/oracles", "POST", { definition: { name: "  Test-Card  ", might_bonus: 0 } }));
    expect(response.status).toBe(200);
    expect(repository.calls[0]).toEqual({ name: "admin_create_oracle", args: expect.objectContaining({ p_oracle_key: "test card", p_slug: "test-card-2", p_definition: expect.objectContaining({ name: "Test-Card", name_normalized: "test card", might_bonus: 0 }), p_actor: ADMIN_ID }) });
  });

  test("patching an oracle derives name fields and preserves might_bonus: 0", async () => {
    const response = await app.handle(request(`/admin/oracles/${ORACLE_ID}`, "PATCH", { patch: { name: "  New-Name ", might_bonus: 0 } }));
    expect(response.status).toBe(200);
    expect(repository.calls[0]).toEqual({ name: "admin_patch_oracle", args: { p_oracle_id: ORACLE_ID, p_patch: { name: "New-Name", name_normalized: "new name", oracle_key: "new name", might_bonus: 0 }, p_actor: ADMIN_ID } });
  });

  test("oracle delete and restore call their soft-delete RPCs", async () => {
    expect((await app.handle(request(`/admin/oracles/${ORACLE_ID}`, "DELETE", { reason: "duplicate" }))).status).toBe(200);
    expect((await app.handle(request(`/admin/oracles/${ORACLE_ID}/restore`, "POST"))).status).toBe(200);
    expect(repository.calls.map((call) => call.name)).toEqual(["admin_delete_oracle", "admin_restore_oracle"]);
  });

  test("oracle relationships expose reverse edges and replace only unique non-self edges", async () => {
    const listed = await app.handle(request(`/admin/oracles/${ORACLE_ID}/relationships`));
    expect((await listed.json() as any).outgoing[0].kind).toBe("makes_token");
    const body = { entries: [{ kind: "signature", to_oracle_id: OTHER_ORACLE_ID }] };
    expect((await app.handle(request(`/admin/oracles/${ORACLE_ID}/relationships`, "PUT", body))).status).toBe(200);
    expect(repository.calls[0]?.name).toBe("admin_set_oracle_relationships");
    expect((await app.handle(request(`/admin/oracles/${ORACLE_ID}/relationships`, "PUT", { entries: [{ kind: "signature", to_oracle_id: ORACLE_ID }] }))).status).toBe(400);
  });

  test("creating a printing generates and pins a collision-safe slug", async () => {
    repository.takenPrintingSlugs.add("ogn/12/test-card");
    const response = await app.handle(request("/admin/printings", "POST", { id: PRINTING_ID, oracle_id: ORACLE_ID, set_code: "ogn", definition: { collector_number: "12", rarity: "Rare" } }));
    expect(response.status).toBe(200);
    expect(repository.calls[0]).toEqual({ name: "admin_create_printing", args: expect.objectContaining({ p_printing_id: PRINTING_ID, p_oracle_id: ORACLE_ID, p_set_code: "OGN", p_public_slug: "ogn/12/test-card-2", p_actor: ADMIN_ID }) });
  });

  test("patching a printing uppercases a moved set and keeps rarity printing-level", async () => {
    const response = await app.handle(request(`/admin/printings/${PRINTING_ID}`, "PATCH", { patch: { set_code: "ven", rarity: "Showcase" } }));
    expect(response.status).toBe(200);
    expect(repository.calls[0]?.args.p_patch).toEqual({ set_code: "VEN", rarity: "Showcase" });
  });

  test("printing delete and restore call their scoped RPCs", async () => {
    await app.handle(request(`/admin/printings/${PRINTING_ID}`, "DELETE", { reason: "bad scan" }));
    await app.handle(request(`/admin/printings/${PRINTING_ID}/restore`, "POST"));
    expect(repository.calls.map((call) => call.name)).toEqual(["admin_delete_printing", "admin_restore_printing"]);
  });

  test("regenerating a printing slug uses resolved name fields and collision suffixing", async () => {
    repository.takenPrintingSlugs.add("ogn/12/test-card");
    const response = await app.handle(request(`/admin/printings/${PRINTING_ID}/regenerate-slug`, "POST"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ public_slug: "ogn/12/test-card-2" });
    expect(repository.calls[0]?.name).toBe("admin_set_printing_slug");
  });

  test("delta read, write, and clear share the admin delta contract", async () => {
    expect((await (await app.handle(request(`/admin/printings/${PRINTING_ID}/deltas`))).json() as any).delta.tags_added).toEqual(["Sentinel"]);
    await app.handle(request(`/admin/printings/${PRINTING_ID}/deltas`, "PUT", { delta: { tags_added: ["Scout"], cleared_fields: ["energy"] } }));
    await app.handle(request(`/admin/printings/${PRINTING_ID}/deltas`, "PUT", { delta: null }));
    expect(repository.calls.map((call) => call.args.p_delta)).toEqual([{ tags_added: ["Scout"], cleared_fields: ["energy"] }, null]);
  });

  test("image upload stores a content-addressed source, persists it, and queues variants", async () => {
    const form = new FormData();
    form.set("file", new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")], "card.png", { type: "image/png" }));
    form.set("accessibility_text", "Updated art");
    const response = await app.handle(new Request(`http://localhost/api/v1/admin/printings/${PRINTING_ID}/image`, { method: "POST", headers: { Authorization: "Bearer admin-token" }, body: form }));
    expect(response.status).toBe(202);
    expect(images.stored[0]).toMatch(new RegExp(`^cards/${PRINTING_ID}/uploads/[a-f0-9]{64}$`));
    expect(repository.persistedImages).toHaveLength(1);
    expect(images.jobs[0]).toMatchObject({ printingId: PRINTING_ID, sourceProvider: "admin" });
  });

  test("printing legalities expose resolved precedence", async () => {
    const response = await app.handle(request(`/admin/printings/${PRINTING_ID}/legalities`));
    expect(response.status).toBe(200);
    expect((await response.json() as any).entries[0]).toMatchObject({ status: "banned", scope: "oracle" });
  });

  test("legality writes choose printing or oracle scope and null clears to default", async () => {
    await app.handle(request(`/admin/printings/${PRINTING_ID}/legalities`, "PUT", { format_code: "STANDARD", status: "default" }));
    await app.handle(request(`/admin/printings/${PRINTING_ID}/legalities`, "PUT", { format_code: "standard", status: "banned", apply_to_all_printings: true }));
    expect(repository.calls[0]?.args).toMatchObject({ p_oracle_id: null, p_printing_id: PRINTING_ID, p_status: null });
    expect(repository.calls[1]?.args).toMatchObject({ p_oracle_id: ORACLE_ID, p_printing_id: null, p_status: "banned" });
  });

  test("legality accepts restricted with a note, and clearing takes the note with it", async () => {
    const restricted = await app.handle(request(`/admin/printings/${PRINTING_ID}/legalities`, "PUT",
      { format_code: "standard", status: "restricted", note: "  One copy as of 2026-07  " }));
    expect(restricted.status).toBe(200);
    expect(await restricted.json()).toMatchObject({ status: "restricted", note: "One copy as of 2026-07" });
    expect(repository.calls[0]?.args).toMatchObject({ p_status: "restricted", p_note: "One copy as of 2026-07" });

    // A cleared status deletes the row the note lives on, so the response must
    // not claim a note survived it.
    const cleared = await app.handle(request(`/admin/printings/${PRINTING_ID}/legalities`, "PUT",
      { format_code: "standard", status: "default", note: "orphan" }));
    expect(await cleared.json()).toMatchObject({ status: null, note: null });
  });

  test("format zone rules keep null bounds as unconstrained rather than zero", async () => {
    const listed = await (await app.handle(request("/admin/formats"))).json() as any;
    expect(listed.formats[0].zone_rules[0]).toEqual({ zone: "sideboard", min_count: null, max_count: 10, copy_limit: 3 });
    expect(listed.formats[0].severity_overrides[0]).toEqual({ status: "restricted", severity: "warning" });

    const saved = await app.handle(request("/admin/formats/STANDARD/zone-rules/main", "PUT", { max_count: 40, copy_limit: 3 }));
    expect(saved.status).toBe(200);
    expect(repository.calls[0]).toEqual({
      name: "admin_set_format_zone_rule",
      args: { p_code: "standard", p_zone: "main", p_min_count: null, p_max_count: 40, p_copy_limit: 3, p_actor: ADMIN_ID },
    });

    const removed = await app.handle(request("/admin/formats/standard/zone-rules/runes", "DELETE"));
    expect(removed.status).toBe(200);
    expect(repository.calls[1]).toEqual({
      name: "admin_delete_format_zone_rule",
      args: { p_code: "standard", p_zone: "runes", p_actor: ADMIN_ID },
    });
  });

  test("an unknown zone never reaches the database", async () => {
    const response = await app.handle(request("/admin/formats/standard/zone-rules/graveyard", "PUT", { max_count: 1 }));
    expect(response.status).toBe(400);
    expect(repository.calls).toHaveLength(0);
  });

  test("severity default clears the override instead of storing one", async () => {
    await app.handle(request("/admin/formats/STANDARD/severities/restricted", "PUT", { severity: "error" }));
    await app.handle(request("/admin/formats/standard/severities/banned", "PUT", { severity: "default" }));
    expect(repository.calls[0]?.args).toMatchObject({ p_code: "standard", p_status: "restricted", p_severity: "error" });
    expect(repository.calls[1]?.args).toMatchObject({ p_status: "banned", p_severity: null });
  });

  test("rejected format rules map their reason to a status the UI can render", async () => {
    repository.nextResult = { ok: false, reason: "invalid_range" };
    const range = await app.handle(request("/admin/formats/standard/zone-rules/main", "PUT", { min_count: 9, max_count: 4 }));
    expect(range.status).toBe(400);
    expect(await range.json()).toMatchObject({ code: "INVALID_RANGE" });

    repository.nextResult = { ok: false, reason: "format_not_found" };
    const missing = await app.handle(request("/admin/formats/nope/severities/legal", "PUT", { severity: "warning" }));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "FORMAT_NOT_FOUND" });
  });

  test("printing rulings report the target scope and shared guard", async () => {
    const response = await app.handle(request(`/admin/printings/${PRINTING_ID}/rulings`));
    expect((await response.json() as any).entries[0]).toMatchObject({ scope: "rule", shared: true });
  });

  test("formats list and create include cascade counts and normalize the code", async () => {
    expect((await (await app.handle(request("/admin/formats"))).json() as any).formats[0].legality_count).toBe(2);
    await app.handle(request("/admin/formats", "POST", { code: "Standard_2", name: " Standard 2 " }));
    expect(repository.calls[0]).toEqual({ name: "admin_create_format", args: { p_code: "standard_2", p_name: "Standard 2", p_sort_order: null, p_active: true, p_actor: ADMIN_ID } });
  });

  test("format reorder, patch, and delete each preserve their RPC contract", async () => {
    await app.handle(request("/admin/formats/order", "PUT", { codes: ["STANDARD", "eternal"] }));
    await app.handle(request("/admin/formats/STANDARD", "PATCH", { patch: { name: " Standard " } }));
    const deleted = await app.handle(request("/admin/formats/STANDARD", "DELETE"));
    expect(repository.calls.map((call) => call.name)).toEqual(["admin_reorder_formats", "admin_patch_format", "admin_delete_format"]);
    expect(await deleted.json()).toMatchObject({ legalities_removed: 2, overrides_removed: 1 });
  });

  test("ruling list does not invent a target-kind filter", async () => {
    await app.handle(request("/admin/rulings?q=%20resolve%20"));
    expect(repository.rulingsQueries[0]).toEqual({ limit: 50, offset: 0, query: "resolve", kind: undefined });
  });

  test("ruling preview parses the shared search grammar without writing", async () => {
    const response = await app.handle(request("/admin/rulings/preview", "POST", { query: "t:unit", limit: 7 }));
    expect(response.status).toBe(200);
    expect(repository.previewed[0]).toMatchObject({ ast: { op: "filter", field: "type", value: "unit" }, limit: 7 });
    expect(repository.calls).toEqual([]);
  });

  test("ruling creation stores direct targets and a parsed query AST", async () => {
    const response = await app.handle(request("/admin/rulings", "POST", { type: "ruling", text: " Rule text ", targets: [{ kind: "oracle", oracle_id: ORACLE_ID }, { kind: "query", query: "r:showcase" }] }));
    expect(response.status).toBe(200);
    expect(repository.calls[0]?.name).toBe("admin_create_ruling");
    expect(repository.calls[0]?.args.p_targets).toEqual([{ kind: "oracle", oracle_id: ORACLE_ID }, { kind: "query", query: "r:showcase", ast: { op: "filter", field: "rarity", value: "showcase" } }]);
  });

  test("ruling patch replaces parsed targets and delete removes the ruling", async () => {
    await app.handle(request(`/admin/rulings/${RULING_ID}`, "PATCH", { patch: { targets: [{ kind: "printing", printing_id: PRINTING_ID }] } }));
    await app.handle(request(`/admin/rulings/${RULING_ID}`, "DELETE"));
    expect(repository.calls.map((call) => call.name)).toEqual(["admin_patch_ruling", "admin_delete_ruling"]);
  });

  test("set create, patch, and delete normalize codes and preserve lock-bearing payloads", async () => {
    await app.handle(request("/admin/sets", "POST", { set_code: "tst", definition: { set_name: " Test Set ", parent_set_code: "ogn" } }));
    await app.handle(request("/admin/sets/tst", "PATCH", { patch: { set_name: " Renamed ", parent_set_code: "ven" } }));
    await app.handle(request("/admin/sets/tst", "DELETE", { reason: "unused" }));
    expect(repository.calls.map((call) => call.name)).toEqual(["admin_create_set", "admin_patch_set", "admin_delete_set"]);
    expect(repository.calls[0]?.args).toMatchObject({ p_set_code: "TST", p_definition: { set_name: "Test Set", parent_set_code: "OGN" } });
    expect(repository.calls[1]?.args.p_patch).toEqual({ set_name: "Renamed", parent_set_code: "VEN" });
  });

  test("known RPC rejection reasons map to stable machine errors", async () => {
    repository.nextResult = { ok: false, reason: "set_not_empty" };
    const response = await app.handle(request("/admin/sets/OGN", "DELETE"));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Move or delete every printing in the set first", code: "SET_NOT_EMPTY" });
  });

  test("repository exceptions never leak database messages", async () => {
    repository.nextError = new AdminRepositoryError("secret constraint detail", "XX000");
    const response = await app.handle(request(`/admin/oracles/${ORACLE_ID}`, "PATCH", { patch: { power: 2 } }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Admin operation failed", code: "ADMIN_OPERATION_FAILED" });
  });
});
