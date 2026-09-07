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
 *
 * Bun parses JSONC on import, so the configs are read as-is. Runs under bun,
 * not node, for that reason.
 */

import api from "../packages/api/wrangler.jsonc";
import discordBot from "../packages/discord-bot/wrangler.jsonc";
import ingest from "../packages/ingest-worker/wrangler.jsonc";
import web from "../packages/web/wrangler.jsonc";

const configs = [
  ["packages/api/wrangler.jsonc", api],
  ["packages/ingest-worker/wrangler.jsonc", ingest],
  ["packages/web/wrangler.jsonc", web],
  ["packages/discord-bot/wrangler.jsonc", discordBot],
];

const problems = [];

// One compatibility date. The newest in use is the target; anything older is
// a Worker that missed the bump.
const dates = configs.map(([file, config]) => [file, config.compatibility_date]);
const newest = dates.map(([, date]) => date).sort().at(-1);
for (const [file, date] of dates) {
  if (date !== newest) {
    problems.push(`${file}: compatibility_date is ${date}, others use ${newest}`);
  }
}

// The API and the ingest worker share the image bucket and the image queue.
// Each binding name that appears in both must point at the same resource.
const byBinding = (list = [], key) =>
  new Map(list.map((entry) => [entry.binding, entry[key]]));

const apiBuckets = byBinding(api.r2_buckets, "bucket_name");
const ingestBuckets = byBinding(ingest.r2_buckets, "bucket_name");
for (const [binding, bucket] of apiBuckets) {
  const other = ingestBuckets.get(binding);
  if (other !== undefined && other !== bucket) {
    problems.push(
      `packages/api/wrangler.jsonc and packages/ingest-worker/wrangler.jsonc: R2 binding ${binding} is ${bucket} in one and ${other} in the other`,
    );
  }
}

const apiQueues = byBinding(api.queues?.producers, "queue");
const ingestQueues = byBinding(ingest.queues?.producers, "queue");
for (const [binding, queue] of apiQueues) {
  const other = ingestQueues.get(binding);
  if (other !== undefined && other !== queue) {
    problems.push(
      `packages/api/wrangler.jsonc and packages/ingest-worker/wrangler.jsonc: queue binding ${binding} produces to ${queue} in one and ${other} in the other`,
    );
  }
}

// Every queue the API produces into needs a consumer in the ingest worker.
const consumed = new Set((ingest.queues?.consumers ?? []).map((c) => c.queue));
for (const [binding, queue] of apiQueues) {
  if (!consumed.has(queue)) {
    problems.push(
      `packages/api/wrangler.jsonc: ${binding} produces to ${queue}, which packages/ingest-worker/wrangler.jsonc does not consume`,
    );
  }
}

// Web deploys with --env production. Wrangler inherits compatibility settings
// under --env but not bindings, so the block duplicates them by hand and the
// two copies must agree. The name must match too: a different name deploys a
// brand-new Worker instead of the one riftseer.com is attached to.
const production = web.env?.production ?? {};
if (production.name !== web.name) {
  problems.push(
    `packages/web/wrangler.jsonc: env.production.name is ${production.name}, top-level name is ${web.name}`,
  );
}
for (const key of ["assets", "images", "services", "secrets", "compatibility_flags"]) {
  if (!(key in production)) continue;
  const top = JSON.stringify(web[key]);
  const prod = JSON.stringify(production[key]);
  if (top !== prod) {
    problems.push(
      `packages/web/wrangler.jsonc: env.production.${key} is ${prod}, top-level ${key} is ${top}`,
    );
  }
}

if (problems.length > 0) {
  console.error("Wrangler configs disagree:\n");
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

console.log(
  `Wrangler configs agree: compatibility_date ${newest}, shared R2 and queue names, web env.production matches its top level.`,
);
