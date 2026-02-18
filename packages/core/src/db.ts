import { Database } from "bun:sqlite";
import path from "path";
import fs from "fs";

// ─── Singleton DB connection ──────────────────────────────────────────────────

let _db: Database | null = null;

function resolveDbPath(): string {
  const p = process.env.DB_PATH ?? "./data/riftseer.db";
  const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  // Ensure parent directory exists
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  return abs;
}

export function getDb(): Database {
  if (_db) return _db;

  const dbPath = resolveDbPath();
  _db = new Database(dbPath, { create: true });

  // Performance pragmas — safe for single-writer workload
  _db.run("PRAGMA journal_mode = WAL");
  _db.run("PRAGMA synchronous = NORMAL");
  _db.run("PRAGMA foreign_keys = ON");

  initSchema(_db);
  return _db;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function initSchema(db: Database): void {
  // Reddit bot: tracks which thing IDs we have already replied to
  db.run(`
    CREATE TABLE IF NOT EXISTS replied_ids (
      thing_id   TEXT    PRIMARY KEY,
      replied_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Card cache: stores provider-normalised card JSON
  db.run(`
    CREATE TABLE IF NOT EXISTS card_cache (
      provider   TEXT    NOT NULL,
      card_id    TEXT    NOT NULL,
      data       TEXT    NOT NULL,
      fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (provider, card_id)
    )
  `);

  // Tracks last full refresh time per provider
  db.run(`
    CREATE TABLE IF NOT EXISTS cache_meta (
      provider     TEXT    PRIMARY KEY,
      last_refresh INTEGER NOT NULL DEFAULT 0,
      card_count   INTEGER NOT NULL DEFAULT 0
    )
  `);
}

// ─── Reddit reply tracking ────────────────────────────────────────────────────

export function hasReplied(thingId: string): boolean {
  const row = getDb()
    .query<{ found: number }, [string]>("SELECT 1 AS found FROM replied_ids WHERE thing_id = ?")
    .get(thingId);
  return row !== null;
}

export function markReplied(thingId: string): void {
  getDb().run("INSERT OR IGNORE INTO replied_ids (thing_id) VALUES (?)", [thingId]);
}

// ─── Card cache ───────────────────────────────────────────────────────────────

export interface CachedCardRow {
  data: string;
}

export function getCachedCards(provider: string): {
  cards: Record<string, unknown>[];
  lastRefresh: number;
} {
  const db = getDb();
  const rows = db
    .query<CachedCardRow, [string]>("SELECT data FROM card_cache WHERE provider = ?")
    .all(provider);
  const meta = db
    .query<{ last_refresh: number }, [string]>(
      "SELECT last_refresh FROM cache_meta WHERE provider = ?"
    )
    .get(provider);

  return {
    cards: rows.map((r) => JSON.parse(r.data) as Record<string, unknown>),
    lastRefresh: meta?.last_refresh ?? 0,
  };
}

export function setCachedCards(
  provider: string,
  cards: Record<string, unknown>[]
): void {
  const db = getDb();

  const del = db.prepare("DELETE FROM card_cache WHERE provider = ?");
  const ins = db.prepare(
    "INSERT OR REPLACE INTO card_cache (provider, card_id, data) VALUES (?, ?, ?)"
  );
  const meta = db.prepare(
    "INSERT OR REPLACE INTO cache_meta (provider, last_refresh, card_count) VALUES (?, ?, ?)"
  );

  db.transaction(() => {
    del.run(provider);
    for (const card of cards) {
      ins.run(provider, String(card.id), JSON.stringify(card));
    }
    meta.run(provider, Math.floor(Date.now() / 1000), cards.length);
  })();
}

export function getCacheMeta(provider: string): {
  lastRefresh: number;
  cardCount: number;
} {
  const row = getDb()
    .query<
      { last_refresh: number; card_count: number },
      [string]
    >("SELECT last_refresh, card_count FROM cache_meta WHERE provider = ?")
    .get(provider);

  return {
    lastRefresh: row?.last_refresh ?? 0,
    cardCount: row?.card_count ?? 0,
  };
}
