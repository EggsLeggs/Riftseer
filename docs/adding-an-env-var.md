# Adding an environment variable

Every Worker declares in its `wrangler.jsonc` what reaches the code. A key
that is missing from that declaration does not error in local runs: it is
silently absent under `wrangler dev`. This is the list of files a new
variable or secret has to touch, per Worker, so the value actually arrives.

Decide two things first.

- **Var or secret.** A var is a committed, non-confidential value and lives in
  `vars`. A secret is set remotely with `wrangler secret put <NAME>` from the
  package directory. Required secrets are listed under `secrets.required`.
- **`secrets.required` does two jobs.** Locally it filters `.dev.vars`/`.env`:
  only listed keys are loaded, so an unlisted key the code reads is silently
  absent under `wrangler dev`. On deploy it validates that every listed secret
  is configured on the Worker and fails if any are missing. Optional secrets
  stay out of the list — type them by hand (see `RIFTCODEX_API_KEY` and
  `INGEST_SECRET` on the ingest worker) and set them with
  `wrangler secret put`. The comment above `secrets` in
  `packages/api/wrangler.jsonc` records the local-filtering incident that
  taught us this.

`bun run check:wrangler` catches the four configs disagreeing with each other
(compatibility date, shared R2 and queue names, web's `env.production` block).
It does not know which keys the code reads; that is what this list is for.

## API (`packages/api`)

The API and `@riftseer/core` read `process.env.<NAME>`; the
`nodejs_compat` flag populates it from the bindings.

- [ ] `packages/api/wrangler.jsonc` — `vars` for a plain value, or the
      `secrets.required` allowlist for a required secret. Optional secrets
      stay out of the allowlist; type and set them separately.
- [ ] `packages/api/src/worker-configuration.d.ts` — regenerate; the command
      is in the file's first comment line. Run it from `packages/api`.
- [ ] `packages/api/.dev.vars.example` — document the key with a placeholder.
- [ ] `packages/api/.dev.vars.local` — a docker placeholder if the local stack
      needs a value. This file is committed and holds no credentials; a real
      value goes in the gitignored `.dev.vars.local.secrets`, which
      `bun run dev:api:local` loads after it.
- [ ] `.env.example` — the root file documents the API section too.
- [ ] Production: `wrangler secret put <NAME>` from `packages/api`. The deploy
      workflow in `.github/workflows/api.yml` needs no change; secrets live in
      Cloudflare, not in GitHub.

## Ingest worker (`packages/ingest-worker`)

The worker reads `env.<NAME>` through the `Env` type in
`packages/ingest-worker/src/env.ts`.

- [ ] `packages/ingest-worker/wrangler.jsonc` — `vars`, or `secrets.required`
      for a required secret. The header comment lists the secrets; keep it
      current.
- [ ] `packages/ingest-worker/src/env.ts` — an optional secret is typed here,
      because `wrangler types` only emits what the config declares.
- [ ] `packages/ingest-worker/src/worker-configuration.d.ts` — regenerate
      after any `wrangler.jsonc` change; the command is in the file's first
      comment line and in `packages/ingest-worker/AGENTS.md`.
- [ ] `packages/ingest-worker/.dev.vars.local` — committed docker placeholder
      if the local stack needs a value.
- [ ] `.env.example` — the ingest section at the root.
- [ ] Production: `wrangler secret put <NAME>` from `packages/ingest-worker`.

## Discord bot (`packages/discord-bot`)

The Worker reads `env.<NAME>` through the hand-written `Env` interface. The
registration and emoji scripts run under Bun and read `process.env`.

- [ ] `packages/discord-bot/wrangler.jsonc` — `vars` or `secrets.required`.
- [ ] `packages/discord-bot/src/env.ts` — add the field. Nothing generates
      this file.
- [ ] `.env.example` — the Discord section at the root. There is no
      `.dev.vars.example` in this package; local values go in the gitignored
      `packages/discord-bot/.dev.vars`.
- [ ] `.github/workflows/discord-bot.yml` — only if a Bun-side script needs
      the value in CI. The emoji upload job passes `DISCORD_BOT_TOKEN` and
      `DISCORD_APPLICATION_ID` from GitHub Actions secrets.
- [ ] Production: `wrangler secret put <NAME>` from `packages/discord-bot`.

## Web (`packages/web`)

Web reads `process.env.<NAME>` through the zod schema in
`packages/web/src/lib/env.ts`, which parses at import time. Production
deploys with `--env production`, and wrangler does not inherit bindings under
`--env`, so the `env.production` block is a hand-kept copy.

- [ ] `packages/web/src/lib/env.ts` — add the key to the schema. Public values
      need the `NEXT_PUBLIC_` prefix and are inlined at build time; secrets do
      not and are read at runtime.
- [ ] `packages/web/wrangler.jsonc` — a secret goes in **both** the top-level
      `secrets.required` and `env.production.secrets.required`. A plain var
      goes in `env.production.vars`.
- [ ] `packages/web/cloudflare-env.d.ts` — regenerate with `bun run cf-typegen`
      from `packages/web`.
- [ ] `scripts/check-web-public-env.mjs` — a new `NEXT_PUBLIC_*` value is added
      to `publicNames`. The production deploy runs this to prove the value
      the bundle was compiled with equals the value the Worker serves.
- [ ] `.github/workflows/web.yml` — a new `NEXT_PUBLIC_*` value is a GitHub
      Actions repository *variable* passed to both the build and deploy jobs.
- [ ] `packages/web/.env.local.example` and the web section of `.env.example` —
      `bun dev:web` loads the root `.env`.
- [ ] Local wrangler runs (`bun run preview:web`) read secrets from the
      gitignored `packages/web/.dev.vars`.
- [ ] Production: `wrangler secret put <NAME> --env production` from
      `packages/web`.

## Everywhere

- [ ] `docs/adding-an-env-var.md` — this file, when a Worker gains a new place
      a value has to be declared.
- [ ] `packages/web/src/views/privacy-view.tsx` — if the variable enables a
      new third party, new logging, or stores something about a person. See
      the "Legal and consent" section of the root `AGENTS.md`.
- [ ] `bun run check` — green before the PR.
