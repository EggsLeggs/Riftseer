#!/usr/bin/env bun
/**
 * Fail when the four Worker configs disagree about something they share.
 *
 *   bun scripts/check-wrangler-consistency.mjs
 *
 * Three things drift silently between wrangler.jsonc files:
 *
 *   compatibility_date   one Worker on an older runtime than the rest
 *   R2 and queue names   the API produces into a queue nobody consumes
 *   web's env.production wrangler does not inherit bindings under --env,
 *                        so the block duplicates the top level by hand
 *   generated env types  a var or secret declared in the config but absent
 *                        from the Worker's worker-configuration.d.ts
 *
 * Bun parses JSONC on import, so the configs are read as-is. Runs under bun,
 * not node, for that reason.
 */

import { readFileSync } from "node:fs";

import api from "../apps/api/wrangler.jsonc";
import discordBot from "../apps/discord-bot/wrangler.jsonc";
import ingest from "../apps/ingest-worker/wrangler.jsonc";
import web from "../apps/web/wrangler.jsonc";

const configs = [
  ["apps/api/wrangler.jsonc", api],
  ["apps/ingest-worker/wrangler.jsonc", ingest],
  ["apps/web/wrangler.jsonc", web],
  ["apps/discord-bot/wrangler.jsonc", discordBot],
];

const problems = [];

// One compatibility date. The newest in use is the target; anything older is
// a Worker that missed the bump.
const dates = configs.map(([file, config]) => [file, config.compatibility_date]);
const newest = dates
  .map(([, date]) => date)
  .sort()
  .at(-1);
for (const [file, date] of dates) {
  if (date !== newest) {
    problems.push(`${file}: compatibility_date is ${date}, others use ${newest}`);
  }
}

// The API and the ingest worker share the image bucket and the image queue.
// Each binding name that appears in both must point at the same resource.
const byBinding = (list = [], key) => new Map(list.map((entry) => [entry.binding, entry[key]]));

const apiBuckets = byBinding(api.r2_buckets, "bucket_name");
const ingestBuckets = byBinding(ingest.r2_buckets, "bucket_name");
for (const [binding, bucket] of apiBuckets) {
  const other = ingestBuckets.get(binding);
  if (other !== undefined && other !== bucket) {
    problems.push(
      `apps/api/wrangler.jsonc and apps/ingest-worker/wrangler.jsonc: R2 binding ${binding} is ${bucket} in one and ${other} in the other`,
    );
  }
}

const apiQueues = byBinding(api.queues?.producers, "queue");
const ingestQueues = byBinding(ingest.queues?.producers, "queue");
for (const [binding, queue] of apiQueues) {
  const other = ingestQueues.get(binding);
  if (other !== undefined && other !== queue) {
    problems.push(
      `apps/api/wrangler.jsonc and apps/ingest-worker/wrangler.jsonc: queue binding ${binding} produces to ${queue} in one and ${other} in the other`,
    );
  }
}

// Every queue the API produces into needs a consumer in the ingest worker.
const consumed = new Set((ingest.queues?.consumers ?? []).map((c) => c.queue));
for (const [binding, queue] of apiQueues) {
  if (!consumed.has(queue)) {
    problems.push(
      `apps/api/wrangler.jsonc: ${binding} produces to ${queue}, which apps/ingest-worker/wrangler.jsonc does not consume`,
    );
  }
}

// Web deploys with --env production. Wrangler inherits compatibility settings
// under --env but not bindings, so the block duplicates them by hand and the
// two copies must agree. The name must match too: a different name deploys a
// brand-new Worker instead of the one riftseer.com is attached to.
//
// images, services, and secrets must be present in env.production — skipping
// a missing key used to hide a broken production deploy. assets and
// compatibility_flags are still compared only when present.
export const REQUIRED_PRODUCTION_SECTIONS = ["images", "services", "secrets"];
export const COMPARED_PRODUCTION_SECTIONS = [
  "assets",
  "images",
  "services",
  "secrets",
  "compatibility_flags",
];

