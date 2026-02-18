# packages/frontend — Context for Claude

## Purpose
React 19 SPA built with Vite 6. Provides card browsing, search, set listing, a syntax guide, and legal pages (Privacy Policy, Terms of Service).

## Running
```bash
bun dev:frontend    # Vite dev server (proxies /api to localhost:3000)
bun build:frontend  # Production build to dist/
```

## Stack
- **React 19** + **React Router 7**
- **Tailwind CSS 4.2**
- **Vite 6.3**
- **@elysiajs/eden** — type-safe API client (Eden Treaty)
- **Lucide React** — icons
- **Shadcn-style** UI primitives in `src/components/ui/`

## Routes
| Path | Component | Description |
|------|-----------|-------------|
| `/` | `Home` | Landing page |
| `/search` | `SearchPage` | Fuzzy card search |
| `/card/:id` | `CardPage` | Single card detail |
| `/sets` | `SetsPage` | Browse sets |
| `/syntax` | `SyntaxPage` | Parser syntax + API docs |
| `/docs/terms` | `TermsPage` | Terms of Service |
| `/docs/privacy` | `PrivacyPage` | Privacy Policy |

Router is defined in `src/App.tsx`. Theme wraps the entire tree via `src/hooks/useTheme.tsx`.

## Key Files
| File | Purpose |
|------|---------|
| `src/App.tsx` | Router + ThemeProvider root |
| `src/api.ts` | Eden client + typed API helpers |
| `src/hooks/useTheme.tsx` | Dark/light theme context; persists to `localStorage` |
| `src/components/Nav.tsx` | Global nav with inline search box |
| `src/components/CardPage.tsx` | Card detail: image, stats, text, printings, tokens |
| `src/components/CardTextRenderer.tsx` | Renders card text with inline SVG icon tokens |
| `src/components/PrivacyPage.tsx` | **Privacy Policy** — see legal note below |
| `src/components/TermsPage.tsx` | **Terms of Service** — see legal note below |
| `src/components/ui/` | Shadcn-style primitives (badge, button, card, input, table) |

## API Client (Eden)
The Eden client in `src/api.ts` is typed against the Elysia app's inferred types. Use the helpers exported from `api.ts` rather than calling `fetch` directly.

```typescript
import { searchCards, getCardById, getSets } from './api'
```

If a new API route is added, add a corresponding typed helper in `src/api.ts`.

## Theme
- `useTheme()` hook provides `{ theme, setTheme }`
- Theme preference stored as `"dark"` / `"light"` in `localStorage` key `"theme"`
- The `<html>` element gets a `dark` class; Tailwind uses `darkMode: 'class'`

## Component Conventions
- Functional components with TypeScript; no class components
- Co-locate component-specific logic inside the component file unless reused
- Use Tailwind utility classes; avoid inline styles
- Shadcn-style UI components are in `src/components/ui/` — do not add external UI libraries

## Legal Pages — CRITICAL
`PrivacyPage.tsx` and `TermsPage.tsx` are **user-facing legal documents**. They must be kept accurate.

**Update `PrivacyPage.tsx` if any of the following change:**
- A new analytics tool, tracking pixel, or error-monitoring service is added
- New data is stored in `localStorage`, cookies, or the server DB
- The Reddit bot begins storing new KV keys or logging new user fields
- A new third-party service (hosting, CDN, auth) is introduced or an existing one is removed
- Server log retention policies change
- PostHog configuration changes (sampling, session recording, etc.)

**Update `TermsPage.tsx` if any of the following change:**
- Acceptable-use rules change (new prohibited behaviours)
- The age requirement changes
- Attribution or trademark language needs updating (Riot Games / Riftbound)
- Liability, warranty, or dispute resolution language changes
- Contact information or governing jurisdiction changes

**After updating either page, also update the "Last Updated" date at the top of the component.**

The footer (`Nav.tsx` or a dedicated `Footer` component) links to both pages — if the routes change, update the footer links too.
