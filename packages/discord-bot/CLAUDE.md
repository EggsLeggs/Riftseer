# packages/discord-bot — Context for Claude

## Purpose
Discord bot running on Cloudflare Workers. Responds to slash commands by looking up Riftbound cards via the RiftSeer API and replying with rich Discord embeds.

## Key Files
| File | Purpose |
|------|---------|
| `src/index.ts` | CF Worker entry — verifies signature, dispatches commands |
| `src/verify.ts` | Ed25519 signature verification using Web Crypto API |
| `src/api.ts` | Eden Treaty client typed against `@riftseer/api` |
| `src/embeds.ts` | Discord embed builders for cards and sets |
| `src/commands.ts` | Slash command definitions (for registration) |
| `src/register.ts` | CLI: register commands with Discord API |
| `src/response.ts` | `patchResponse()` — patches deferred interaction responses |
| `src/handlers/card.ts` | `/card` handler |
| `src/handlers/random.ts` | `/random` handler |
| `src/handlers/sets.ts` | `/sets` handler |
| `wrangler.toml` | Cloudflare Workers config + public vars |

## Workspace Membership
`packages/discord-bot` **is** part of the root Bun workspace. Use Bun for dependency management, Wrangler for dev/deploy.

```bash
bun install                       # from repo root (installs all workspace deps)
cd packages/discord-bot
bun run dev                       # wrangler dev (local tunnel)
bun run deploy                    # wrangler deploy (production)
bun run register                  # register slash commands with Discord
bun run type-check                # tsc --noEmit
```

## Slash Commands
| Command | Options | Description |
|---------|---------|-------------|
| `/card` | `name` (required), `set`, `image` | Look up a card; `image:true` for image-only |
| `/random` | — | Random card |
| `/sets` | — | List all sets |

## Interaction Flow (CF Workers)
1. Discord POSTs to the worker URL
2. Worker verifies Ed25519 signature
3. Worker responds `{ type: 5 }` (DEFERRED) immediately — Discord has a 3 s deadline
4. Inside `ctx.waitUntil()`, the handler calls the RiftSeer API
5. Handler PATCHes `webhooks/{appId}/{token}/messages/@original` with the final response

Never make the API call synchronously before responding — Discord will time out.

## Secrets
Set once with `wrangler secret put`:
| Secret | Description |
|--------|-------------|
| `DISCORD_PUBLIC_KEY` | From Discord Developer Portal → app → General Information |
| `DISCORD_BOT_TOKEN` | Bot token from Discord Developer Portal → Bot |
| `DISCORD_APPLICATION_ID` | App ID from Discord Developer Portal → General Information |

Public vars (`API_BASE_URL`, `SITE_BASE_URL`) are in `wrangler.toml`.

## Eden Client
`src/api.ts` uses Eden Treaty typed against `App` from `@riftseer/api`. The `import type { App }` is erased at bundle time — wrangler never includes any server-side code. `elysia` is also a devDep (type-only). Only `@elysiajs/eden` ships in the bundle.

```typescript
// Follow the same pattern as packages/frontend/src/api.ts
const client = createClient(env.API_BASE_URL);
const { data, error } = await client.api.cards.random.get();
```

## Registering Commands
Run `bun run register` from `packages/discord-bot` (needs `DISCORD_BOT_TOKEN` and `DISCORD_APPLICATION_ID` in env). Re-run whenever `src/commands.ts` changes.

## TypeScript / Bundling
- Target: `@cloudflare/workers-types` — NOT `lib: ["DOM"]`
- `moduleResolution: "bundler"` — lets wrangler (esbuild) resolve `.ts` extensions
- Type-only imports from `@riftseer/api` and `elysia` are stripped at bundle time

## Privacy
The Discord bot does not store any data. It forwards the card name to the RiftSeer API and returns the result. If logging or persistence is added, update `packages/frontend/src/components/PrivacyPage.tsx`.
