/**
 * An in-memory stand-in for the two Supabase clients the account routes use.
 *
 * Tables are arrays of rows behind the handful of PostgREST verbs the routes
 * call (eq, neq, in, order, range, single, maybeSingle, count and head) and
 * the two error codes they branch on: `23505` for a unique violation and
 * `PGRST116` for "no rows". Auth is a token map with sign-in, sign-up and
 * refresh answers. It is cast to the real client type at the seam; the routes
 * use nothing it lacks, and a call it cannot answer throws rather than lies.
 */

import type { SupabaseClients } from "../lib/supabase";

export type Row = Record<string, unknown>;

export interface FakeError {
  code: string;
  message: string;
  status?: number;
}

interface QueryResult {
  data: unknown;
  error: FakeError | null;
  count: number | null;
}

export interface FakeAuthUser {
  id: string;
  email?: string;
  created_at: string;
}

interface TableOptions {
  /** Column sets that must be unique, mirroring the migration's constraints. */
  unique?: string[][];
  /** Column defaults applied on insert and upsert, as the database would. */
  defaults?: () => Row;
}

const NO_ROWS: FakeError = {
  code: "PGRST116",
  message: "JSON object requested, multiple (or no) rows returned",
};

class FakeQuery implements PromiseLike<QueryResult> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private columns: string[] | null = null;
  private filters: Array<(row: Row) => boolean> = [];
  private payload: Row[] = [];
  private conflictColumns: string[] = [];
  private wantCount = false;
  private headOnly = false;
  private ordering: { column: string; ascending: boolean } | null = null;
  private window: { from: number; to: number } | null = null;
  private cardinality: "single" | "maybe" | null = null;

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
  ) {}

  select(columns = "*", options: { count?: string; head?: boolean } = {}) {
    if (this.op === "select" && columns !== "*") {
      this.columns = columns.split(",").map((column) => column.trim());
    }
    if (options.count) this.wantCount = true;
    if (options.head) this.headOnly = true;
    return this;
  }

  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(values: Row) {
    this.op = "update";
    this.payload = [values];
    return this;
  }

  delete(options: { count?: string } = {}) {
    this.op = "delete";
    if (options.count) this.wantCount = true;
    return this;
  }

  upsert(row: Row, options: { onConflict?: string } = {}) {
    this.op = "upsert";
    this.payload = [row];
    this.conflictColumns = (options.onConflict ?? "")
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean);
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.ordering = { column, ascending: options.ascending ?? true };
    return this;
  }

  range(from: number, to: number) {
    this.window = { from, to };
    return this;
  }

  single() {
    this.cardinality = "single";
    return this;
  }

  maybeSingle() {
    this.cardinality = "maybe";
    return this;
  }

  // A PostgREST builder is a thenable by design: the routes `await` the chain.
  // oxlint-disable-next-line unicorn/no-thenable
  then<A = QueryResult, B = never>(
    onfulfilled?: ((value: QueryResult) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }

  private run(): QueryResult {
    const rows = this.db.rows(this.table);
    const matching = rows.filter((row) => this.filters.every((filter) => filter(row)));

    switch (this.op) {
      case "select":
        return this.read(matching);
      case "insert": {
        for (const row of this.payload) {
          const next = this.db.withDefaults(this.table, row);
          const clash = this.db.violation(this.table, next);
          if (clash) return { data: null, error: clash, count: null };
          rows.push(next);
        }
        return { data: null, error: null, count: null };
      }
      case "update": {
        for (const row of matching) {
          const next = { ...row, ...this.payload[0] };
          const clash = this.db.violation(this.table, next, row);
          if (clash) return { data: null, error: clash, count: null };
        }
        for (const row of matching) Object.assign(row, this.payload[0]);
        return { data: null, error: null, count: null };
      }
      case "delete": {
        this.db.tables.set(
          this.table,
          rows.filter((row) => !matching.includes(row)),
        );
        return { data: null, error: null, count: this.wantCount ? matching.length : null };
      }
      case "upsert": {
        const row = this.payload[0];
        const existing = rows.find((candidate) =>
          this.conflictColumns.every((column) => candidate[column] === row[column]),
        );
        if (existing) Object.assign(existing, row);
        else rows.push(this.db.withDefaults(this.table, row));
        return { data: null, error: null, count: null };
      }
    }
  }

  private read(matching: Row[]): QueryResult {
    let found = matching;
    if (this.ordering) {
      const { column, ascending } = this.ordering;
      found = [...found].sort((a, b) => {
        const left = String(a[column]);
        const right = String(b[column]);
        const order = left < right ? -1 : left > right ? 1 : 0;
        return ascending ? order : -order;
      });
    }
    const count = this.wantCount ? found.length : null;
    if (this.window) found = found.slice(this.window.from, this.window.to + 1);
    const projected = found.map((row) => this.project(row));

    if (this.cardinality === "single") {
      return projected.length === 1
        ? { data: projected[0], error: null, count }
        : { data: null, error: NO_ROWS, count };
    }
    if (this.cardinality === "maybe") {
      return projected.length > 1
        ? { data: null, error: NO_ROWS, count }
        : { data: projected[0] ?? null, error: null, count };
    }
    return { data: this.headOnly ? null : projected, error: null, count };
  }

  private project(row: Row): Row {
    if (!this.columns) return { ...row };
    return Object.fromEntries(this.columns.map((column) => [column, row[column] ?? null]));
  }
}

