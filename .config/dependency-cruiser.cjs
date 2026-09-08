/**
 * Baseline structural rules — the mechanical form of invariants that used to
 * live only in AGENTS.md prose. Keep this list short and load-bearing; a rule
 * that never fires is a rule nobody trusts.
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Dependency cycles make every module in the loop one module.",
      from: {},
      // Type-only cycles have no runtime existence; the discord-bot handlers'
      // `import type { Env } from "../index.ts"` loops are the known case.
      to: { circular: true, dependencyTypesNot: ["type-only"] },
    },
    {
      name: "no-cross-package-deep-imports",
      severity: "error",
      comment:
        "Reach a sibling package through its declared entry points " +
        "(@riftseer/x or a subpath export), never through its src/ internals.",
      from: { path: "^(apps|packages)/([^/]+)/" },
      // Package-specifier imports (@riftseer/x/slug) resolve through strict
      // exports maps and arrive as non-"local" edges; the reachable sin is a
      // relative path that climbs out of one package into another's src/.
      to: {
        path: "^(apps|packages)/[^/]+/src/",
        pathNot: "^$1/$2/",
        dependencyTypes: ["local"],
      },
    },
    {
      name: "api-supabase-only-in-repos",
      severity: "error",
      comment:
        "Every Supabase query in the API lives in src/repos/, and " +
        "src/lib/supabase.ts builds the clients. A route or lib that reaches " +
        "for @supabase/* directly is a query the repository layer cannot see.",
      from: {
        path: "^apps/api/src/",
        pathNot: "^apps/api/src/(repos/|lib/supabase\\.ts$)",
      },
      to: { path: "node_modules/@supabase/" },
    },
    {
      name: "ingest-worker-no-core",
      severity: "error",
      comment:
        "packages/core pulls in Node built-ins the Workers runtime cannot " +
        "load. The ingest worker keeps its own utils instead.",
      from: { path: "^apps/ingest-worker/" },
      to: { path: "^packages/core/" },
    },
    {
      name: "render-kernel-public-surface",
      severity: "error",
      comment:
        "The render kernel is reached through packages/types/src/render/index.ts " +
        "(the @riftseer/types/render subpath). Its other files are private, so a " +
        "surface cannot grow a dependency on how the kernel is split up inside.",
      from: { pathNot: "^packages/types/src/render/" },
      to: {
        path: "^packages/types/src/render/",
        pathNot: "^packages/types/src/render/index\\.ts$",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    // No tsConfig: the base has no path mappings to contribute, and
    // dependency-cruiser cannot parse a base that lives apart from its
    // sources (TS18003) or one with `files: []` (TS18002).
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "types", "default"],
      mainFields: ["module", "main", "types"],
    },
  },
};
