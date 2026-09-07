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
      from: { path: "^packages/([^/]+)/" },
      // Package-specifier imports (@riftseer/x/slug) resolve through strict
      // exports maps and arrive as non-"local" edges; the reachable sin is a
      // relative path that climbs out of one package into another's src/.
      to: {
        path: "^packages/([^/]+)/src/",
        pathNot: "^packages/$1/",
        dependencyTypes: ["local"],
      },
    },
    {
      name: "ingest-worker-no-core",
      severity: "error",
      comment:
        "packages/core pulls in Node built-ins the Workers runtime cannot " +
        "load. The ingest worker keeps its own utils instead.",
      from: { path: "^packages/ingest-worker/" },
      to: { path: "^packages/core/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "types", "default"],
      mainFields: ["module", "main", "types"],
    },
  },
};
