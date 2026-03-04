---
title: Running the ingest worker locally
sidebar_label: Running locally
---

This guide covers how to run the ingest worker in local development.

At a high level, you will:

1. Ensure Supabase is available (either your production project or a local stack)
2. Provide the required environment variables to the worker
3. Run the worker in `wrangler dev`
4. Trigger the ingest endpoint manually

## Prerequisites

- Bun (≥ 1.2)
- Node.js (≥ 20) (for Docusaurus and some tooling)
- Docker (optional but recommended if you want a local Supabase stack)

You should also have the root `.env` file configured as described in the main `README.md` / `CLAUDE.md`, including the Supabase URL and service role key if you are using Supabase as the backing store.

## Required environment variables

The ingest worker expects these environment variables at runtime:

- `SUPABASE_URL` – Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` – service-role key with insert/update permissions
- `INGEST_SECRET` (optional) – if set, HTTP requests to `/ingest` must include `Authorization: Bearer <INGEST_SECRET>`

When running via `wrangler dev`, you can provide these using `.dev.vars` or `wrangler secret` as usual.

## Running wrangler dev

From the repo root:

```bash
cd packages/ingest-worker
bun run dev
```

This runs `wrangler dev` using the local worker code. Check `wrangler.toml` in this package for the exact configuration of the worker name, routes, and schedule.

## Triggering ingest

With `wrangler dev` running, you can trigger ingest in two ways:

### 1. Scheduled event trigger

```bash
curl "http://localhost:8787/cdn-cgi/mf/scheduled"
```

This simulates the Cloudflare scheduled event the worker would receive in production.

### 2. Manual HTTP trigger

```bash
curl -X POST "http://localhost:8787/ingest"
```

If `INGEST_SECRET` is set, include it:

```bash
curl -X POST \
  -H "Authorization: Bearer $INGEST_SECRET" \
  "http://localhost:8787/ingest"
```

The worker will fetch the latest card data from RiftCodex, run the ingest pipeline, and upsert into Supabase using the configured credentials.

