# packages/raycast-extension — Context for Claude

## Purpose
Raycast extension for searching Riftbound TCG cards via the Riftseer API. Provides two commands:
- **search-cards** — list view with a search bar; pushes to a detail view.
- **random-card** — fetches and renders a random card on open.

## Important: Standalone npm Project
This is **NOT** part of the root Bun workspace. It is a standalone npm project managed with npm and Raycast's `ray` CLI.

```bash
cd packages/raycast-extension
npm install          # Install deps
npm run dev          # ray develop — live-reload in Raycast
npm run build        # ray build
npm run lint         # eslint + prettier (no Store author HTTP check)
npm run lint:ray     # full `ray lint` — validates package.json; `author` must be a real raycast.com username
npm run publish      # npx @raycast/api@latest publish
```

Set `author` in `package.json` to your [Raycast Store](https://www.raycast.com/) username before `npm run publish` or `npm run lint:ray`; the API returns 404 until that account exists.

## Key Files

| File | Purpose |
|------|---------|
| `src/search-cards.tsx` | `search-cards` command — List view with throttled search |
| `src/random-card.tsx`  | `random-card` command — fetches random card on load |
| `src/components/CardDetail.tsx` | Shared Detail view with Metadata panel |
| `src/recentHistory.ts` | Recent-card history (Raycast `LocalStorage` via `useLocalStorage`) |
| `src/types.ts` | Extension-only types (`CardsSearchResponse`); card types come from `@riftseer/types` |

## API Endpoints Used

| Endpoint | Usage |
|----------|-------|
| `GET /api/v1/cards?name=...&fuzzy=true&limit=20` | search-cards command |
| `GET /api/v1/cards/random` | random-card command |

## User Preferences (declared in package.json `preferences`)

| Key | Default | Description |
|-----|---------|-------------|
| `apiBaseUrl` | `https://api.riftseer.com` | Riftseer API base URL |
| `siteBaseUrl` | `https://riftseer.com` | Riftseer site base URL for card links |
| `maxRecentHistory` | `50` | Max recently viewed cards kept in Raycast local storage (`0` = off). Shown when Search Cards has an empty query. |

## Type Versioning
Card types (`Card`, `RelatedCard`, etc.) are imported directly from `@riftseer/types` (linked via `file:../types`). `src/types.ts` contains only extension-specific types (`CardsSearchResponse`).

## React / TypeScript Version Pinning
`@raycast/api@^1.90` requires `react@19` peer deps. Pin:
- `"@types/react": "19.0.10"`
- `"@types/node": "22.13.10"`

Do not upgrade `@types/react` without checking `@raycast/api`'s peer deps first — version mismatches cause widespread JSX type errors.

## Privacy
This extension makes read-only HTTP requests to the Riftseer API. It stores a bounded list of recently viewed card payloads in Raycast local storage (for the Search Cards empty state and history cap); that data stays on the device and is not sent to Riftseer. No analytics or tracking. If this ever changes, update `packages/frontend/src/components/PrivacyPage.tsx`.

## Documentation
Doc pages for this extension live in `packages/raycast-extension/docs/raycast-extension.md`. The dev docs site copies this file into `docs/doc-pages/clients-bots/` when you run `bun run build` or `bun run start` in `docs/` (see `sync-clients-bots-docs`). Keep the doc up to date when commands, preferences, or the API call change.

## Changelog & Release Notes
Maintain `CHANGELOG.md` in the root of this package. Update it for every user-facing change:
- New commands or features → **Added**
- UI/UX improvements → **Changed**
- Bug fixes → **Fixed**
- Removed features → **Removed**
- Security fixes → **Security**

Format entries clearly for end users (not implementation details). Publish via `npm run publish` when ready.
