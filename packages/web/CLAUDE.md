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

### Card detail route

Both routes live under one **`[slug]`** dynamic segment (Next.js forbids sibling
`[id]` and `[set]` folders — same depth must share one param name). Both render
`views/cards/card-detail-view.tsx`:

- **`app/card/[slug]/page.tsx`** — `/card/<printing-id>` legacy URLs. Fetches by id,
  then `permanentRedirect`s to the canonical slug path when `public_slug` is set.
- **`app/card/[slug]/[collector]/[[...slugTail]]/page.tsx`** — canonical slug paths:
  `/card/<set>/<collector>/<name>` or `/card/<set>/<collector>/signature/<name>`.
  Joins the segments into a `public_slug`. `/card/<set>/<collector>` with no name
  returns 404.

Both call **`cardsApi.getDetail()`** → `GET /api/v1/cards/detail?id=…|slug=…`, which
returns the whole page in one round-trip: the card plus its printings, tokens,
champions/legends and resolved marketplace links. **All sorting, deduplication and
URL building happens in the API** (`buildCardDetail` in `@riftseer/core`) — do not
add derived card logic to the view. The fetch is wrapped in React `cache()` so
`generateMetadata` and the page share one request.

`features/cards/api.ts` uses `AbortSignal.timeout` (12s) and `cache: "no-store"` so requests fail fast instead of hanging; `app/card/error.tsx` shows user-facing copy (no stack traces or dev jargon).

Build URLs with `cardHref()` from `features/cards/paths.ts` for same-origin links
(dev, preview and production all differ), and `card.riftseer_uri` when you need an
absolute URL. Never assemble card paths by hand.

### Card rendering pieces

| File | Purpose |
|------|---------|
| `views/cards/card-detail-view.tsx` | Server component — the whole card page |
| `features/cards/card-text.tsx` | Renders rules text: `:rb_*:` → icons, `[Keyword]` → rhombus badges, `_…_` → italics |
| `features/cards/card-icons.tsx` | Energy/power/might/rarity/domain glyphs and the type line |
| `features/cards/card-printings-table.tsx` | Table used for printings, tokens and champions/legends |
| `features/cards/card-art.tsx` | Client island — image with landscape rotate toggle |
| `features/cards/copy-button.tsx` | Client island — clipboard + toast, copies literal text or a fetched URL |
| `features/cards/share-button.tsx` | Client island — Web Share API with clipboard fallback |
| `features/cards/seo.ts` | `cardMetadata()` for `generateMetadata` — title, description, OG/Twitter, canonical |
| `features/cards/format.ts` | Framework-free formatters — import these from server components, **not** `card-display.tsx` (client-only) |
| `app/icons.css` | Icon system CSS (imported from `app/layout.tsx`, not nested under `globals.css` — Tailwind drops that `@import`). Class names are the contract with `TOKEN_ICON_MAP` in `@riftseer/types/icons`. Assets in `public/icons/` |
| `app/keywords.css` | Rhombus keyword badges (Beaufort for LoL). Colours from `KEYWORD_STYLES` in `@riftseer/types/keywords` |

### Layer separation

- `app/` — routing and layouts only, no logic — pages import from `views/`
- `views/` — page-level components, compose from `features/` and `components/`
- `features/` — all business logic, API calls, and domain-specific hooks
- `components/` — pure UI components, no business logic or API calls
- `providers/` — React context providers and TanStack Query setup
- `lib/` — utilities, API client, env validation

### Admin area

`/admin` is the UI over the `/api/v1/admin/*` endpoints (see `packages/api/docs/admin.md`).