interface Credential {
  password: string;
  user: FakeAuthUser;
}

interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

class FakeAuth {
  /** Bearer token → the user it authenticates. */
  readonly tokens = new Map<string, FakeAuthUser>();
  /** Registered accounts by id. */
  readonly users = new Map<string, FakeAuthUser>();
  readonly appMetadata = new Map<string, Row>();
  readonly resetRequests: string[] = [];
  /** Sign-up returns no session when email confirmation is on, as Supabase does. */
  requireEmailConfirmation = false;

  private readonly credentials = new Map<string, Credential>();
  private readonly refreshTokens = new Map<string, FakeAuthUser>();
  private sessions = 0;

  constructor(private readonly db: FakeSupabase) {}

  /** Registers an account with a password and one bearer token. */
  createUser(email: string, password: string, id = crypto.randomUUID()) {
    const user: FakeAuthUser = { id, email, created_at: "2026-08-01T00:00:00.000Z" };
    this.users.set(id, user);
    this.credentials.set(email, { password, user });
    const token = `token-${id}`;
    this.tokens.set(token, user);
    return { user, token };
  }

  passwordFor(email: string): string | undefined {
    return this.credentials.get(email)?.password;
  }

  private session(user: FakeAuthUser): Session {
    const serial = ++this.sessions;
    const session = {
      access_token: `access-${serial}`,
      refresh_token: `refresh-${serial}`,
      expires_in: 3600,
      token_type: "bearer",
    };
    this.tokens.set(session.access_token, user);
    this.refreshTokens.set(session.refresh_token, user);
    return session;
  }

