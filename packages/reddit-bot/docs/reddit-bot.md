---
title: Reddit Bot
sidebar_label: Reddit Bot
sidebar_position: 3
---

:::warning Not operational in production

The bot is implemented and deployable as a **Devvit** app, but **Reddit has not yet approved outbound HTTP fetch** to the Riftseer API domain under their [HTTP fetch policy](https://developers.reddit.com/docs/capabilities/server/http-fetch-policy). Until that approval lands, the app **cannot load card data** and will not function end-to-end for users.

:::

Source: `packages/reddit-bot/` (standalone **npm** project — not part of the root Bun workspace).

---

## Intended usage

Users type card names in **double brackets** in comments or self-post bodies:

```markdown
[[Sun Disc]]
[[Sun Disc|OGN]]
[[Sun Disc|OGN-021]]
```

The bot parses tokens (same bracket grammar as the core parser), calls **`POST /api/v1/cards/resolve`** on the configured API base URL, and replies with Markdown (image, links, summary). Up to **20** cards per message are supported; the API applies fuzzy matching when needed.

---

## Deploy & settings

**First time** (from `packages/reddit-bot/`):

```bash
cd packages/reddit-bot
npm install
npx devvit upload
npx devvit settings set apiBaseUrl    # e.g. production API host
npx devvit settings set siteBaseUrl   # card page links
```

**Redeploy after code or manifest changes** — run upload again from the same directory; Devvit publishes a new app version to Reddit:

```bash
cd packages/reddit-bot
npx devvit upload
```

Run `npm install` first if dependencies or the lockfile changed. If you edit `devvit.yaml` (permissions, HTTP domains, version metadata), you must redeploy for those changes to apply. Per-install **settings** (`apiBaseUrl`, `siteBaseUrl`) persist across uploads unless you change them with `npx devvit settings set …` again.

---

## Why the API must be reachable

Riftbound card data is maintained by the ingest pipeline and exposed only through the API (search, resolve, relationships, image URLs). There is no globally pre-approved third-party host for Riftbound analogous to Scryfall for Magic. The Reddit app’s `devvit.yaml` must list the exact API hostname under HTTP permissions; **policy approval** is the current blocker, not missing code.

---

## Behaviour notes

- Triggers: **CommentCreate** and **PostCreate** (self-post text + title).
- **KV** stores dedupe keys (`replied:…`) so the same comment or post is not answered twice across restarts.
- If new data is stored in KV or new fields are logged, update the site [Privacy Policy](https://riftseer.com/docs/privacy).
