# Riftseer

Riftseer is a Riftbound TCG data platform. It is a multi-platform project that ingests data from various sources and provides a REST API used by numerous clients. Clients include the website, Discord bot, Table Top Simulator mod, and more.

You can think of Riftseer as the Riftbound version of MTG's Scryfall and Moxfield.

## What is the philosophy of Riftseer?

Riftseer is designed to be a comprehensive and authoritative source of Riftbound TCG data. It is designed to be a platform for developers to build their own clients and tools on top of. It's important we maintain the things they love as we continue to iterate on the product. Here is a brief list of things we can never compromise on:

### 1. Open at the core

Riftseer is truly open. We share our roadmap, we share how we think about things, and we share the code behind the platform. We work in the open and we strive to stay that way.

### 2. Performance without compromise

Riftseer is designed to be performant. We aim to cut out the bad tech decisions and "slop" and its important to regularly audit for performance regressions. Make sure all changes are considerate of the performance impact.

### 3. Multi-surface and avoid duplicating work

Riftseer has a number of first-party surfaces that are maintained in this repository and others: web, discord bot, reddit devvit bot, table top simulator mod and soon to be a mobile app. We aim to share the code between these surfaces and avoid duplicating work wherever possible.

### 4. Don't assume the existing code is the best way to do things

There was a lot of technical debt in the early days of Riftseer. We aim to avoid repeating the same mistakes and to learn from the past. When making changes, always consider the existing code and ask yourself if there is a better way to do things. When there is, be loud and ask if we should resolve it.

### 5. Keep costs low

Riftseer is a small team and we aim to keep costs low/free. We aim to avoid unnecessary complexity and to keep the codebase as simple as possible. When making tech decisions, always consider the cost/benefit ratio and ask yourself if the complexity is worth the benefit.

## A note from the product lead

I like ambitious ideas, simple systems, and software that feels obvious. Do not preserve complexity just because it already exists. Do not introduce machinery because it looks architecturally impressive. Understand the real constraint, then fight for the smallest model that makes the correct behavior unsurprising.

Channel both "measure twice, cut once" and "yagni". Fight scope creep. Try to honor the dev's intent in both a minimal and realistic fashion.

The rest of this document is meant to help you navigate the codebase and make changes effectively. Think of these instructions less as "hard rules", more as "good defaults". The developer's preferences should be able to override anything here.

## A small glossary

We need to be on the same page with terminology. When communicating, use this language:

- **you** means the agent reading this file and changing Riftseer.
- **we**, **us**, and **maintainers** mean the people building Riftseer. They are who you are talking to now.
- **user** means the person using Riftseer's platforms to interact with the data and their accounts.
- **client** means the platform the user is using to interact with the data and their accounts (website, table top simulator mod, mobile app, etc.)
- **tts** means the table top simulator mod.

## Hit every surface

A change to shared behaviour is not done when the website shows it.

- Surfaces here: `packages/web`, `packages/discord-bot`, `packages/reddit-bot`, `packages/raycast-extension`. The TTS mod lives elsewhere; the mobile app does not exist yet.
- No client queries the database. They resolve through the API, so a provider fix reaches all of them at once.
- Shared logic goes in `packages/types`. Zero runtime dependencies is the only reason Workers, Devvit and browsers can all import it.
- `reddit-bot` and `raycast-extension` sit outside the workspace and use `file:../types`. A types change reaches them only after an install in their own directory.
- That is the usual way a "shared" fix silently misses two surfaces. Say so in the PR when you leave one behind on purpose.

## Dev servers

Run these from the repository root. This is a **Bun workspace** — `bun install`, not `npm install`. Each package's own AGENTS.md carries its package-specific commands.

```bash
bun install             # all workspace members

bun dev                 # API + web, against whatever .dev.vars points at
bun run dev:local       # API + web, pinned to the local docker database
bun dev:api             # API alone at http://localhost:8789
bun dev:web             # Next.js alone
bun run dev:ingest      # ingest worker at http://localhost:8787
bun run dev:ingest:local

bun run db:local:up     # docker: Postgres :55432, PostgREST, Supabase-shaped proxy :54321
bun run db:local:reset  # drop the volume, rebuild from supabase/migrations
bun run db:local:psql
```

- Only the `:local` scripts pin a database. They load `.dev.vars.local`, which holds docker placeholders and is committed on purpose.
- Plain `bun dev` uses whatever `packages/api/.dev.vars` contains, and that is conventionally production. Check before an ingest or an admin mutation.
- `curl localhost:8787/` reports the host the ingest worker would write to, plus a `local` flag. An ingest rewrites the whole catalogue, so look first.
- The API and ingest worker share `--persist-to ../../.wrangler/shared`. Split them and an admin image upload lands in a bucket the consumer cannot see.
- The local stack is real Postgres and PostgREST behind a Supabase-shaped proxy, not a mock. It needs Docker.
- PostgREST catches shape bugs `psql` cannot: an embedded one-to-one comes back as an object or null, never an array.
- `raycast-extension` and `reddit-bot` need `npm install` in their own directory.

