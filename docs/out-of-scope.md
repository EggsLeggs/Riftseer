# Out of scope

Tooling and structure we considered during the 2026 architecture overhaul and rejected. Each entry is what it was, why not, and what would make us look again. Propose one of these only with the "revisit when" condition in hand.

## Turborepo

What: a task runner with remote caching over the workspace.
Why not: caching pays off at twenty or more tasks with expensive, cacheable outputs. `bun run check` is nine steps and the slow ones (typecheck, tests) are cheap enough to run every time. One umbrella script used identically by CI, `CONTRIBUTING.md` and agents is simpler than a pipeline graph.
Revisit when: `bun run check` passes five minutes on a warm machine, or the workspace grows past twenty distinct build steps.

## TypeScript project references

What: `references` in every tsconfig so `tsc -b` builds incrementally.
Why not: the whole-workspace typecheck is fast enough, and references add a build-order graph and emitted `.d.ts` files that every editor and test runner then has to understand.
Revisit when: root `typecheck` exceeds sixty seconds.

## A generated memory graph for agents

What: the penpot-style approach, a machine-maintained graph of modules and their relationships that agents query.
Why not: it earns its keep at fifty modules. We have seven packages, one `CONTEXT.md` and one `AGENTS.md` per package, and `scripts/check-docs-references.mjs` keeps them from rotting.
Revisit when: a package count or a glossary size makes a single reading pass impractical.

## OpenAPI-generated clients

What: generating TypeScript clients for the satellites from `apps/api/openapi.json`.
Why not: `packages/types` already owns the wire shapes and `@riftseer/types/client` is a hand-written, typed client over them, checked against the Elysia `App` type at compile time. A generator would produce a second copy of shapes we already have.
Revisit when: a client is needed in a language other than TypeScript.

## Absorbing Devvit and Raycast into the workspace

What: making `apps/reddit-bot` and `apps/raycast-extension` Bun workspace members.
Why not: Devvit and Raycast each ship a vendor toolchain that assumes npm, an `npm install` lockfile and its own ESLint and Prettier. They stay standalone, gated by `.github/workflows/standalone.yml` on committed lockfiles.
Revisit when: either vendor supports Bun workspaces or drops its toolchain requirement.

## Generated wrangler configs

What: one source config rendered into each Worker's `wrangler.jsonc`.
Why not: the four configs share three things (a compatibility date, R2 and queue names, web's duplicated `env.production` block), and `scripts/check-wrangler-consistency.mjs` asserts all three in forty lines. A generator would replace a checker with a build step everyone has to run.
Revisit when: the shared surface grows beyond what a consistency check can state.

## AGPL

What: licensing the source under the AGPL instead of the Functional Source License.
Why not: AGPL does not stop a competitor from running Riftseer as a service; it only obliges them to publish their changes. The FSL says the one thing we want said, that competing commercial use is not licensed, and turns into Apache-2.0 on its own after two years.
Revisit when: the project is handed to a foundation or the maintainers stop operating a hosted instance.

## `packages/mobile` now

What: a mobile app package ahead of any mobile client.
Why not: speculative. There is no mobile client, and a package with no consumer is a package nobody keeps working.
Revisit when: a mobile client is actually being built; it will read the API like every other surface.
