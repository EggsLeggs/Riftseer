# RiftSeer Bot

A Reddit bot that replies to comments and posts with **Riftbound TCG card data** when users write `[[Card Name]]`.

## Usage

Type a card name inside double brackets anywhere in a comment or post:

```
[[Sun Disc]]             → card image, links, and stats
[[Sun Disc|OGN]]         → specific set
[[Sun Disc|OGN-021]]     → specific printing by collector number
```

The bot replies with the card image, a link to the full card page, and API/text links. Up to 20 cards per comment are supported. Fuzzy matching handles typos and partial names.

## Card data

Card data is sourced from [RiftCodex](https://riftcodex.com) and kept continuously up to date. The bot resolves card names via the **RiftSeer API** — the same backend that powers the [RiftSeer](https://riftseer.thinkhuman.dev) card browser.

---

## Fetch Domains

The following external domains are required by this app (submitted for [Reddit's HTTP Fetch Policy](https://developers.reddit.com/docs/capabilities/server/http-fetch-policy) approval):

### `riftseerapi-production.up.railway.app`

This is the **only domain** the app fetches, and it is the app's own backend — not a third-party service.

**What it does:**
When a user writes `[[Card Name]]`, the bot POSTs the token to `/api/v1/resolve` on this host. The API performs:

- **Name resolution** against a live database of all Riftbound TCG cards, continuously updated from [RiftCodex](https://riftcodex.com) and [TCGPlayer](https://tcgplayer.com) via a scheduled ingest pipeline. Card data changes with every set release, balance patch, and errata — there is no static snapshot that stays correct.
- **Fuzzy search** to handle typos, partial names, and alternate spellings. The search index is maintained server-side and is not feasible to ship inside a Devvit bundle.
- **Cross-card relationship resolution** — tokens, champion cards, and legend cards are linked at ingest time and returned together in a single response. The bot cannot compute these relationships without access to the full card graph.
- **Image URLs and metadata** — the API returns direct image URLs, set codes, collector numbers, and page links used to build the Reddit reply.

**Why it cannot be replaced with a built-in or globally-allowed source:**
Riftbound TCG is not served by any globally-approved card API. The globally-approved `api.scryfall.com` covers Magic: The Gathering only. This app is the analogous community-built infrastructure for Riftbound — identical use case, different game. Without this single fetch, the bot has no card data at all and is entirely non-functional.

**Compliance:**
- Only the exact hostname above is used; no wildcards.
- The single endpoint called is `POST /api/v1/resolve`.
- No user data is forwarded — only the card name string extracted from the comment.
- The domain is the app developer's own production deployment (Railway).