## Test data

- `scripts/database-tests/fixture.sql` is the only fixture: 3 sets, 4 oracles, 6 printings, a delta, a relationship, a format, a legality and a ruling.
- It loads through the real `ingest_catalogue` RPC rather than inserts, so it exercises production's write path. Extend it there.
- `bun scripts/database-tests/database.mjs setup | reseed | query <sql>` drives it.
- Most API tests need no database. `packages/api/src/__tests__/stub_card_provider.ts` is an in-memory `CardDataProvider`.
- Reach for a real database only when the thing under test is the SQL.
- The docker `riftseer` database gets schema only. Fill it with a real local ingest run.
- `packages/core/src/__tests__/database.integration.test.ts` is gated behind `RIFTSEER_DATABASE_TESTS=1` and skipped by default.

## Verifying

```bash
bun test                                    # types, core, api, ingest-worker, web, discord-bot
bun run typecheck                           # tsc --noEmit across six project configs
node scripts/check-docs-references.mjs      # dangling paths and identifiers in guidance files
bun run lint:md
bun run test:db                             # needs db:local:up first
bun run build:web
bun run preview:web                         # builds and runs in workerd
```

- `bun test` and `bun run typecheck` are the gate. `.github/workflows/test.yml` runs both on every PR, unfiltered.
- **There is no formatter and no general linter.** No biome, eslint or prettier. Match the file you are in, and do not add one without asking.
- `bun dev` does not exercise the Workers runtime. Run `bun run preview:web` before shipping anything that touches web's server runtime or bindings.
- `discord-bot` and `ingest-worker` spell it `type-check`. Everything else uses `typecheck`.
- Validate a migration by running it. `bun run db:local:reset` surfaces the SQL error that reading it will not.

## Pull requests

- Never make a PR unless the developer explicitly asks you to do so.
- Conventional commit titles, plain language: fix(web): new threads no longer spike CPU.
- Body: the problem in a sentence or two, then how you fixed it. End with the model and harness that did the work.
- UI changes need before/after images. Motion or timing needs a short video.
- Upload PR evidence to GitHub. Never commit PR-only screenshots or assets such as .github/pr-assets/.
- One concern per PR. If the description says "also", split it.
- When babysitting: poll checks and comments newer than the last push, verify each bot finding against the source, fix real ones, dismiss false positives with a written reason. Stay quiet when nothing is new. Stop when the bots are green on the latest commit.

## Plans and work artefacts

- Do not commit implementation plans, research notes, or agent scratch files. Keep temporary working material outside the worktree — nothing in `.gitignore` will catch it for you.
- Track active maintainer work in the GitHub issue or project item that owns it. External proposals belong in Ideas discussions.
- Durable architecture and decisions go in the package's own `docs/`, which the Docusaurus site reads in place. Update them when the product changes.
- Rules an agent can break go in the nearest AGENTS.md. Reference it reads once goes in `docs/`. Neither, and it is probably not worth writing.
- A merged PR is the implementation record. Close or update its tracking item when the work lands; do not preserve a second checklist in the repository.

## How it works

**The card model.** Two levels. A field belongs to exactly one of them.

- **Oracle** is the rules object: name, type, tags, domains, rules text, keywords, relationships. Its id is a UUID.
- **Printing** is one physical card: art, artist, flavour, rarity, collector number, set, marketplace data. Its id is a text ObjectId.
- `oracle_key` is a name-derived lookup slug, never identity. `oracleKeyForName()` uses it at one moment: when ingest guesses which oracle a new printing joins.
- A printing it cannot match goes to review rather than silently creating a second oracle.

**The catalogue.** `packages/ingest-worker`, every six hours, no user involved.

- RiftCodex is the only source that may create a card. TCGPlayer and Riot's gallery enrich or observe, and either failing is non-fatal.
- Fetch, dedupe, group printings into oracles, enrich, emit deltas, upsert in bounded batches, prune only once all of them land.
- A trigger maintains `resolved_printings`, the flat projection search reads.
- What cannot be reconciled goes to `reconciliation_queue` for `/admin/review`. Never auto-applied.

**Accounts.** Supabase Auth, no ingest involved.

- `auth.users` plus a 1:1 `profiles` row: handle, username, bio, pronouns, social links.
- `follows` is a public social graph. `linked_accounts` holds Metafy, which drives supporter perks.
- Decks are `decks` (`owner_id`), `deck_cards`, `deck_collaborators` and `deck_revisions`.

