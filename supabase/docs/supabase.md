---
title: Supabase environments
---

Riftseer services can talk to either your **live Supabase project** or a **local Supabase stack**. They only care about the URL and service-role key you provide via environment variables.

## Production Supabase project

Use this for day-to-day development when you just want real data behind the API/site/bots:

- `SUPABASE_URL` points at your hosted project (for example `https://<project>.supabase.co`).
- `SUPABASE_SERVICE_ROLE_KEY` is the production service-role key with insert/update rights.
- The ingest pipeline is idempotent, so running it repeatedly just refreshes data instead of duplicating it.

This is the simplest way to keep your production database up to date from RiftCodex.

---

## Local Supabase stack

Use a local stack when you:

- Are iterating on the ingest pipeline itself.
- Want to test schema changes and migrations without touching production.
- Need to experiment with destructive changes (dropping columns, backfills, etc.).

### Prerequisites

1. **Docker** — Supabase runs Postgres, API gateway, Studio, and related services in containers. Install [Docker Desktop](https://docs.docker.com/desktop/) (or another engine) and keep it **running** before you start the stack.
2. **Supabase CLI** — Install the CLI so you can start/stop the stack and run migrations:
   - **macOS (Homebrew):** `brew install supabase/tap/supabase`
   - **npm/npx:** you can use `npx supabase <command>` from the repo root without a global install.

This repo already includes `supabase/config.toml` at the monorepo root (project id `riftseer`). You do **not** need to run `supabase init` unless you are bootstrapping a new project from scratch.

### Start the stack (from the repository root)

Run everything from the **monorepo root** (the directory that contains `supabase/config.toml`):

```bash
cd /path/to/riftseer

# First run: pulls Docker images (can take a few minutes)
supabase start
```

When startup finishes, the CLI prints:

- **API URL** — defaults to `http://127.0.0.1:54321` (see `[api].port` in `supabase/config.toml`).
- **Studio URL** — typically `http://127.0.0.1:54323` (local dashboard for SQL, tables, and logs).
- **Keys** — `anon` and `service_role` JWTs. For Riftseer you need the **service role** key (same privileges as production for server-side tools).

If you lose the printed output, run:

```bash
supabase status
```

### Apply migrations

Schema lives in `supabase/migrations/`. The CLI treats the **local** Docker stack and a **linked hosted** project as different targets — use the right command for each.

#### Local database (`supabase start`)

These commands talk to Postgres on your machine (default API `http://127.0.0.1:54321`). Run them from the **repo root** after `supabase start`.

| Command | What it does |
| --- | --- |
| `supabase db push --local` | Applies **pending** migration files (anything not yet recorded in the local `supabase_migrations` table). Use this after you add or change SQL under `supabase/migrations/` and want the local DB updated without wiping data. The CLI will list migrations it is about to apply; confirm when prompted. |
| `supabase db reset` | **Drops** the local database, reapplies **all** migrations from scratch in filename order, then runs seed files if `[db.seed]` is enabled in `config.toml`. Use when local migration history is confused, you hit duplicate-object errors, or you want a clean slate. **Destructive** — all local data in that DB is removed. |

Examples:

```bash
# Incremental: apply only new migrations to local
npx supabase db push --local

# Full replay: wipe local DB and run every migration file (destructive)
npx supabase db reset
```

Prefer `npx supabase …` if the CLI is not installed globally.

#### Hosted project (staging / production)

Link the CLI to the project once (get **Reference ID** from Supabase Dashboard → Project Settings → General):

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

| Command | What it does |
| --- | --- |
| `supabase db push` | Applies pending migrations to the **linked remote** project. **Do not** pass `--local`. The CLI lists pending files; confirm when prompted. |

This does **not** update your local Docker DB — use `db push --local` for that. You can also paste migration SQL in the Dashboard → SQL Editor for one-off fixes (keep `supabase/migrations/` the source of truth in git).

### Point Riftseer at local Supabase

Set these in the **root** `.env` (see also the root `README.md` local Supabase section):

```env
CARD_PROVIDER=supabase
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<service_role JWT from supabase start / supabase status>
```

The local development stack uses a **well-known demo service-role JWT** that is the same for every fresh `supabase start`; the root `README.md` includes it for copy-paste. Prefer copying the key from `supabase status` so it always matches your CLI version.

Bun loads `.env` from the working directory; the API is usually started from the repo root or via scripts that pass `--env-file` to the root `.env`, so keep Supabase variables in the **root** `.env`.

### Load card data locally

The API and `SupabaseCardProvider` read whatever is in Postgres. After migrations, tables are empty until you run the **ingest pipeline**. Point the ingest worker at the same `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then trigger an ingest (see `packages/ingest-worker` and `CLAUDE.md` for `wrangler dev` and `/ingest`).

HTTP search behaviour (exact match vs full-text fallback) is documented in `packages/api/docs/search.md`, not here.

### Stop the stack

```bash
supabase stop
```

This stops containers and frees ports; it does not delete Docker volumes by default (your local DB data may persist until you remove volumes or run `supabase db reset`).

### Troubleshooting

- **`Cannot connect to the Docker daemon`** — Start Docker Desktop (or your Docker service).
- **Port already in use** — Another process is bound to `54321` / `54322` / `54323`. Stop the other service or change ports in `supabase/config.toml` under `[api]` and `[studio]`.
- **Migration errors** — Fix the SQL in the migration file or repair local state with `supabase db reset` (only on local).
- **`Remote migration versions not found in local migrations directory`** (often with `db push --local`) — The local DB’s migration history references a version that has no matching file in `supabase/migrations/`. Ensure your git branch includes every migration that was ever applied to that DB, or use `supabase migration repair` as described in the CLI output. After aligning files, run `supabase db push --local` or `supabase db reset` again.

---

## How Riftseer uses Supabase

Regardless of which environment you point it at, Supabase-backed services in Riftseer (API, ingest worker, future microservices):

1. Read `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment.
2. Perform their reads/writes against that target (for example: the ingest pipeline runs fetch → enrich → link → upsert).
3. Only change **data** – schema changes still come from migrations under `supabase/migrations/`.
