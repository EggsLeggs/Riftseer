# Riftseer

Riftseer is a Riftbound TCG data platform: a card catalogue ingested from RiftCodex, a REST API over it, and the clients that read that API. Scryfall plus Moxfield, for Riftbound. Everything a client shows, it got from the API; no client talks to the database.

## Hard rules

Each of these already cost us something. Breaking one usually fails silently.

- Read the package's `AGENTS.md` before changing it, and `CONTEXT.md` before naming a domain concept. Use the glossary's word, never a synonym it lists under _Avoid_.
- `bun run check` is the workspace gate. It runs lint, format, typecheck, tests, docs references, markdown lint, boundaries, wrangler consistency and spec drift, and `.github/workflows/test.yml` runs the same command on every PR. `apps/reddit-bot` and `apps/raycast-extension` are outside the workspace and are gated separately by `.github/workflows/standalone.yml` (`npm ci` plus `tsc --noEmit` on each). Both gates must pass.
- Check `curl localhost:8787/` before an ingest. It reports the host the worker would write to plus a `local` flag. Ingest's final prune removes stale RiftCodex printings and orphaned RiftCodex oracles; manual rows stay.
- `bun dev` pins the docker database. `bun run dev:prod` reads `apps/api/.dev.vars`, which is conventionally production, and is the explicit opt-in.
- Never make a PR unless the maintainer asks. Never co-author with the maintainer on commits or PRs.
- Never commit implementation plans, research notes or agent scratch files. `.gitignore` will not catch them.
- `supabase/migrations` is append-only after the squashed baseline. Validate a migration by running it; `bun run db:local:reset` surfaces the SQL error that reading it will not.
- Printing ids must survive a rebuild. Deck rows and hosted image URLs are keyed on them.
- Shared logic goes in `packages/types`, which has zero runtime dependencies. That is the only reason Workers, Devvit and browsers can all import it.
- `apps/ingest-worker` never imports `@riftseer/core`; it pulls in Node built-ins Workers cannot load.
- Prose and code follow `docs/standards.md`. If a rule here fights the task in front of you, say so loudly and get a maintainer's sign-off before breaking it.

## Defaults

Prefer the smallest change that makes the correct behaviour unsurprising. Do not preserve complexity because it exists; do not add machinery because it looks architectural. Prefer one shared implementation over a per-surface copy. When there is a better way than the existing code, say so and ask before rewriting. These are defaults, not law; the maintainer's stated preference overrides them.

## Vocabulary

- **you** are the agent changing Riftseer. **We** and **maintainers** are the people building it, and who you are talking to.
- **user** is a person using a client. **client** is what they use: website, Discord bot, Reddit bot, Raycast extension, tts (the Table Top Simulator mod), the mobile app when it exists.
- The card model, the deck model and everything else domain-shaped is defined once, in `CONTEXT.md`.

## Where code lives

`apps/` holds the deployable surfaces, `packages/` the libraries they share, `tooling/` the configs they share. Package names stay `@riftseer/*`, so a move never changes an import.

- `packages/types`: shared types, the card-mention parser, deck model and validation, slug and image derivation, the render kernel. Zero dependencies.
- `packages/core`: `CardDataProvider`, the Supabase provider, the search grammar and its SQL renderer. Consumed by the API only.
- `apps/api`: Elysia REST API on Workers. Owns `/api/v1` and the real authorisation boundary.
- `apps/web`: Next.js App Router on Workers via OpenNext.
- `apps/ingest-worker`: scheduled ingest and image hosting.
- `apps/discord-bot`: Worker, slash commands.
- `apps/raycast-extension` and `apps/reddit-bot`: standalone npm projects outside the workspace, importing `@riftseer/types` through `file:../../packages/types`. A types change reaches them only after `npm install` in their own directory.
- `supabase/migrations`: the schema. `docker/`, `docker-compose.yml`, `scripts/database-tests/`: the local database stack and its fixture. `supabase/docs/supabase.md` covers both environments and how a migration reaches production.
- `scripts/`: repository checks. `docs/`: plain markdown reference, read once, rendered by GitHub.

