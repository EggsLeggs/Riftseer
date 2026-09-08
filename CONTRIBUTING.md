# Contributing

Riftseer is a Bun workspace with two npm satellites, gated by one command. This page is the short version for someone outside the repository. `AGENTS.md` is the long one and `docs/standards.md` is how prose and code are written here; read both before a change of any size.

## Before you start

- A feature needs an issue the maintainer has accepted before the PR is opened. Say what you want to build and why, and wait for the issue to be labelled `ready-for-agent` or `ready-for-human`. A feature PR with no accepted issue behind it is closed, however good it is.
- Bug fixes and documentation changes need no prior issue. Link the bug report if one exists.
- An idea that is not yet a proposal goes in the Ideas category of [Discussions](https://github.com/EggsLeggs/Riftseer/discussions). `docs/out-of-scope.md` lists what we have already rejected and what would make us look again.
- Vulnerabilities go through `SECURITY.md`, never an issue.

## Setting up

```bash
bun install            # never npm install at the root
bun run db:local:up    # Postgres and PostgREST behind a Supabase-shaped proxy; needs Docker
bun dev                # API on :8789, web on :3000, pinned to the local database
```

`apps/reddit-bot` and `apps/raycast-extension` are npm projects outside the workspace: run `npm install` inside each. They import `@riftseer/types` through a `file:` dependency, so a types change reaches them only after you reinstall there.

## The gate

```bash
bun run check
```

One command, the same one `.github/workflows/test.yml` runs on every PR: lint and format (oxlint, oxfmt), typecheck for every workspace package, the test suite, the guidance-file reference check, markdown lint, dependency boundary rules, wrangler consistency and OpenAPI spec drift. Green locally is green in CI. `bun run lint:fix` fixes what the linter and formatter can fix themselves.

The satellites have their own gate, `.github/workflows/standalone.yml`: `npm ci` plus `tsc --noEmit` in each. Both must pass.

## Pull requests

- Conventional commit title in plain language: `fix(web): new threads no longer spike CPU`.
- One concern per PR. If the description says "also", it is two PRs.
- The body is the problem in a sentence or two, then how you fixed it. `.github/PULL_REQUEST_TEMPLATE.md` asks for the rest.
- If your change alters a rule someone follows or a term the glossary defines, update the nearest `AGENTS.md` or `CONTEXT.md` in the same diff. A rule that lives only in a PR description is lost on the next read.
- UI changes carry before and after images, motion carries a short video, both uploaded to GitHub rather than committed.
- A route change regenerates and commits `apps/api/openapi.json` (`bun run generate:spec` inside `apps/api`). That diff is how API changes are reviewed; `docs/api-versioning.md` says what may change without notice.
- No implementation plans, research notes or scratch files in the tree.

## Rules that bite

- `supabase/migrations` is append-only after the squashed baseline. Never edit an applied migration, and validate a new one by running `bun run db:local:reset`.
- Legal copy is code. Changing `apps/web/src/views/terms-view.tsx` or `apps/web/src/views/privacy-view.tsx` moves the "Last updated" date in the same diff, and a material change bumps the matching `LEGAL_TERMS_VERSION` or `LEGAL_PRIVACY_VERSION` in `apps/api/wrangler.jsonc`.
- `packages/types` has zero runtime dependencies. That is the only reason Workers, Devvit and browsers can all import it.
- Printing ids must survive a catalogue rebuild. Deck rows and hosted image URLs are keyed on them.

## Licence

The source is under the Functional Source License 1.1 with Apache 2.0 as its future licence, in `LICENSE`. By contributing you agree your contribution is licensed the same way. There is no CLA to sign. `apps/tts` carries its own terms, described in `apps/tts/NOTICE`.

Everyone here follows `CODE_OF_CONDUCT.md`.
