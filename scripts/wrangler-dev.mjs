#!/usr/bin/env bun
/**
 * Run one package's `wrangler dev` against the shared persist directory.
 *
 *   bun scripts/wrangler-dev.mjs <package> [wrangler dev args...]
 *
 * The API and the ingest worker must share `--persist-to`: an admin image
 * upload lands in the API's local R2 bucket and the ingest worker's queue
 * consumer has to see it. Wrangler has no config-file key for the persist
 * path, so the one place it is spelled is here, resolved to an absolute path
 * from the repository root so the scripts work from any cwd.
 *
 * Runs under bun, not node: node 22 claims `--env-file` for itself even when
 * it appears after the script path, and never hands it to wrangler.
 *
 * `bunfig.toml` sets `env = false` so Bun does not auto-load the root `.env`,
 * which belongs to the web dev server and holds production values. Web
 * commands pass `--env-file` explicitly. Wrangler still reads a Worker's
 * declared secrets from `process.env` ahead of any `--env-file`, so every key
 * the root `.env` defines is dropped from the environment wrangler is spawned
 * with as a safeguard. A Worker's values come from its own `.dev.vars*` files
 * and nowhere else.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/** The variable names a dotenv file defines, ignoring comments and blanks. */
export function dotenvKeys(text) {
  const keys = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (match) keys.push(match[1]);
  }
  return keys;
}

/** A copy of `env` without the given keys. */
export function withoutKeys(env, keys) {
  const drop = new Set(keys);
  return Object.fromEntries(Object.entries(env).filter(([key]) => !drop.has(key)));
}

function rootDotenvKeys(repoRoot) {
  try {
    return dotenvKeys(readFileSync(path.join(repoRoot, ".env"), "utf8"));
  } catch {
    return [];
  }
}

if (import.meta.main) {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const [pkg, ...extra] = process.argv.slice(2);

  if (!pkg) {
    console.error("usage: bun scripts/wrangler-dev.mjs <package> [wrangler dev args...]");
    process.exit(2);
  }

  const cwd = path.join(repoRoot, "apps", pkg);
  const wrangler = path.join(cwd, "node_modules", ".bin", "wrangler");
  const persistTo = path.join(repoRoot, ".wrangler", "shared");

  const child = spawn(wrangler, ["dev", "--persist-to", persistTo, ...extra], {
    cwd,
    stdio: "inherit",
    env: withoutKeys(process.env, rootDotenvKeys(repoRoot)),
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }

  child.on("exit", (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });
}