| File | Purpose |
|------|---------|
| `lib/session.ts` | `requireAdmin()` gates a route subtree; `isAdminSession()` is the non-throwing check for conditional UI |
| `features/auth/api.ts` | `getCurrentUser(token)` → `GET /auth/me`, wrapped in React `cache()` so one render costs one round-trip |
| `features/admin/types.ts` | Request/response contracts derived from the Eden treaty `App` type — never hand-mirror the Elysia `t` schemas |
| `features/admin/api.ts` | Bearer-token fetches for every admin endpoint. Resolves `AdminResult`, never throws |
| `features/admin/actions.ts` | Server actions — read the session, call `api.ts`, `revalidatePath` the affected pages |
| `features/admin/review-draft.ts` | Prefill for create-from-review (`missing_card` → `/admin/cards/new`) |
| `features/admin/card-id.ts` | `generateCardId()` — 24-char hex IDs in the RiftCodex ObjectId space, for manual cards |
| `features/admin/dates.ts` | `toDateInputValue()` — coerces card/set dates for `<input type="date">` |
| `features/admin/hooks/use-admin-mutations.ts` | TanStack Query mutations + toasts, wrapping the server actions |
| `views/admin/` | Dashboard, card search, new-card form, card editor and its panels, set manager, format manager, rulings manager, review queue, audit log |

`/admin/review` is the ingest reconciliation queue, fed by two observers:
TCGPlayer (products ingest could not attach to a card) and Riot's official card
gallery (printings it lists that we hold no card for), plus field disagreements
from either. `source` on each entry says which one raised it and therefore
whether the payload carries a `product` or a `gallery` card. Nothing applies
itself — **confirm** writes a durable card override (for a product, its
`tcgplayer_id`, so later ingests match it automatically) and **dismiss** is
remembered so the next ingest does not resurface the entry. A `missing_card`
entry has nothing to patch on its own: use **Create** on the row to open
`/admin/cards/new` prefilled from the gallery payload (name, set, collector,
stats, text, flags, and art). Saving creates the card, uploads the gallery
image when present, confirms the queue entry, and stamps
`external_ids.riftbound_id` so later ingests recognise it. You can still
create elsewhere and paste the id into Confirm. Only pending entries are
actionable; the confirmed and dismissed tabs are read-only history. An
unmatched product's card field is pre-filled with ingest's suggestion but stays
editable, because the suggestion is only a same-set collector-number guess.

`/admin/audit` reads `GET /api/v1/admin/audit-log`, the one admin endpoint that
is not a mutation. Its `action` filter list is hard-coded from the RPC names in
`supabase/migrations/20260730120000_phase3_admin_api.sql`; add to it whenever an
admin RPC is added, or the new action silently filters to nothing.

Creating a manual card is a two-step flow: `/admin/cards/new` posts only the
fields that feed `public_slug` (name, set, collector number, signature,
alternate art), because the API pins the slug at creation time; everything else
is filled in on the editor page it redirects to.

`is_admin` is **not** in the session cookie — it comes from `/auth/me` on every
request so revoking `ADMIN_USER_IDS` takes effect immediately. `requireAdmin()`
is a UI gate only; the API enforces the same allowlist on every mutation, so
never treat a client-side check as the security boundary.

`/admin/rulings` manages rulings independently of any one card. A ruling carries
any number of **targets**: a single printing, a whole card, or a *rule* — a saved
search query written in the same language as the site search bar (see
`views/search-syntax-view.tsx`). Rule targets are re-evaluated after every
ingest, so a rule like `t:unit kw:deathknell` picks up cards released after it
was written; the editor shows a live match count from
`POST /admin/rulings/preview` so a rule that matches nothing is obvious before
saving. `targets` **replaces** the whole list on save, like the relationships
endpoint. An entry that is `shared` (several targets, or any rule target) is
shown read-only in the per-card panel and links here, because retargeting or
deleting it there would silently change other cards.

Format legalities and rulings are **not** part of the card patch — they are keyed
on the card's oracle group rather than the printing, so their panels
(`admin-card-legalities-panel.tsx`, `admin-card-rulings-panel.tsx`) save on their
own. Each has an "applies to every printing" toggle: on, the change is shared by
all printings of the card; off, it affects only the printing being edited. For
legality, a card with nothing stored is **legal**, so the `default` option
deletes the row rather than storing a status. `/admin/formats` manages the
formats themselves — deleting one cascades away its stored statuses, so retiring
it (`active: false`) is usually what you want.

