# RiftSeer Bot (Devvit)

Reddit app that replies to comments and posts with Riftbound TCG card data when users write `[[Card Name]]` (or `[[Card Name|SET]]` / `[[Card Name|SET-NUM]]`).

## Triggers

- **CommentCreate** — Detects `[[...]]` tokens in new comments, replies with card image and links.
- **PostCreate** — Same for new self-posts (title + selftext).

Deduplication is handled via Devvit KV store so the bot never double-replies, even across re-deploys.

## Card data

The bot does **not** run card resolution or data fetching inside Devvit. It delegates to the external **RiftSeer Elysia API** (`packages/api`). That keeps the Devvit bundle small and the API as the single source of truth for card data, fuzzy matching, and caching.

URLs are app-level settings (shared across subreddits). Set them once:

```bash
npx devvit settings set apiBaseUrl   # e.g. https://riftseerapi-production.up.railway.app
npx devvit settings set siteBaseUrl   # e.g. https://riftseer.thinkhuman.dev
```

## Run & deploy

```bash
cd packages/bot
npm install
npx devvit login        # one-time auth
npx devvit upload       # deploys to your Devvit app
npx devvit playtest r/yoursubreddit  # local live testing
```

---

## Fetch Domains

The following domains are requested for this app (for [Reddit’s HTTP Fetch Policy](https://developers.reddit.com/docs/capabilities/server/http-fetch-policy) approval):

- **`riftseerapi-production.up.railway.app`** — Host for the RiftSeer Elysia API. The bot uses `fetch` to POST card requests to `/api/resolve` on this host. The API returns resolved card data (name, image, links) so the bot can build the reply. This is the app’s own backend, not a third-party API. The use case is analogous to the globally allowed **`api.scryfall.com`** (card data API for Magic: The Gathering): same pattern of “look up card by name → return image and links,” but for the Riftbound TCG.

**Why this is required (justification for custom-domain allowlist):**  
Devvit’s server does not support this use case. The bot must call the **same RiftSeer API** that powers the public site and API: it relies on that service for card resolution, fuzzy search, SQLite cache, and RiftCodex-backed data. Reimplementing that logic or data pipeline inside the Devvit app would duplicate the codebase, break a single source of truth, and exceed what’s practical in the Devvit environment. The only supported approach is to allow the app to fetch its own deployed API host.

If you run the API on another host (e.g. a custom domain), request that host as an additional fetch domain and add it to `http.domains` in `src/main.ts`.

**Compliance:**  
Only these exact hostnames are used; no wildcards, protocols, or paths in domain requests. Fetch is used only to call the app’s own API for card resolution.
