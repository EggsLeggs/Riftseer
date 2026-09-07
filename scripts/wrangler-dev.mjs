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
 */

import { spawn } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const [pkg, ...extra] = process.argv.slice(2);

if (!pkg) {
  console.error("usage: bun scripts/wrangler-dev.mjs <package> [wrangler dev args...]");
  process.exit(2);
}

const cwd = path.join(repoRoot, "packages", pkg);
const wrangler = path.join(cwd, "node_modules", ".bin", "wrangler");
const persistTo = path.join(repoRoot, ".wrangler", "shared");

const child = spawn(wrangler, ["dev", "--persist-to", persistTo, ...extra], {
  cwd,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