Relationship overrides (`admin-card-relationships-panel.tsx`) use the same
apply-to-every-printing toggle. On, entries are stored by `oracle_key` so future
printings inherit them and per-printing exceptions in the group are cleared; off,
only this printing's exceptions are replaced. `GET /cards/:id/relationships`
loads both layers so the editor can round-trip; `PUT` **replaces** the active
scope's list (default `apply_to_all_printings: true`).

Card edits use **JSON merge-patch** semantics: an omitted key is left alone and
an explicit `null` clears the value. `buildCardPatch` diffs the form against the
values it was seeded with and sends only changed leaves — never post a whole
form, or you will overwrite fields another admin just changed. Nested groups
(`attributes`, `classification`, …) are deep-merged by the RPC, so a partial
group is safe.

### Consent (c15t)

Consent uses **@c15t/nextjs** (UI) and **@c15t/backend** (API). Entry points: `src/components/consent-manager/`, `src/app/api/c15t/[...all]/route.ts`, `src/lib/c15t.ts` (Kysely adapter). Root-level `c15t-backend.config.ts` is for backend CLI/migrations.

When changing consent behavior, styling, or integrations: read **version-matched** docs in `node_modules/@c15t/nextjs/docs/README.md` (and `node_modules/@c15t/backend/docs/README.md` for adapter/backend work) before relying on training data. Deeper workflows (customization ladder, scripts, i18n) are documented in the repository c15t skill at `.claude/skills/c15t/SKILL.md` — prefer that over pasting duplicate guidance into this file.

## Project structure

```text
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
    legal-document.tsx   # shared primitives for Privacy / Terms long-form pages
    privacy-view.tsx
    terms-view.tsx
    auth/
      login-view.tsx
      register-view.tsx
    decks/
      deck-list-view.tsx
      deck-detail-view.tsx
    collection/
      collection-view.tsx
  features/
    admin/
      hooks/use-admin-mutations.ts
      api.ts        # bearer-token calls to /api/v1/admin/*
      actions.ts    # server actions + revalidation
      card-form.ts  # editor schema, value mapping, merge-patch diff
      dates.ts
      types.ts
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
proxy.ts
```

## Environment variables

All env vars are validated at startup in `src/lib/env.ts` using Zod. **Never access `process.env` directly outside that file.** Public vars use `NEXT_PUBLIC_` prefix. Copy `.env.local.example` to `.env.local` and fill in values.

```ts
// src/lib/env.ts
import { z } from 'zod'

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
})

export const env = schema.parse(process.env)
```

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Riftseer API base URL (e.g. `https://api.riftseer.com`) |
| `NEXT_PUBLIC_APP_URL` | App public origin — used for OAuth/email `redirect_to` URLs (e.g. `https://riftseer.com`) |

Build-time variables must be set in the **Workers Builds dashboard**, not just in `.env.local`.

## Cloudflare Workers constraints

- Deployed via `@opennextjs/cloudflare` — do **not** add `export const runtime = 'edge'` to any route file; the adapter handles this
- Next.js 16 uses `proxy.ts` (named export `proxy`) instead of deprecated `middleware.ts` — it runs on the **Node.js** runtime; keep logic bounded (token refresh is fine)
- Bundle size limit is 3 MiB gzip on free tier, 10 MiB on paid — audit server-side deps if builds start failing
- Always test with `bun run preview` before deploying — `bun dev` runs in Node.js and will not catch Workers-specific issues
- `nodejs_compat` flag must be set in `wrangler.jsonc` — do not remove it
- `src/workers-shims.d.ts` declares `cloudflare:workers` and `GeneratedEnv`. The type-only `import type { App } from "@riftseer/api"` pulls the API's source into this program, but this tsconfig excludes `../api`, so the API's own ambient types never load. Without the shim `bun run build` fails on `packages/api/src/index.ts`. Extend it if the API imports more Workers-only ambient types

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
| `rs_user` | yes | `{ id, email }` JSON — server-only |

### Login / register
1. User submits form → server action in `features/auth/actions.ts`
2. Server action calls Elysia `/api/v1/auth/login` (or `/register`) via Eden client
3. On success, `setSessionCookies()` writes the four cookies, then `redirect()`