  async getUser(token: string) {
    const user = this.tokens.get(token) ?? null;
    return {
      data: { user },
      error: user ? null : { message: "invalid JWT", status: 401, code: "bad_jwt" },
    };
  }

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const credential = this.credentials.get(email);
    if (!credential || credential.password !== password) {
      return {
        data: { user: null, session: null },
        error: { message: "Invalid login credentials", status: 400, code: "invalid_credentials" },
      };
    }
    return {
      data: { user: credential.user, session: this.session(credential.user) },
      error: null,
    };
  }

  async signUp({ email, password }: { email: string; password: string }) {
    if (this.credentials.has(email)) {
      return {
        data: { user: null, session: null },
        error: { message: "User already registered", status: 422, code: "user_already_exists" },
      };
    }
    const { user } = this.createUser(email, password);
    return {
      data: { user, session: this.requireEmailConfirmation ? null : this.session(user) },
      error: null,
    };
  }

  async refreshSession({ refresh_token }: { refresh_token: string }) {
    const user = this.refreshTokens.get(refresh_token);
    if (!user) {
      return {
        data: { user: null, session: null },
        error: { message: "Invalid Refresh Token", status: 400, code: "refresh_token_not_found" },
      };
    }
    this.refreshTokens.delete(refresh_token);
    return { data: { user, session: this.session(user) }, error: null };
  }

  async resetPasswordForEmail(email: string) {
    this.resetRequests.push(email);
    return { data: {}, error: null };
  }

  readonly admin = {
    updateUserById: async (id: string, attributes: { app_metadata?: Row; password?: string }) => {
      const user = this.users.get(id);
      if (!user) {
        return {
          data: { user: null },
          error: { message: "User not found", status: 404, code: "user_not_found" },
        };
      }
      if (attributes.app_metadata) {
        this.appMetadata.set(id, { ...this.appMetadata.get(id), ...attributes.app_metadata });
      }
      if (attributes.password !== undefined && user.email) {
        const credential = this.credentials.get(user.email);
        if (credential) credential.password = attributes.password;
      }
      return { data: { user }, error: null };
    },
    deleteUser: async (id: string) => {
      const user = this.users.get(id);
      if (!user) {
        return {
          data: { user: null },
          error: { message: "User not found", status: 404, code: "user_not_found" },
        };
      }
      this.users.delete(id);
      if (user.email) this.credentials.delete(user.email);
      for (const [token, holder] of this.tokens) if (holder.id === id) this.tokens.delete(token);
      // `profiles.id` references `auth.users` with ON DELETE CASCADE.
      this.db.tables.set(
        "profiles",
        this.db.rows("profiles").filter((row) => row.id !== id),
      );
      return { data: { user }, error: null };
    },
  };
}

export class FakeSupabase {
  readonly tables = new Map<string, Row[]>();
  readonly auth = new FakeAuth(this);
  private readonly options = new Map<string, TableOptions>();
  private clock = 0;

  /** Declares a table; undeclared tables still work, with no constraints or defaults. */
  table(name: string, options: TableOptions = {}) {
    this.tables.set(name, []);
    this.options.set(name, options);
    return this;
  }

  rows(name: string): Row[] {
    let rows = this.tables.get(name);
    if (!rows) {
      rows = [];
      this.tables.set(name, rows);
    }
    return rows;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  /** A monotonic ISO timestamp, so `order("created_at")` is deterministic. */
  now(): string {
    this.clock += 1;
    return new Date(Date.UTC(2026, 7, 1, 0, 0, this.clock)).toISOString();
  }

  withDefaults(table: string, row: Row): Row {
    return { ...this.options.get(table)?.defaults?.(), ...row };
  }

  violation(table: string, candidate: Row, except?: Row): FakeError | null {
    for (const columns of this.options.get(table)?.unique ?? []) {
      const clash = this.rows(table).some(
        (row) => row !== except && columns.every((column) => row[column] === candidate[column]),
      );
      if (clash) {
        return {
          code: "23505",
          message: `duplicate key value violates unique constraint on ${table}(${columns.join(", ")})`,
        };
      }
    }
    return null;
  }

  /** The one fake plays both clients; the routes differ only in which they null-check. */
  get clients(): SupabaseClients {
    const client = this as unknown as NonNullable<SupabaseClients["authClient"]>;
    return { authClient: client, authAdminClient: client };
  }
}

/** The account tables with the constraints and defaults the routes rely on. */
export function createFakeSupabase(): FakeSupabase {
  const fake = new FakeSupabase();
  fake
    .table("profiles", {
      unique: [["id"], ["handle"]],
      defaults: () => ({
        bio: null,
        pronouns: [],
        social_links: {},
        created_at: fake.now(),
        updated_at: null,
      }),
    })
    .table("follows", {
      unique: [["follower_id", "following_id"]],
      defaults: () => ({ created_at: fake.now() }),
    })
    .table("linked_accounts", { unique: [["user_id", "provider"]] });
  return fake;
}
