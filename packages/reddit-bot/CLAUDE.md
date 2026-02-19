# packages/reddit-bot — Context for Claude

## Purpose
Devvit Reddit app that listens for `[[Card Name]]` mentions in comments and posts, resolves them via the RiftSeer API, and replies with a formatted Markdown card summary.

## Important: Standalone Project
This is **NOT** part of the root Bun workspace. It is a separate npm project managed with `npx devvit` tooling.

```bash
cd packages/reddit-bot
npm install                          # Install deps (not bun install)
npx devvit upload                    # Deploy to Reddit
npx devvit settings set apiBaseUrl   # Set API base URL for the subreddit
npx devvit settings set siteBaseUrl  # Set site base URL for card links
npx devvit playtest <subreddit>      # Live testing against a real subreddit
```

## Key Files
| File | Purpose |
|------|---------|
| `src/main.ts` | Devvit entry point — registers triggers and settings |
| `src/handler.ts` | `buildReply()` — calls API, formats Markdown response |
| `src/parser.ts` | `parseCardRequests()` — mirrors `packages/core/src/parser.ts` |
| `devvit.yaml` | App manifest (name, permissions, HTTP domains) |

## Triggers
- **`CommentCreate`** — fires on new comments; checks `.body` for `[[...]]` tokens
- **`PostCreate`** — fires on new posts; checks `.title` + `.selftext` (self-posts only)

Both triggers skip: spam, deleted content, bot accounts (configurable list), already-replied IDs.

## Devvit API Gotchas
These differ from standard Node/Bun patterns — always use these forms:

```typescript
// KV store (NOT .set/.del)
await kvStore.put(key, value)
await kvStore.get(key)
await kvStore.delete(key)

// CommentV2 fields
comment.id              // string
comment.body            // string
comment.author          // string (username)
comment.spam            // boolean
comment.deleted         // boolean
comment.lastModifiedAt  // Date

// PostV2 fields
post.id                 // string
post.title              // string
post.selftext           // string
post.isSelf             // boolean
post.authorId           // string (ID, NOT username)
// For username on posts: use event.author?.name

// Submitting a reply
await reddit.submitComment({
  id: 't1_' + commentId,   // comment reply
  // or
  id: 't3_' + postId,      // post reply (top-level comment)
  text: markdownString,
})
```

## Settings (per-install, configured by mod)
| Key | Description |
|-----|-------------|
| `apiBaseUrl` | Base URL of the RiftSeer API (e.g., `https://riftseerapi-production.up.railway.app`) |
| `siteBaseUrl` | Base URL of the RiftSeer site for card links |

Settings are accessed via `context.settings.get('apiBaseUrl')`.

## HTTP Fetch
The bot calls `/api/resolve` on the external API. The fetch domain must be listed in `devvit.yaml` under `permissions.http`. If the API domain changes, update `devvit.yaml` **and** redeploy.

## Deduplication
Replied comment/post IDs are stored in the KV store to prevent duplicate replies across restarts and re-deploys. The KV key pattern is `replied:<type>:<id>`.

## TypeScript Config
`tsconfig.json` overrides `"types": []` to suppress a vitest/globals conflict that Devvit's base tsconfig introduces. Do not remove this override.

## Privacy Implications
If the bot begins storing new data in the KV store or logging additional fields (e.g., user IDs, subreddit names, card request text), update `PrivacyPage.tsx` in `packages/frontend` to reflect what is collected, why, and how long it is retained.

The current data stored:
- **KV store**: Replied comment/post IDs only (for deduplication)
- **API logs**: Card name + subreddit logged server-side for analytics (not stored by the bot itself)
