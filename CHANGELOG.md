# Changelog

Notable changes to Riftseer. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). There are no release tags; a deploy from `main` is a release, and the API's compatibility promise is `docs/api-versioning.md`. Breaking changes to `/api/v1` are announced here before they land.

## Unreleased

### Added

- Persisted, account-owned decks with a format rules engine and a deck builder (#115).
- A dispatchable workflow that applies Supabase migrations to production (#121).
- A single-source OpenAPI spec served with a Scalar docs page at `/docs`; spec drift fails CI (#132).
- A wrangler consistency check and an env-var checklist across the four Workers (#133).
- A VS Code workspace with one launch for the database, the API and the web app (#162).
- The Tabletop Simulator mod, with its history, as `apps/tts` (#166).
- Contributing guide, security policy, code of conduct, issue and PR templates, code owners, the API versioning promise and this changelog.
- A button beside each Experience Counter in the TTS mod spawns a pile of the three Riftbound tokens; every click spawns another, so a drawn-down pile is refilled by clicking again.

### Changed

- The Next.js stack is the trunk; the Vite frontend is tagged `legacy-vite-final` (#117).
- One CI gate, `bun run check`, covers every workspace package (#118).
- One TypeScript version and one workers-types across the workspace; tsconfigs extend a shared base (#131).
- One render kernel in `packages/types` shared by web, core and the Discord bot (#134).
- Renovate opens dependency PRs weekly, with vulnerability fixes outside the schedule (#157).
- oxlint and oxfmt replace the absence of a linter and formatter (#159).
- `apps/`, `packages/` and `tooling/` layout; package names are unchanged (#160).
- Agent guidance is `AGENTS.md`, `CONTEXT.md` and `docs/`, checked for dangling references (#163).
- The Reddit bot and Raycast extension read the API through the typed client in `@riftseer/types` (#167).
- Admin and deck routes sit behind a repository layer; Supabase is imported only from `apps/api/src/repos/` (#168).
- Deck logic moved from the web app into `packages/types`, the deck editor became a reducer, and the server seam is enforced by a boundary rule (#170).
- The React Compiler lint rules are on; a site that must read storage or the URL after hydration carries an inline suppression with its reason (#171).
- The source licence is the Functional Source License 1.1 with Apache-2.0 as its future licence, replacing all rights reserved. The affiliate-link rule moved from the licence into the API's terms of service.
- The VS Code workspace carries `apps/tts` as a folder root, with the extract and inject round trip as tasks.

### Removed

- The dead Vite frontend, the root wrangler config and the emoji pipeline's old target (#119).
- The Docusaurus docs site (#163).
- `c15t-backend.config.ts`, which nothing imported and no command ran. The consent backend is configured in `apps/web/src/lib/c15t.ts`.

### Fixed

- The legacy-to-baseline schema transition is recorded as migrations (#122).
- The projection rebuild survives `pg-safeupdate` (#123).
- Reverted a lockfile maintenance PR that moved the docs site's dependency tree (#158).

### Security

- Local dev servers no longer inherit production secrets from the root `.env` (#161).
- Every mounted API route is either listed as public or carries an auth guard, enforced by a test; CORS answers `*` only on public routes; per-IP rate limits on auth and mutation routes (#164).
