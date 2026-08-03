# packages/web

Next.js App Router site deployed to Cloudflare Workers through OpenNext.

<!-- BEGIN:nextjs-agent-rules -->
## Next.js version

This version has breaking APIs, conventions and file structure that may differ from training data. Read the relevant guide in `node_modules/next/dist/docs/` before changing Next.js code, and heed its deprecation notices.
<!-- END:nextjs-agent-rules -->

## Commands

```bash
bun dev             # Node development server
bun run typecheck
bun run preview     # build and run in workerd; required before deploy
bun run deploy
bun run cf-typegen
```

`bun dev` does not exercise the Workers runtime. Run `bun run preview` before deploying, especially after dependency, binding or server-runtime changes.

## Boundaries

- All Riftseer data and auth operations go through the Elysia API. Never import Supabase in page, view or feature code. The only direct database connection is c15t's consent backend.
- `app/` owns routing and layouts; `views/` compose pages; `features/` own domain behavior and API access; `components/` are reusable UI. Keep business logic out of route files and generic components.
- Server components are the default. Use client components only for state, interactivity or browser APIs. Client-side server state goes through TanStack Query.
- API calls live in feature API modules. The Eden client in `src/lib/api/client.ts` provides the public contract; admin types in `src/features/admin/types.ts` derive from that contract rather than mirroring it by hand.
- Environment parsing belongs in `src/lib/env.ts`. Public variables need the `NEXT_PUBLIC_` prefix; secrets do not.

## Cards

- UI code always carries an oracle and the physical printing being viewed. Read rules, stats, type, tags and relationships from the oracle; read rarity, art, artist, set, collector, flavour and marketplace data from the printing.
- `src/features/cards/api.ts` returns oracle-shaped search results by default and explicitly requests printing-shaped results for set/printing views. It applies a timeout and disables fetch caching so failures reach the error boundary rather than hanging a render.
- `/card/<printing-id>` is a permanent compatibility route. It resolves the printing and redirects to its pinned public slug. Canonical printing paths and single-segment oracle paths share the card-detail view.
- Use `cardHref()` or `oracleHref()` from `src/features/cards/paths.ts` for same-origin paths and API-provided `riftseer_uri` for absolute links. Do not assemble card URLs in components.
- Card detail is loaded through `cardsApi.getDetail()` using exactly one oracle id, printing id or slug. React request caching lets metadata and the page share the lookup.
- Search syntax is also the ruling-rule language. When search fields change, update `src/views/search-syntax-view.tsx` and the API search documentation.

## Admin

- `requireAdmin()` protects the route subtree for UX, but the API's bearer-token and `ADMIN_USER_IDS` checks are the security boundary. Admin status is fetched from `/auth/me`, not trusted from a cookie, so revocation takes effect immediately.
- Oracle and printing editors are separate even when shown on one screen. Form patches contain only changed keys: omission preserves a value and explicit null clears it. Genuine printing-specific rules differences belong in the delta panel, not the oracle form.
- The delta panel reads the stored row before it writes. `PUT /deltas` replaces wholesale, so authoring against an empty draft silently drops every override the admin did not retype; Save stays disabled until the read lands.
- Admin bookkeeping — `locked_fields`, `deleted_at`, delta source — comes from `/admin/printings`, never from the card payload. `Oracle` and `Printing` are the public wire types and no public reader should receive it.
- Types in `features/admin/types.ts` are derived from the Elysia `App` type, not restated. The ruling types were hand-written once and silently lost fields the API had started returning.
- Relationships replace an oracle's outgoing edge list. Incoming edges are context only, and there is no printing-scoped relationship control.
- Legality edits choose oracle or printing scope; default means clearing the stored row. Shared or query-targeted rulings are edited from the central rulings page because changing them in a printing panel could affect other cards.
- Review entries never auto-apply. Confirming a field uses the normal admin mutation path so it becomes locked against ingest. Missing-printing and unmatched-oracle entries flow through manual oracle-plus-printing creation before confirmation.
- Server actions are public endpoints. Any action performing its own side effect before calling the protected API must authenticate itself. The gallery image importer also restricts HTTPS hosts, revalidates redirect hops, limits bytes and time, and streams the response to prevent SSRF and unbounded buffering.

## Auth

- Session cookies are server-managed in `src/lib/session.ts`; client components receive session data from a server parent and never read tokens.
- `proxy.ts` refreshes near-expiry tokens. Page and layout authorization uses `requireAuth()` or `requireAdmin()`, not the proxy.
- Password recovery tokens arrive in the callback URL fragment and move through session storage because fragments never reach the server.

## Consent and legal copy

- Consent entry points are `src/components/consent-manager/`, `src/app/api/c15t/[...all]/route.ts` and `src/lib/c15t.ts`. For changes, use the repository c15t skill and the installed package's version-matched documentation.
- The c15t Postgres connection uses the Supabase transaction pooler with prepared statements disabled. `C15T_DATABASE_URL` is a secret.
- Canonical legal copy lives in `src/views/privacy-view.tsx` and `src/views/terms-view.tsx`, using `src/views/legal-document.tsx`. Update the page's “Last updated” date whenever copy changes.
- Review privacy copy when collection, cookies/local storage, logging, third parties, consent behavior or bot persistence changes. Review terms for age, acceptable use, attribution, liability, disputes, jurisdiction or contact changes. Material policy changes also require the matching API legal-version bump.

## Cloudflare and styling

- Do not add an Edge runtime declaration; OpenNext supplies the Worker runtime. Keep `nodejs_compat` and the generated shims required by the type-only API import.
- Production needs the same public values at build time and Worker runtime. `wrangler.jsonc` is authoritative for runtime bindings; build configuration supplies the build-time copy.
- Import `src/app/icons.css` directly from the root layout. Tailwind drops it when nested through the global stylesheet, making light-theme glyphs disappear.
- Do not hand-edit generated shadcn components unless the change intentionally belongs in the shared primitive.
