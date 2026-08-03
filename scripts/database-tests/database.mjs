import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const repoRoot = path.resolve(import.meta.dirname, "../..");
const databaseUrl =
  process.env.RIFTSEER_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:55433/riftseer";

async function runFile(client, relativePath) {
  const sql = await readFile(path.join(repoRoot, relativePath), "utf8");
  await client.query(sql);
}

/**
 * Every migration, in order — not a named baseline.
 *
 * This used to run one hard-coded filename, so the contract tests kept passing
 * against a schema that no longer existed: the first migration after the
 * baseline simply never reached this database. Migrations are append-only and
 * their timestamp prefixes sort lexically, so the directory listing *is* the
 * schema and cannot fall behind it.
 */
async function runMigrations(client) {
  const dir = path.join(repoRoot, "supabase/migrations");
  const files = (await readdir(dir))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (files.length === 0) throw new Error("no migrations found");
  for (const name of files) {
    await runFile(client, path.join("supabase/migrations", name));
  }
}

function printable(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "t" : "f";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

const mode = process.argv[2];
const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();

  if (mode === "setup") {
    await runFile(client, "scripts/database-tests/auth-stubs.sql");
    await runMigrations(client);
    await runFile(client, "scripts/database-tests/fixture.sql");
    await client.query("NOTIFY pgrst, 'reload schema'");
  } else if (mode === "reseed") {
    await runFile(client, "scripts/database-tests/fixture.sql");
  } else if (mode === "query") {
    const statement = process.argv[3];
    if (!statement) throw new Error("query mode requires a SQL statement");
    const rawResult = await client.query(statement);
    const results = Array.isArray(rawResult) ? rawResult : [rawResult];
    const row = results.at(-1)?.rows?.[0];
    const value = row ? Object.values(row)[0] : undefined;
    process.stdout.write(printable(value));
  } else {
    throw new Error("usage: database.mjs <setup|reseed|query> [sql]");
  }
} finally {
  await client.end().catch(() => undefined);
}
