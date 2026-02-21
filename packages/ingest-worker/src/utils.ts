/**
 * Self-contained utilities for the ingest worker.
 * Avoids importing from @riftseer/core, which pulls in ioredis and Node.js
 * built-ins that are incompatible with Cloudflare Workers.
 */

export function normalizeCardName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['\u2019-]/g, "") // apostrophes, right-single-quote, hyphens
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// CF Workers: no process.stdout — use console.* which maps to worker logs
export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => {
    console.debug(JSON.stringify({ ts: new Date().toISOString(), level: "debug", msg, ...data }));
  },
  info: (msg: string, data?: Record<string, unknown>) => {
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg, ...data }));
  },
  warn: (msg: string, data?: Record<string, unknown>) => {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg, ...data }));
  },
  error: (msg: string, data?: Record<string, unknown>) => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg, ...data }));
  },
};
