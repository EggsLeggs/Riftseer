/**
 * Binding types come from `wrangler types` in worker-configuration.d.ts.
 * These two secrets are optional and therefore cannot be generated from the
 * required-secret list in wrangler.jsonc.
 */
export type Env = GeneratedEnv & {
  RIFTCODEX_API_KEY?: string;
  INGEST_SECRET?: string;
};
