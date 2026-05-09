@AGENTS.md

# packages/web — Riftseer Web

Next.js frontend for Riftseer — a card database and deck builder for the Riftbound TCG.

> **Replaces `packages/frontend`** — that package is deprecated and will be removed.

## Stack

- **Next.js** (App Router, deployed to Cloudflare Workers via `@opennextjs/cloudflare`)
- **@elysiajs/eden** — Eden treaty client for end-to-end type safety against the Elysia API
- **Supabase Auth** handled entirely via Elysia — never called directly from this app
- **TanStack Query** for client-side server state
- **shadcn/ui** + Tailwind for UI components and styling
- **Zod** for form validation and env parsing only
- **react-hook-form** for form state management
- **Bun** as runtime and package manager

## Commands

```bash
bun dev             # Next.js dev server (Node.js runtime — fast iteration)
bun run preview     # Build and run in workerd runtime — test before deploying
bun run deploy      # Build and deploy to Cloudflare Workers
bun typecheck       # tsc --noEmit
bun run cf-typegen  # Regenerate cloudflare-env.d.ts
```

## Architecture

### Core rule

All data fetching and auth go through the Elysia API. **Never import or call Supabase directly** — not in server components, not in server actions, not anywhere. The Eden treaty client lives in `src/lib/api/client.ts` and is typed via `import type { App } from "@riftseer/api"`.

### Route groups

- `(auth)` — login, register — no app chrome, unauthenticated
- `(marketing)` — public-facing pages — minimal layout
- `(app)` — authenticated app shell — full nav, auth guard in `layout.tsx`

### Layer separation

- `app/` — routing and layouts only, no logic — pages import from `views/`
- `views/` — page-level components, compose from `features/` and `components/`
- `features/` — all business logic, API calls, and domain-specific hooks
- `components/` — pure UI components, no business logic or API calls
- `providers/` — React context providers and TanStack Query setup
- `lib/` — utilities, API client, env validation

## Project structure

```
src/
  app/
    (auth)/
      login/page.tsx
      register/page.tsx
    (marketing)/
      page.tsx
    (app)/
      layout.tsx
      decks/
        page.tsx
        [id]/page.tsx
      collection/page.tsx
      settings/page.tsx
  layout.tsx
  views/
    auth/
      login-view.tsx
      register-view.tsx
    decks/
      deck-list-view.tsx
      deck-detail-view.tsx
    collection/
      collection-view.tsx
  features/
    auth/
      hooks/use-session.ts
      api.ts
      types.ts
    decks/
      hooks/
        use-decks.ts
        use-deck-builder.ts
      api.ts
      types.ts
    collection/
      hooks/use-collection.ts
      api.ts
      types.ts
    cards/
      hooks/use-card-search.ts
      api.ts
      types.ts
  components/
    ui/           # shadcn/ui components — do not edit manually
    layout/
      navbar.tsx
      sidebar.tsx
  providers/
    query-provider.tsx
    session-provider.tsx
    index.tsx
  hooks/          # shared hooks not belonging to a feature
  utils/          # shared utilities
  types/          # global types shared across multiple features
  assets/
  styles/
  lib/
    api/
      client.ts   # Eden treaty client
    env.ts        # Zod env validation — only place process.env is accessed
middleware.ts
```

## Environment variables

All env vars are validated at startup in `src/lib/env.ts` using Zod. **Never access `process.env` directly outside that file.** Public vars use `NEXT_PUBLIC_` prefix. Copy `.env.local.example` to `.env.local` and fill in values.

```ts
// src/lib/env.ts
import { z } from 'zod'

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
})

export const env = schema.parse(process.env)
```

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Riftseer API base URL (e.g. `https://api.riftseer.com`) |

Build-time variables must be set in the **Workers Builds dashboard**, not just in `.env.local`.

## Cloudflare Workers constraints

