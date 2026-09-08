# Security

## Reporting a vulnerability

Report privately through GitHub: [open a draft security advisory](https://github.com/EggsLeggs/Riftseer/security/advisories/new). Private vulnerability reporting is enabled on this repository, so the report reaches the maintainer and nobody else. Do not open an issue, a discussion or a pull request for anything exploitable.

Say what you found, how to reproduce it and what it lets an attacker do. You will get a first reply within seven days. There is no bug bounty.

## What is supported

The `main` branch and the Workers deployed from it: the API at `api.riftseer.com`, the site at `riftseer.com`, the ingest worker and the Discord bot. There are no release tags. A fix ships by merging to `main` and deploying, so there is nothing to backport. `apps/reddit-bot` and `apps/raycast-extension` are published from `main` on their vendors' own cadence.

## How access is enforced

- The API Worker holds the Supabase service-role key and bypasses row-level security. The migration policies are defence in depth, not the boundary.
- The boundary is code. `roleFor()`, `canRead()` and `canWrite()` in `apps/api/src/authz/deck-access.ts` decide deck access, and `ADMIN_USER_IDS` decides who may call `/api/v1/admin`. A deck the caller may not read answers 404, never 403.
- `apps/api/src/public-routes.ts` lists the routes anyone may call. Every other mounted route carries an auth guard, and `apps/api/src/__tests__/route-security.test.ts` walks the mounted routes and fails the build when one does not. Adding a route to that list also gives it `Access-Control-Allow-Origin: *`, so it is a deliberate statement that the route is public.
- Web's `requireAuth()` and `requireAdmin()` are UX gates. A hole in them is a nuisance; a hole in the API's guards is a vulnerability.
- No client holds a database credential. Every surface resolves through the API.

## Rate limits

`apps/api/src/plugins/rate-limit.ts` limits auth endpoints to 10 requests a minute and other non-public writes to 120 a minute, per client IP, sliding window in Upstash Redis. It fails open when Redis is unconfigured or erroring, so it can never be the outage. It is a floor against abuse rather than a quota: there is no per-account limit and no WAF rule in code.

## Secrets on disk

`wrangler dev` writes the secrets it loads into the bundled worker at `.wrangler/tmp/dev-*/worker.js`. The directory is gitignored, but the file is plain text on a developer's disk and survives the process that made it. After rotating a credential, run `rm -rf .wrangler` from the repository root so no stale bundle keeps the old value. A Worker's local values live in its own `.dev.vars*` files; the committed `.dev.vars.local` holds docker placeholders only.

## What runs in CI

- `.github/workflows/security.yml` runs gitleaks on every push and pull request, scanning from the base branch tip.
- GitHub secret scanning and push protection are enabled on the repository.
- Renovate opens vulnerability fixes from the OSV database immediately, outside its weekly schedule (`docs/renovate.md`). OSV covers the npm dependencies only; the docker image tags in `docker-compose.yml` are nobody's job but ours.
