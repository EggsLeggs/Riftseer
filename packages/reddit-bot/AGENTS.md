# packages/reddit-bot

Standalone Devvit app that replies to `[[Card Name]]` tokens in new comments and self-posts. It is outside the root Bun workspace.

## Commands

```bash
npm install
npm run dev
npm run type-check
npx devvit settings set apiBaseUrl
npx devvit settings set siteBaseUrl
npm run deploy
```

## Invariants

- Import token parsing from `@riftseer/types`; do not maintain a Reddit-specific parser.
- Resolve batches through `POST /api/v1/cards/resolve`. Each result is an oracle plus a selected printing, and the printing id remains the compatibility fallback for public links.
- The API origin lives in **two** places: `devvit.json` HTTP permissions and `Devvit.configure()` in `src/main.ts`. An origin change needs both, plus a redeploy.
- `apiBaseUrl` and `siteBaseUrl` are Devvit app settings, not secrets. An unset `apiBaseUrl` logs and returns — no reply, and nothing surfaces to the subreddit.
- Skip spam, deleted content, bot authors and ids already recorded in KV.
- Comment authors are usernames; post usernames come from the event author, not `authorId`.
- Bot detection is a case-insensitive `endsWith("bot")` on the username. It misses bots named otherwise and skips humans whose name ends in "bot".
- Dedupe keys are written **before** the token check, so an edit that later adds `[[…]]` is never re-scanned.
- Devvit KV uses `put`, `get` and `delete`. Only `put` and `get` are used here.
- Reply ids need the `t1_` prefix for comments and `t3_` for posts.
- Keep the empty TypeScript `types` override: it prevents Devvit's base configuration from introducing conflicting Vitest globals.

The bot persists only replied comment/post ids for deduplication. Its API requests may be logged by Riftseer. If stored fields, logs, retention or request payloads change, update the privacy policy and `docs/reddit-bot.md`.
