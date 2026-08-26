# packages/discord-bot

Cloudflare Worker implementing Riftseer slash commands through the public API. It is a Bun workspace package.

## Commands

```bash
bun run dev
bun run type-check
bun run register       # after command-definition changes
bun run setup-emojis
bun run deploy
```

Discord secrets are set with Wrangler. Public API/site origins and the optional API service binding are defined in `wrangler.jsonc`.

The bot registers three slash commands, defined in `src/commands.ts`: `/card name [set] [image]`, `/random`, `/sets`.

## Invariants

- Verify the Ed25519 signature before dispatch. PINGs return immediately.
- Slash commands acknowledge with a deferred response, then patch the original from `waitUntil()`.
- Interaction tokens expire after fifteen minutes. Past that both the patch and its fallback POST fail, leaving the user on a permanent "thinking…".
- Card resolution goes through `POST /api/v1/cards/resolve`. A result carries an oracle plus the requested or preferred printing; read embed fields from the correct level.
- The Eden client is typed through a type-only import of the API app.
- The Worker uses the `RIFTSEER_API` service binding when present, with public fetch as fallback. Worker-to-Worker routing fails on development domains without it.
- Normalize the configured API value to an origin. Eden joins its own `/api/v1` to a base that already contains that prefix incorrectly.
- Use Web Crypto and Worker types, not Node crypto or DOM assumptions. Registration and emoji setup are Bun-side scripts and may use process environment variables.
- `@riftseer/core/icons` is safe here. Only the package root pulls in Node built-ins Workers cannot load.
- `src/emoji-cache.ts` caches the application-emoji map in module scope with no TTL. A fresh `setup-emojis` run reaches warm isolates only when Cloudflare recycles them.

The bot stores no user data. If persistence or additional logging is added, update the privacy policy and `docs/discord-bot.md`.
