---
title: Getting Started
sidebar_label: Getting Started
sidebar_position: 1
---

Riftseer is a Riftbound TCG card data platform. It exposes a REST API, a Next.js web site, and a set of bots and extensions that all share the same card data model.

## What's in the monorepo

| Package | Path | Description |
| --- | --- | --- |
| Types | `packages/types/` | Shared card types, parser, icons, slug and image helpers |
| Core | `packages/core/` | `CardDataProvider` interface, Supabase provider, search |
| API | `packages/api/` | ElysiaJS REST API on Cloudflare Workers |
| Web | `packages/web/` | Next.js App Router site on Cloudflare Workers |
| Ingest Worker | `packages/ingest-worker/` | Cloudflare Worker — scheduled ingest from RiftCodex into Supabase |
| Discord Bot | `packages/discord-bot/` | Slash commands on Cloudflare Workers |
| Reddit Bot | `packages/reddit-bot/` | `[[Card Name]]` mention triggers via Devvit (standalone npm project) |

---

## Prerequisites

- **[Bun](https://bun.sh) ≥ 1.2** — required. The API layer (Elysia) is Bun-first and will not work on Node.
- A **Supabase** project with the schema applied (see [Supabase docs](/supabase/supabase)).
- Optionally: a Cloudflare account for the Discord bot, ingest worker, and web deploy.

---

## Running locally

### 1. Install dependencies

```bash
bun install
```

This installs all workspace dependencies in one pass. The Reddit bot (`packages/reddit-bot/`) is excluded from the workspace — `cd` into it and run `npm install` separately if needed.

### 2. Configure environment

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

The minimum required variables to run the API against Supabase:

| Variable | Purpose |
| --- | --- |
| `CARD_PROVIDER` | Set to `supabase` |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service-role JWT |

See the full variable reference in the [API docs](/api/).

### 3. Start the dev server

```bash
bun dev          # API (:8789) + web (:3000) together
bun run dev:api  # API only — Swagger UI at http://localhost:8789/api/swagger
bun run dev:web  # Web only
```

---

## Running tests

```bash
bun test
```

Tests use `bun test` (Jest-compatible). API route tests use `app.handle(new Request(...))` — no live server needed.

---

## Architecture overview

```mermaid
graph TD
  RC[RiftCodex API] -->|scheduled ingest| IW[Ingest Worker<br/>Cloudflare Worker]
  IW -->|upsert| SB[(Supabase)]
  SB -->|SupabaseCardProvider| API[Riftseer API<br/>ElysiaJS / Workers]
  API --> WEB[Web<br/>Next.js / Workers]
  API --> DB[Discord Bot<br/>Cloudflare Workers]
  API --> RB[Reddit Bot<br/>Devvit]
```

- **Catalogue data flows in one direction**: RiftCodex → Ingest Worker → Supabase → API → clients.
- **The API never writes card catalogue data to Supabase** — catalogue writes are done by the ingest worker (account/deck/admin routes are separate).
- **Bots call the public API**, not the provider directly.

---

## Next steps

| Topic | Link |
| --- | --- |
| REST API reference | [API](/api/) |
| Next.js site | [Web](/web/) |
| Card data types and provider interface | [Core](/core/) |
| Discord and Reddit bots | [Clients & Bots](/bots/) |
| Ingest pipeline | [Ingest Worker](/ingest-worker/) |
| Database schema | [Supabase](/supabase/supabase) |
| This docs site | [Docs Site](./docusaurus.md) |
