/**
 * Shims for the Cloudflare Worker ambient types that `@riftseer/api`'s source
 * relies on.
 *
 * `src/lib/api/client.ts` does `import type { App } from "@riftseer/api"`, which
 * pulls `apps/api/src/index.ts` into this program. That file resolves
 * `cloudflare:workers` and the `GeneratedEnv` interface from the API package's
 * own `types` config and its ambient `src/worker-configuration.d.ts` — neither
 * of which applies here, because this tsconfig excludes `../api` (so the
 * ambient file is never loaded) yet still type-checks the imported module.
 *
 * Nothing from the API worker is bundled into this app; these declarations
 * exist only so the type-only import resolves. Mirrors the same approach in
 * `apps/discord-bot/src/bun-shims.d.ts`.
 */

declare module "cloudflare:workers" {
  // Bindings (R2 buckets, queues) are shaped by the API's own wrangler config;
  // this program only needs the accesses to type-check, not to be sound.
  export const env: Record<string, any>;
}

interface GeneratedEnv {
  [key: string]: unknown;
}
