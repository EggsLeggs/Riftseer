---
title: Supabase environments
---

RiftSeer services can talk to either your **live Supabase project** or a **local Supabase stack**. They only care about the URL and service-role key you provide via environment variables.

## Production Supabase project

Use this for day-to-day development when you just want real data behind the API/site/bots:

- `SUPABASE_URL` points at your hosted project (for example `https://<project>.supabase.co`).
- `SUPABASE_SERVICE_ROLE_KEY` is the production service-role key with insert/update rights.
- The ingest pipeline is idempotent, so running it repeatedly just refreshes data instead of duplicating it.

This is the simplest way to keep your production database up to date from RiftCodex.

## Local Supabase stack

Use a local stack when you:

- Are iterating on the ingest pipeline itself.
- Want to test schema changes and migrations without touching production.
- Need to experiment with destructive changes (dropping columns, backfills, etc.).

Typical setup (see the root `README.md` for details):

- Start Supabase locally with the CLI.
- Apply the migrations from the `supabase/migrations/` folder.
- Use these environment values when running the API, ingest worker, or any other Supabase-backed service locally:
  - `SUPABASE_URL = http://127.0.0.1:54321`
  - `SUPABASE_SERVICE_ROLE_KEY` is the well-known local service-role key from the Supabase docs.

## How RiftSeer uses Supabase

Regardless of which environment you point it at, Supabase-backed services in RiftSeer (API, ingest worker, future microservices):

1. Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment.
2. Perform their reads/writes against that target (for example: the ingest pipeline runs fetch → enrich → link → upsert).
3. Only change **data** – schema changes still come from migrations under `supabase/migrations/`.