### Session consumption
- **Server components** call `getSession()` directly at render time (reads cookies)
- **Client components** receive session data as props from their server parent — they never read cookies themselves
- Example: `Navbar` (server component) reads the session and passes `email` down to `UserNav` (client component)

### Token refresh
`proxy.ts` runs on every non-static request (Next.js 16 proxy layer, Node.js runtime). If `rs_expires_at` is within 5 minutes, it calls `POST /api/v1/auth/refresh`, writes fresh cookies onto the response, and continues. On refresh failure it clears all session cookies.

### Logout
`logoutAction()` server action: reads the session to get the access token, calls `POST /api/v1/auth/logout`, clears all session cookies, then redirects to `/`.

### Password reset
1. User requests reset → `forgotPasswordAction` calls `/api/v1/auth/forgot-password` with `redirect_to: <origin>/auth/callback`
2. Supabase emails a magic link; on click it redirects to `/auth/callback#type=recovery&access_token=...`
3. `app/auth/callback/page.tsx` (client component) parses the hash, stores the token in `sessionStorage` as `rs_recovery_token`, and redirects to `/auth/reset-password`
4. `resetPasswordAction` reads the token from the form and calls `/api/v1/auth/reset-password`

### Protecting routes

Use `requireAuth(next?: string)` from `src/lib/session.ts` — never use middleware for this.

**Protect an entire route subtree** — add a `layout.tsx` that calls `requireAuth`:
```ts
// app/(site)/settings/layout.tsx
import { requireAuth } from "@/lib/session";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireAuth("/settings");
  return <>{children}</>;
}
```

**Protect a single page** — call `requireAuth` at the top of the page function:
```ts
export default async function SomePage() {
  const session = await requireAuth("/some/path");
  // session is typed Session — use it if you need user data
}
```

`requireAuth` redirects unauthenticated users to `/auth/login?next=<path>`. After login, `loginAction` reads `next` and redirects there. Do not use `proxy.ts` or middleware for auth gating — use this pattern.

**Admin-only routes** — use `requireAdmin(next?)` the same way (see `app/(site)/admin/layout.tsx`). It runs `requireAuth` first, then checks `is_admin` from `/auth/me` and redirects signed-in non-admins to `/`. For conditional UI (nav entries, an inline "Edit" button) use `isAdminSession()`, which returns `false` instead of redirecting when signed out or when the API is unreachable.

### Supabase callback hash errors
Supabase can redirect to the app root with errors in the URL hash (e.g. `/#error=access_denied&error_description=...`). Hash fragments are client-side only — the proxy cannot see them. The callback page (`app/auth/callback/page.tsx`) handles error hashes when Supabase redirects there, but errors landing on `/` are currently unhandled. **TODO:** add a client component on the root page to detect and surface these errors.

## Legal pages

Shared primitives (`SubHeading`, `Text`, lists, external links): `src/views/legal-document.tsx`.

- **Privacy Policy** — `src/views/privacy-view.tsx`, route `/privacy`, metadata in `src/app/privacy/page.tsx`.
- **Terms of Service** — `src/views/terms-view.tsx`, route `/terms`, metadata in `src/app/terms/page.tsx`.

Both use the same readable layout (centered column ~800px, clear section headings). Use explicit `{" "}` between closing `</strong>`/`</InlineLink>` and following words where needed so production builds do not collapse spaces.

**Update `privacy-view.tsx` when:**
- A new analytics tool, tracking pixel, error-monitoring service, or consent vendor is added or removed
- New data is stored in `localStorage`, cookies, or the server DB (web or API)
- The Reddit bot begins storing new KV keys or logging new user fields
- A new third-party service (hosting, CDN, auth) is introduced, or an existing one is removed
- Server log retention policies change
- PostHog configuration changes (sampling, session recording, etc.)

**Update `terms-view.tsx` when:** acceptable use rules, age requirement, Riot/Riftbound attribution, liability or dispute language, or contact / jurisdiction wording changes.

**Always update the "Last updated" date** in the view you edit.
