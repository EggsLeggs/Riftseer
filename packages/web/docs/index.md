---
title: Web Overview
sidebar_label: Overview
sidebar_position: 1
---

`@riftseer/web` is the public Riftseer site: a Next.js App Router app deployed to Cloudflare Workers through OpenNext. It talks to the [Riftseer API](/api/) for all card, deck and auth data — never to Supabase directly (except the c15t consent backend).

- **Production:** `https://riftseer.com`
- **Local Node dev:** `http://localhost:3000` (does not exercise the Workers runtime)

---

## Stack

| Piece | Choice |
| --- | --- |
| Framework | Next.js App Router |
| UI | React 19, Tailwind, shadcn/ui |
| Data | Eden Treaty client → Elysia API; TanStack Query on the client |
| Deploy | `@opennextjs/cloudflare` + Wrangler |
| Consent | c15t (Postgres via Supabase transaction pooler) |

---

## Source layout

```text
src/
├── app/          Routing, layouts, metadata — keep business logic out
├── views/        Page compositions
├── features/     Domain behaviour and API access (cards, decks, admin, auth)
├── components/   Reusable UI
└── lib/          Env, session, Eden client, shared helpers
```

Server components are the default. Client components are for state, interactivity or browser APIs only.

---

## Running locally

From the monorepo root (after `bun install` and a filled `.env`):

```bash
bun dev          # API (:8789) + web (:3000) together
bun run dev:web  # Web only — expects NEXT_PUBLIC_API_URL
```

Inside `packages/web`:

```bash
cp .env.local.example .env.local
bun dev              # Node development server
bun run typecheck
bun run preview      # OpenNext build + local workerd — required before deploy
bun run deploy
```

`bun dev` does not run the Workers runtime. Use `bun run preview` after dependency, binding or server-runtime changes.

### Environment

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Riftseer API base (local default `http://localhost:8789`) |
| `NEXT_PUBLIC_APP_URL` | Public site origin (OAuth / email `redirect_to`) |
| `C15T_DATABASE_URL` | Supabase transaction pooler URI for consent (port 6543, `?prepare=false`) |

Public values must match at **build time** and **Worker runtime**. `wrangler.jsonc` owns runtime bindings; Workers Builds (or CI) must supply the same public vars used for the Next.js build.

---

## Architecture boundaries

- All Riftseer data and auth go through the Elysia API. Do not import Supabase in page, view or feature code.
- API calls live in feature modules. The Eden client in `src/lib/api/client.ts` is the public contract; `src/lib/api/request.ts` owns shared timeout / no-store / `CardApiError` handling.
- Cards always carry an oracle (rules) and a printing (art, rarity, marketplace). Prefer API-provided `riftseer_uri` and `cardHref()` / `oracleHref()` over hand-built URLs.
- `/card/<printing-id>` remains a permanent compatibility redirect to the pinned public slug.
- Search syntax is also the ruling-rule language — when fields change, update `src/views/search-syntax-view.tsx` and the [API search docs](/api/search).
- Canonical legal copy lives in `src/views/privacy-view.tsx` and `src/views/terms-view.tsx`. Material policy changes also need the matching API legal-version bump.

---

## Deployment

```bash
cd packages/web
bun run preview   # verify under workerd
bun run deploy    # OpenNext build + Wrangler production deploy
```

Configure the Worker in `wrangler.jsonc`. Regenerate types after binding changes with `bun run cf-typegen`.
