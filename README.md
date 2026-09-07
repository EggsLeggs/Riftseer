# Riftseer

Riftseer is a data platform for the Riftbound TCG: a card catalogue ingested
from RiftCodex every six hours, a REST API over it, and the clients that read
that API. Think Scryfall plus Moxfield, for Riftbound.

The API is public at `https://api.riftseer.com/api/v1`. Everything a client
shows, it got from there; no client talks to the database.

## What lives where

| Package                  | What it is                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/types`         | Shared types, card-text parser, deck model and validation. Zero runtime dependencies so Workers, Devvit and browsers can all import it. |
| `packages/core`          | `CardDataProvider`, the Supabase provider, the search grammar and its SQL renderer. Consumed by the API only.                           |
| `apps/api`               | Elysia REST API on Cloudflare Workers. Owns `/api/v1` and the authorisation boundary.                                                   |
| `apps/web`               | riftseer.com. Next.js App Router, deployed to Workers via OpenNext.                                                                     |
| `apps/ingest-worker`     | Scheduled ingest from RiftCodex, TCGPlayer enrichment, image hosting.                                                                   |
| `apps/discord-bot`       | Slash commands on a Worker.                                                                                                             |
| `apps/reddit-bot`        | Devvit app answering `[[Card Name]]` on Reddit. Standalone npm project.                                                                 |
| `apps/raycast-extension` | Card search in Raycast. Standalone npm project.                                                                                         |
| `supabase/migrations`    | The schema, append-only after the squashed baseline.                                                                                    |

## Running it

You need [Bun](https://bun.sh) ≥ 1.3 and Docker.

```bash
bun install
bun run db:local:up   # Postgres + PostgREST behind a Supabase-shaped proxy
bun dev               # API on :8789 and web on :3000, against the local database
```

`bun dev` is pinned to the local docker database. `bun run dev:prod` points at
whatever `apps/api/.dev.vars` holds, which is conventionally production;
it is the explicit opt-in, not the default.

The local catalogue starts empty. Fill it with a real ingest run:

```bash
bun run dev:ingest:local              # ingest worker on :8787
curl -X POST localhost:8787/ingest    # pulls the full catalogue from RiftCodex
```

## Checking your work

```bash
bun run check
```

That is the workspace gate (`.github/workflows/test.yml`): lint, format,
typecheck for every Bun workspace package, the test suite, guidance-file
reference checks, markdown lint, dependency boundary rules, wrangler
consistency and OpenAPI spec drift.

`apps/reddit-bot` and `apps/raycast-extension` sit outside the workspace and
are gated separately by `.github/workflows/standalone.yml` (`npm ci` plus
`tsc --noEmit` in each). Both gates must pass.

## The data model, in three sentences

An **oracle** is the rules object: name, type, rules text, keywords. A
**printing** is one physical card of that oracle: art, set, collector number,
rarity, prices. Decks reference both, which is why printing ids must survive
an ingest rebuild.

`CONTEXT.md` is the glossary for that model and everything around it.
`AGENTS.md` carries the invariants and the map of the codebase, and
`docs/standards.md` contains the prose and code rules. Read them before changing
anything; they are written for exactly that.

## License and attribution

Source terms are in [LICENSE](LICENSE). The public API may be used under the
conditions described there.

Riftseer is unofficial fan content, not approved or endorsed by Riot Games.
Card data and art are the property of Riot Games under their
[Legal Jibber Jabber](https://www.riotgames.com/en/legal) fan-content policy.
