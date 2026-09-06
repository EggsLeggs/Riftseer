# @riftseer/web

Next.js App Router frontend for Riftseer — deployed to **Cloudflare Workers** using [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) and [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

This package is **not** deployed on Vercel. Use the scripts below for local dev, preview (workerd), and production deploy.

## Prerequisites

- [Bun](https://bun.sh/) (workspace package manager)
- Cloudflare account (for `deploy` / Workers Builds)

## Setup

From the monorepo root (after `bun install`):

```bash
cd packages/web
cp .env.local.example .env.local
# Edit .env.local — see packages/web/CLAUDE.md for variable meanings
```

## Scripts

| Script | Purpose |
|--------|---------|
| `bun dev` | Next.js dev server (Node.js) |
| `bun run preview` | OpenNext build + local workerd preview — **use before shipping** |
| `bun run deploy` | OpenNext build + deploy via Wrangler |
| `bun run upload` | Build + upload artifacts (CI-friendly) |
| `bun run cf-typegen` | Regenerate `cloudflare-env.d.ts` from `wrangler.jsonc` |
| `bun run typecheck` | `tsc --noEmit` |

Configure the Worker in `wrangler.jsonc`. Public env vars for the Next.js build must also be set in [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) (or your CI) — `.env.local` alone does not affect remote builds.

## Security / dependency baseline

The app pins **Next.js 16.2.6**, which includes fixes for [CVE-2026-29057](https://github.com/advisories/GHSA-ggv3-7p47-pfv8) (HTTP request smuggling in rewrites). Stay on patched minors per the [Next.js security advisories](https://github.com/vercel/next.js/security/advisories).

## Docs

Package conventions, auth flow, and Cloudflare constraints: **`CLAUDE.md`** in this directory.
