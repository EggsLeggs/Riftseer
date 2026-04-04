# packages/raycast-extension — Context for Claude

## Purpose
Raycast extension for searching Riftbound TCG cards via the RiftSeer API. Provides two commands:
- **search-cards** — list view with a search bar; pushes to a detail view.
- **random-card** — fetches and renders a random card on open.

## Important: Standalone npm Project
This is **NOT** part of the root Bun workspace. It is a standalone npm project managed with npm and Raycast's `ray` CLI.

```bash
cd packages/raycast-extension
npm install          # Install deps
npm run dev          # ray develop — live-reload in Raycast
npm run build        # ray build
npm run lint         # ray lint
npm run publish      # npx @raycast/api@latest publish
```

## Key Files
| File | Purpose |
|------|---------|
| `src/search-cards.tsx` | `search-cards` command — List view with throttled search |
| `src/random-card.tsx`  | `random-card` command — fetches random card on load |
| `src/components/CardDetail.tsx` | Shared Detail view with Metadata panel |
| `src/types.ts` | Local copy of Card types from `packages/core/src/types.ts` |

## API Endpoints Used
| Endpoint | Usage |
|----------|-------|
| `GET /api/v1/cards?name=...&fuzzy=true&limit=20` | search-cards command |
| `GET /api/v1/cards/random` | random-card command |

## User Preferences (declared in package.json `preferences`)
| Key | Default | Description |
|-----|---------|-------------|
| `apiBaseUrl` | `https://riftseerapi-production.up.railway.app` | RiftSeer API base URL |
| `siteBaseUrl` | `https://riftseer.com` | RiftSeer site base URL for card links |

## Type Versioning
`src/types.ts` is a local copy of the canonical types in `packages/core/src/types.ts`. If the Card shape changes upstream, update both files.

## React / TypeScript Version Pinning
`@raycast/api@^1.90` requires `react@19` peer deps. Pin:
- `"@types/react": "19.0.10"`
- `"@types/node": "22.13.10"`

Do not upgrade `@types/react` without checking `@raycast/api`'s peer deps first — version mismatches cause widespread JSX type errors.

## Privacy
This extension makes read-only HTTP requests to the RiftSeer API. It does not store, log, or transmit any user data. No analytics or tracking. If this ever changes, update `packages/frontend/src/components/PrivacyPage.tsx`.
