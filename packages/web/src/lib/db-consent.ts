import { Kysely } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";
import { env } from "./env";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: Kysely<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDb(): Kysely<any> {
  if (!_db) {
    if (!env.C15T_DATABASE_URL) {
      throw new Error("C15T_DATABASE_URL is not configured");
    }
    const sql = postgres(env.C15T_DATABASE_URL, {
      ssl: "require",
      prepare: false, // required for Supabase transaction pooler
      max: 1, // Cloudflare Workers: one connection per isolate
    });
    _db = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: sql }),
    });
  }
  return _db;
}