- Deployed via `@opennextjs/cloudflare` — do **not** add `export const runtime = 'edge'` to any route file; the adapter handles this
- Node.js in Middleware is not yet supported — keep `middleware.ts` minimal and Edge-compatible
- Bundle size limit is 3 MiB gzip on free tier, 10 MiB on paid — audit server-side deps if builds start failing
- Always test with `bun run preview` before deploying — `bun dev` runs in Node.js and will not catch Workers-specific issues
- `nodejs_compat` flag must be set in `wrangler.jsonc` — do not remove it

## Code style

- No default exports except for Next.js pages and layouts — named exports everywhere else
- Co-locate types with the feature they belong to — only promote to `types/` if genuinely shared across multiple features
- Prefer server components — add `'use client'` only when interactivity or browser APIs are needed
- All API calls go through `features/[name]/api.ts` — no inline fetches in components or views
- All client-side data fetching uses TanStack Query — no raw `fetch` in client components
- Server actions for auth form submissions only
- Feature API files export a plain object: `export const decksApi = { ... }`

## Naming conventions

- Components: PascalCase
- Hooks: camelCase prefixed with `use`
- Files: kebab-case
- Directories: kebab-case

## Zod usage

Zod is used for two things only:
1. Form validation with `react-hook-form`
2. Env var validation in `src/lib/env.ts`

Do not use Zod to type API responses — Eden treaty handles that from the Elysia types.

## TanStack Query conventions

- Query keys live in the feature's `api.ts` alongside the fetcher
- Mutations call the Eden client directly and invalidate relevant queries on success
- Prefetch in server components where possible, pass dehydrated state to client

## Auth flow

### Session storage
Four cookies hold session state (set/read/cleared in `src/lib/session.ts`, server-only):

| Cookie | httpOnly | Purpose |
|--------|----------|---------|
| `rs_access_token` | yes | Supabase JWT (1 h) |
| `rs_refresh_token` | yes | Refresh token (30 d) |
| `rs_expires_at` | no | Unix expiry — readable by client JS |
| `rs_user` | no | `{ id, email }` JSON — readable by client JS |

### Login / register
1. User submits form → server action in `features/auth/actions.ts`
2. Server action calls Elysia `/api/v1/auth/login` (or `/register`) via Eden client
3. On success, `setSessionCookies()` writes the four cookies, then `redirect()`

### Session consumption
- **Server components** call `getSession()` directly at render time (reads cookies)
- **Client components** receive session data as props from their server parent — they never read cookies themselves
- Example: `Navbar` (server component) reads the session and passes `email` down to `UserNav` (client component)

### Token refresh
`middleware.ts` runs on every non-static request. If `rs_expires_at` is within 5 minutes, it calls `POST /api/v1/auth/refresh`, writes fresh cookies onto the response, and continues. On refresh failure it clears all session cookies. No Node.js APIs are used — middleware runs in the Edge/workerd runtime.

### Logout
`logoutAction()` server action: reads the session to get the access token, calls `POST /api/v1/auth/logout`, clears all session cookies, then redirects to `/`.

### Password reset
1. User requests reset → `forgotPasswordAction` calls `/api/v1/auth/forgot-password` with `redirect_to: <origin>/auth/callback`
2. Supabase emails a magic link; on click it redirects to `/auth/callback#type=recovery&access_token=...`
3. `app/auth/callback/page.tsx` (client component) parses the hash, stores the token in `sessionStorage` as `rs_recovery_token`, and redirects to `/auth/reset-password`
4. `resetPasswordAction` reads the token from the form and calls `/api/v1/auth/reset-password`

### Supabase callback hash errors
Supabase can redirect to the app root with errors in the URL hash (e.g. `/#error=access_denied&error_description=...`). Hash fragments are client-side only — middleware cannot see them. The callback page (`app/auth/callback/page.tsx`) handles error hashes when Supabase redirects there, but errors landing on `/` are currently unhandled. **TODO:** add a client component on the root page to detect and surface these errors.

## Legal pages

When legal pages (`PrivacyPage`, `TermsPage`) are migrated from `packages/frontend`, the root CLAUDE.md legal pages section must be updated to point here. Until then, `packages/frontend` remains authoritative for legal content.
