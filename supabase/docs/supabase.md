# Database environments

Riftseer's services only care about a `SUPABASE_URL` and a `SUPABASE_SERVICE_ROLE_KEY`. Two things answer to those: the hosted Supabase project, and the local docker stack.

## Local stack

`bun run db:local:up` starts Postgres on `:55432`, PostgREST, and a proxy on `:54321` that makes PostgREST answer to the URL shape supabase-js expects, so the API, the ingest worker and the tests run unmodified production code against it. Nothing is a mock: `postgres` applies the real files in `supabase/migrations/` on first start, and `bun run db:local:reset` drops the volume and rebuilds from them.

The `:local` dev scripts (`bun dev`, `bun run dev:api:local`, `bun run dev:ingest:local`) load each Worker's committed `.dev.vars.local`, which holds docker placeholders. Leaving `:local` off uses `.dev.vars`, which is conventionally production; swapping is a different command, never an edited file, so neither can be left pointing somewhere by accident.

The local catalogue starts empty. Fill it with `bun run dev:ingest:local` and `curl -X POST localhost:8787/ingest`.

`bun run db:local:psql` opens a shell. `bun scripts/database-tests/database.mjs setup | reseed | query <sql>` drives the test database and its fixture; `bun run test:db` runs the SQL-level tests against it.

## Migrations

`supabase/migrations/` is append-only after the squashed baseline. Validate a migration by running it: `bun run db:local:reset` surfaces the SQL error that reading it will not, and PostgREST catches shape bugs `psql` cannot (an embedded one-to-one comes back as an object or null, never an array).

Production is migrated by `.github/workflows/db-migrate.yml`, dispatched by hand. It is a dry run by default; `apply=true` takes an encrypted `pg_dump` backup, uploads it as a workflow artifact, then applies each missing file in filename order, one transaction per file, recording it in `supabase_migrations.schema_migrations`. It reads the `SUPABASE_DB_URL` secret, the same one the ingest-worker deploy gate verifies against.

## Hosted project

Point `SUPABASE_URL` at the hosted project and `SUPABASE_SERVICE_ROLE_KEY` at its service-role key in the Worker's gitignored `.dev.vars`, then use `bun run dev:prod`. Check `curl localhost:8787/` before an ingest: it reports the host the worker would write to plus a `local` flag, and an ingest rewrites the whole catalogue.

The API Worker holds the service-role key and bypasses row-level security. The policies in the migrations are defence in depth; the authorisation boundary is the API's route code.