export function productionBindingProblems(top, production = {}) {
  const found = [];
  if (production.name !== top.name) {
    found.push(
      `apps/web/wrangler.jsonc: env.production.name is ${production.name}, top-level name is ${top.name}`,
    );
  }
  for (const key of COMPARED_PRODUCTION_SECTIONS) {
    if (!(key in production)) {
      if (REQUIRED_PRODUCTION_SECTIONS.includes(key)) {
        found.push(
          `apps/web/wrangler.jsonc: env.production is missing ${key}, which does not inherit under --env`,
        );
      }
      continue;
    }
    const topValue = JSON.stringify(top[key]);
    const prodValue = JSON.stringify(production[key]);
    if (topValue !== prodValue) {
      found.push(
        `apps/web/wrangler.jsonc: env.production.${key} is ${prodValue}, top-level ${key} is ${topValue}`,
      );
    }
  }
  return found;
}

problems.push(...productionBindingProblems(web, web.env?.production ?? {}));

// `wrangler types` writes the Env interface from the config, so a var or
// secret added to a wrangler.jsonc without rerunning it leaves the Worker's
// own Env type missing a binding the code may already read. That is how the
// API's type went six secrets stale.
//
// This compares names only, never the generated file's shape or its hash, so
// a wrangler upgrade that changes formatting cannot turn it red on an
// unrelated pull request.
export function missingGeneratedBindings(configFile, config, typesFile, typesSource) {
  const declared = [...Object.keys(config.vars ?? {}), ...(config.secrets?.required ?? [])];
  return declared
    .filter((name) => !new RegExp(`^\\s*${name}\\??:`, "m").test(typesSource))
    .map(
      (name) =>
        `${typesFile}: ${name} is declared in ${configFile} but missing from the generated Env — rerun \`wrangler types\``,
    );
}

// The ingest worker's two schedules mean two different halves of the pipeline,
// and `scheduled()` tells them apart by comparing `event.cron` to a literal.
// A cron edited in one file and not the other does not fail anything: the run
// silently does catalogue work on the prices schedule, and prices stop being
// refreshed at all. Names only — the check does not care which expressions are
// used, just that the worker recognises every one it is scheduled on.
export function unmatchedIngestCrons(config, indexSource) {
  const crons = config.triggers?.crons ?? [];
  const map = indexSource.match(/const CRON_MODES[^=]*=\s*\{([\s\S]*?)\};/);
  const known = map ? [...map[1].matchAll(/"([^"]+)":/g)].map((match) => match[1]) : [];
  if (known.length === 0) return [];
  return crons
    .filter((cron) => !known.includes(cron))
    .map(
      (cron) =>
        `apps/ingest-worker/src/index.ts: cron "${cron}" is scheduled in wrangler.jsonc ` +
        `but matches no mode in scheduled() — it would silently run the default half`,
    );
}

problems.push(
  ...unmatchedIngestCrons(
    ingest,
    readFileSync(new URL("../apps/ingest-worker/src/index.ts", import.meta.url), "utf8"),
  ),
);

for (const [configFile, config, typesFile] of [
  ["apps/api/wrangler.jsonc", api, "apps/api/src/worker-configuration.d.ts"],
  ["apps/ingest-worker/wrangler.jsonc", ingest, "apps/ingest-worker/src/worker-configuration.d.ts"],
]) {
  const typesSource = readFileSync(new URL(`../${typesFile}`, import.meta.url), "utf8");
  problems.push(...missingGeneratedBindings(configFile, config, typesFile, typesSource));
}

if (import.meta.main) {
  if (problems.length > 0) {
    console.error("Wrangler configs disagree:\n");
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(`\n${problems.length} problem(s).`);
    process.exit(1);
  }

  console.log(
    `Wrangler configs agree: compatibility_date ${newest}, shared R2 and queue names, web env.production matches its top level, generated Env types carry every declared binding.`,
  );
}
