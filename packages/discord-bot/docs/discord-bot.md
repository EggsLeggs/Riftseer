---
title: Discord Bot
sidebar_label: Discord Bot
sidebar_position: 2
---

The Riftseer Discord bot runs on **Cloudflare Workers**. It answers slash commands by calling the Riftseer API and replying with rich embeds (card stats, links, and optional card art).

Source: `packages/discord-bot/`

---

## Slash commands

| Command | Options | Description |
| --- | --- | --- |
| `/card` | `name` (required), `set`, `image` | Look up a card; set `image:true` for image-focused replies |
| `/random` | — | Return a random card |
| `/sets` | — | List all sets |

---

## How interactions work

Discord requires an initial response within about **three seconds**. The worker never blocks on the API during that window:

1. Discord `POST`s the interaction to the worker URL.
2. The worker verifies the **Ed25519** signature (Discord public key).
3. It immediately responds with **type 5** (deferred response).
4. Inside `waitUntil`, the handler calls the Riftseer API via the typed **Eden** client (`@elysiajs/eden` against `@riftseer/api` types).
5. The handler **PATCH**es the interaction follow-up webhook with the final message.

If the API were awaited before the deferred response, Discord would time out.

---

## Local development & deploy

From the repo root (workspace install):

```bash
cd packages/discord-bot
bun run dev        # wrangler dev — local tunnel
bun run deploy     # production worker
bun run register   # register slash commands with Discord (re-run when commands change)
bun run type-check
```

---

## Configuration

### Secrets (`wrangler secret put`)

| Secret | Source |
| --- | --- |
| `DISCORD_PUBLIC_KEY` | Developer Portal → Application → General Information |
| `DISCORD_BOT_TOKEN` | Developer Portal → Bot |
| `DISCORD_APPLICATION_ID` | Developer Portal → General Information |

### Public vars

`API_BASE_URL` and `SITE_BASE_URL` are set in `wrangler.jsonc` (overridable at deploy with `--var`).

---

## Privacy

The bot does **not** persist user data. It forwards the requested card name (and optional set hint) to the public API and returns the result. If logging or storage is added later, update the site [Privacy Policy](https://riftseer.com/docs/privacy) accordingly.