## Dev servers

This is a Bun workspace: `bun install`, never `npm install`, except inside the two standalone packages. Run everything from the repository root.

```bash
bun dev                 # API :8789 + web :3000, pinned to the local docker database
bun run dev:prod        # API + web against whatever .dev.vars points at
bun dev:api             # API alone
bun run dev:ingest      # ingest worker :8787; dev:ingest:local pins docker
bun run db:local:up     # Postgres :55432, PostgREST, Supabase-shaped proxy :54321
bun run db:local:reset  # drop the volume, rebuild from supabase/migrations
```

- The local stack is real Postgres and PostgREST behind a Supabase-shaped proxy, not a mock. It needs Docker, and it starts empty: fill it with a local ingest run.
- PostgREST catches shape bugs `psql` cannot: an embedded one-to-one comes back as an object or null, never an array.
- The `:local` scripts load `.dev.vars.local`, committed on purpose with docker placeholders. Real values that ride alongside go in the gitignored `.dev.vars.local.secrets`.
- The root `.env` belongs to the web dev server and holds production values. `bunfig.toml` sets `env = false`, so Bun does not auto-load it into tests, database runners or other non-web processes; web commands pass `--env-file ../../.env` explicitly. Wrangler still reads declared secrets from `process.env` first, so `scripts/wrangler-dev.mjs` strips those keys before spawning as a safeguard. A Worker's local values live in its own `.dev.vars*` files, never in `.env`.
- The API and ingest worker share `--persist-to ../../.wrangler/shared`. Split them and an admin image upload lands in a bucket the consumer cannot see.
- A new env var or secret touches several files per Worker, and a missed one is silently absent under `wrangler dev`. `docs/adding-an-env-var.md` is the checklist.

## Verifying

```bash
bun run check           # workspace gate (test.yml)
bun run lint:fix        # oxlint --fix, then oxfmt --write
bun test                # types, core, api, ingest-worker, web, discord-bot
bun run test:db         # needs db:local:up first
bun run preview:web     # builds and runs in workerd
```

- oxlint and oxfmt are the linter and formatter, configured in `.oxlintrc.json` and `.oxfmtrc.json` at the root because ignore patterns resolve inside the config's own directory. No eslint, prettier or biome anywhere else; raycast keeps its own because `ray lint` requires them.
- The React Compiler rules (`set-state-in-effect`, `refs`, `immutability`) are off until the web deck-logic extraction. Do not switch them on in passing.
- Boundary rules in `.config/dependency-cruiser.cjs` are structural invariants: no cycles, no relative imports into a sibling package's `src/`, ingest-worker never imports core, the render kernel is reached only through its index.
- `bun dev` does not exercise the Workers runtime. Run `bun run preview:web` before shipping anything that touches web's server runtime or bindings.
- `ingest-worker` spells it `type-check`; everything else says `typecheck`, and root `typecheck` covers every workspace member.
- The standalone gate is `.github/workflows/standalone.yml`: `npm ci` plus `tsc --noEmit` in `apps/reddit-bot` and `apps/raycast-extension`. It is not part of `bun run check`; both gates must pass.
- Most API tests need no database: `apps/api/src/__tests__/stub_card_provider.ts` is an in-memory `CardDataProvider`. Reach for a real database only when the thing under test is the SQL.
- `scripts/database-tests/fixture.sql` is the only fixture, loaded through the real `ingest_catalogue` RPC so it exercises production's write path. Extend it there. `packages/core/src/__tests__/database.integration.test.ts` is gated behind `RIFTSEER_DATABASE_TESTS=1`.

## Hit every surface

A change to shared behaviour is not done when the website shows it. Surfaces here are `apps/web`, `apps/discord-bot`, `apps/reddit-bot` and `apps/raycast-extension`; the TTS mod lives elsewhere. Every client resolves through the API, so a provider fix reaches all of them at once, and a types change silently misses the two standalone packages until they reinstall. Say so in the PR when you leave a surface behind on purpose.

## Pull requests

