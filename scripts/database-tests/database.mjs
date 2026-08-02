import { readFile } from "node:fs/promises";
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
    await runFile(
      client,
      "supabase/migrations/20260810000000_oracle_printing_baseline.sql",
    );
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
