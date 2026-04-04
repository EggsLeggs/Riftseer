---
title: Clients & Bots Overview
sidebar_label: Overview
sidebar_position: 1
---

This section covers **first-party clients and bots** that use the [Riftseer API](/api/). The React web app lives under [Frontend](/frontend/).

| Doc | Description |
| --- | --- |
| [Discord Bot](./discord-bot.md) | Slash commands on Cloudflare Workers — **live** |
| [Reddit Bot](./reddit-bot.md) | `[[Card Name]]` mentions via Devvit — **blocked on Reddit HTTP fetch approval** |
| [Raycast Extension](./raycast-extension.md) | Placeholder — content coming later |

All integrations resolve card data through the same public API (`POST /api/v1/cards/resolve` for batch name resolution, plus the search and random endpoints documented in the API section).

---

## Repository layout

| Project | Path | Tooling |
| --- | --- | --- |
| Discord bot | `packages/discord-bot/` | Bun, Wrangler |
| Reddit bot | `packages/reddit-bot/` | npm, Devvit (`npx devvit`) |

The Reddit bot is **not** a Bun workspace member; use `npm` there as described in its doc page.