- Conventional commit titles in plain language: `fix(web): new threads no longer spike CPU`. One concern per PR; if the description says "also", split it.
- Body: the problem in a sentence or two, then how you fixed it. End with the model and harness that did the work.
- UI changes need before/after images, motion needs a short video, uploaded to GitHub. Never commit PR-only assets.
- Renovate opens the routine dependency PRs weekly; OSV vulnerability fixes ignore the schedule. `docs/renovate.md` covers the cadence and how to force a run.
- When babysitting: poll checks and comments newer than the last push, verify each bot finding against the source, fix real ones, dismiss false positives with a written reason. Stay quiet when nothing is new. Stop when the bots are green on the latest commit.
- Track active work in the GitHub issue or project item that owns it (`docs/agents/issue-tracker.md`, labels in `docs/agents/triage-labels.md`). A merged PR is the implementation record; close its tracking item and keep no second checklist in the repository.
- Rules an agent can break go in the nearest `AGENTS.md`. Vocabulary goes in `CONTEXT.md` (`docs/agents/domain.md` says how). Reference read once goes in `docs/` or a package's `docs/`. Neither, and it is probably not worth writing.

## Invariants

- Rarity is printing-level. Sources disagreeing about it is real data, not review-queue noise.
- A delta means the card genuinely differs from its oracle. A locked field means an admin decided. Never conflate them.
- Ingest owns the deltas and relationships it wrote and never touches an admin's. That plus soft deletes is the whole durability story; there is no override overlay.
- Relationships are oracle-to-oracle edges stored once. `used_by` is a reverse query, not a second row.
- Search never resolves deltas at query time. `card_search_ast_to_sql` scans `resolved_printings`, exactly one flat relation.
- The search grammar is also the ruling rule language. A leaf that cannot render to SQL must not parse.
- Legality is default-legal. Only non-legal statuses are stored; precedence is printing row, then oracle row, then legal.
- Format limits are data in `format_zone_rules`, never database constraints. Changing a format cannot make a saved deck unloadable.
- Image URLs, slugs and keywords are derived, with one derivation each. Slugs are pinned on first insert so public URLs never drift.
- A `might_bonus` of `0` is a real printed value. Presence decides equipment, never truthiness.
- The API Worker holds a service-role key and bypasses RLS. `canRead()` and `canWrite()` in `apps/api/src/routes/decks.ts` decide deck access and `ADMIN_USER_IDS` decides admin; migration policies are defence in depth. Web's `requireAuth()` and `requireAdmin()` are UX gates. A deck you may not read answers 404, never 403.
- `owner` is computed from `owner_id`, never stored, and visibility is orthogonal to role.

## Legal and consent

Legal copy is code here, and it goes stale the same way code does.

- Copy lives in `apps/web/src/views/privacy-view.tsx` and `terms-view.tsx`. Change the copy, change the "Last updated" date in the same diff.
- Material changes bump `LEGAL_PRIVACY_VERSION` or `LEGAL_TERMS_VERSION` in `apps/api/wrangler.jsonc`, then need an API redeploy. Those versions are stamped at registration and read nowhere else; there is no re-consent flow to hook into.
- A new column storing something about a person is a privacy-page change. So is new logging, a new third party, or changed bot behaviour. The privacy policy predates profiles, follows and decks, naming only email and password: raise this before extending those tables.
- Terms carry a 13+ age floor and Riot's Legal Jibber Jabber attribution. Keep that attribution on anything showing card art or data.
- Consent is c15t. `C15T_DATABASE_URL` is a transaction-pooler URL and must keep `prepare: false` and `max: 1`.
- The terms prohibit API abuse but nothing enforces it. There is no rate limiting; `getRedisClient()`'s one caller is deck view dedup, not enforcement.

## Taste

- Inferred types over annotations. `any` is the enemy. The rest is `docs/standards.md`.
- Comments say how a thing is used and move when the code moves. Encode a constraint as a type, a test or a lint rule, then delete the comment.
- Do not verify with browsers or computer use unless the maintainer asks. Security matters but is not over-indexed, especially for dev-mode and maintainer-only features.