**Where the halves meet.** One table, and only one.

- `deck_cards` carries both `oracle_id` and `printing_id` behind a composite foreign key.
- Rebuild printing ids and every deck loses its cards. This is why they must stay stable.

**Who enforces access.**

- The API Worker holds a service-role key and bypasses RLS. Migration policies are defence in depth, not the boundary.
- `canRead()` and `canWrite()` in `packages/api/src/routes/decks.ts` decide deck access; `ADMIN_USER_IDS` decides admin.
- Roles are `owner`, `editor`, `viewer`. `owner` is computed from `owner_id`, never stored, and visibility is orthogonal to role.
- Web's `requireAuth()` and `requireAdmin()` are UX gates. A deck you may not read answers 404, never 403.

## Where code lives

Read a package's own AGENTS.md before changing it. This is the map, not the detail.

- `packages/types` — shared types, parser, deck model and validation, slug and image derivation. Zero dependencies; keep it that way.
- `packages/core` — `CardDataProvider`, the Supabase provider, search grammar and its SQL renderer. Consumed by the API only.
- `packages/api` — Elysia REST API on Workers. Owns `/api/v1` and the real authorisation boundary.
- `packages/web` — Next.js App Router on Workers via OpenNext.
- `packages/discord-bot` — Worker, slash commands.
- `packages/ingest-worker` — scheduled ingest and image hosting. Never import `@riftseer/core` here; it pulls in Node built-ins Workers cannot load.
- `packages/raycast-extension`, `packages/reddit-bot` — standalone npm projects outside the workspace.
- `docs` — Docusaurus, a workspace member, reads each package's `docs/` in place.
- `supabase/migrations` — append-only after the squashed baseline.
- `scripts`, `docker` — repository checks, the test harness, the local database stack.
- `packages/frontend` is dead but not deletable: `.github/workflows/discord-bot.yml` path-filters on its `public/icons/**`.

## Invariants

Each of these already cost us something. Breaking one usually fails silently.

- Rarity is printing-level. Sources disagreeing about it is real data, not review-queue noise.
- Printing ids must survive a rebuild. `deck_cards` rows and hosted image URLs are both keyed on them.
- A `printing_deltas` row means the card genuinely differs from its oracle. `locked_fields` means an admin decided. Never conflate them.
- Ingest owns `source='ingest'` rows and never touches `source='admin'`. That plus soft deletes is the whole durability story — no override overlay.
- Relationships are oracle-to-oracle edges stored once. `used_by` is a reverse query, not a second row.
- Search never resolves deltas at query time. `card_search_ast_to_sql` scans `resolved_printings`, exactly one flat relation.
- The search grammar is also the ruling rule language. A leaf that cannot render to SQL must not parse.
- Legality is default-legal. Only non-legal statuses are stored; precedence is printing row, then oracle row, then legal.
- Format limits are data in `format_zone_rules`, never database constraints. Changing a format cannot make a saved deck unloadable.
- Image URLs, slugs and keywords are derived, with one derivation each. Slugs are pinned on first insert so public URLs never drift.
- A `might_bonus` of `0` is a real printed value. Presence decides equipment, never truthiness.

## Legal and consent

Legal copy is code here, and it goes stale the same way code does.

- Copy lives in `packages/web/src/views/privacy-view.tsx` and `terms-view.tsx`. Change the copy, change the "Last updated" date in the same diff.
- Material changes bump `LEGAL_PRIVACY_VERSION` or `LEGAL_TERMS_VERSION` in `packages/api/wrangler.jsonc`, then need an API redeploy.
- Those versions are stamped at registration and read nowhere else. A bump prompts nobody to re-accept; there is no re-consent flow to hook into.
- A new column storing something about a person is a privacy-page change. So is new logging, a new third party, or changed bot behaviour.
- Terms carry a 13+ age floor and Riot's Legal Jibber Jabber attribution. Keep that attribution on anything showing card art or data.
- Consent is c15t. `C15T_DATABASE_URL` is a transaction-pooler URL and must keep `prepare: false` and `max: 1`.
- The terms prohibit API abuse but nothing enforces it. There is no rate limiting, and `getRedisClient()` has no callers.
- The privacy policy predates profiles, follows and decks, naming only email and password. Raise this before extending those tables.

## Taste

- Inferred types over annotations. `any` is the enemy.
- Comments describe how a thing is used, and move when the code moves. To be used mostly to describe functions, not to annotate every line of behavior.
- If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it.

## Additional tips

- Don't verify with browsers or computer use unless the user explicitly agrees or requests it.
- Security is important, but should not be over-indexed on, especially for dev mode/maintainer-only features.
- Never co-author with the user for PRs or commits.
