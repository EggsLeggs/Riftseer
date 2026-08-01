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

## Invariants

- Verify the Ed25519 signature before dispatch. PINGs return immediately; slash commands must acknowledge with a deferred response before doing API work, then patch the original response from `waitUntil()`.
- Card resolution goes through `POST /api/v1/cards/resolve`. A result contains an oracle plus the requested or preferred printing; embeds must read fields from the correct level.
- The Eden client is typed through a type-only import of the API app. The Worker uses the `RIFTSEER_API` service binding when present to avoid Worker-to-Worker routing failures on development domains, with public fetch as fallback.
- Normalize the configured API value to an origin. Eden joins its own `/api/v1` path and a base that already contains that prefix incorrectly.
- Cloudflare Worker code uses Web Crypto and Worker types, not Node crypto or DOM assumptions. Registration and emoji setup are Bun-side scripts and may use process environment variables.

The bot stores no user data. If persistence or additional logging is added, update the privacy policy and `docs/discord-bot.md`.
