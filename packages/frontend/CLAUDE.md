> **DEPRECATED** — this package is being replaced by `packages/web` and will be removed. Do not add features here; implement new work in `packages/web` instead. **Privacy Policy** and **Terms of Service** live in `packages/web` (`/privacy`, `/terms`). This package keeps stub routes only.

# packages/frontend — Context for Claude

## Purpose
React 19 SPA built with Vite 6. Provides card browsing, search, set listing, a syntax guide, and legal pages (Privacy Policy, Terms of Service).

## Running
```bash
bun dev:frontend    # Vite dev server (proxies /api to localhost:8789)
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
| `/docs/terms` | `TermsPage` | Redirect stub → canonical terms at `https://riftseer.com/terms` (`packages/web`) |
| `/docs/privacy` | `PrivacyPage` | Redirect stub → canonical policy at `https://riftseer.com/privacy` (`packages/web`) |

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
| `src/components/PrivacyPage.tsx` | Stub linking to canonical Privacy Policy on `packages/web` |
| `src/components/TermsPage.tsx` | Stub linking to canonical Terms of Service on `packages/web` |
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
Authoritative legal copy lives in **`packages/web`**: `src/views/privacy-view.tsx` (`/privacy`) and `src/views/terms-view.tsx` (`/terms`). Keep **`PrivacyPage.tsx`** and **`TermsPage.tsx`** here as stubs only (update `WEB_PRIVACY_URL` / `WEB_TERMS_URL` if production ever differs from `https://riftseer.com`).

**Update `packages/web/src/views/terms-view.tsx` if any of the following change:**
- Acceptable-use rules change (new prohibited behaviours)
- The age requirement changes
- Attribution or trademark language needs updating (Riot Games / Riftbound)
- Liability, warranty, or dispute resolution language changes
- Contact information or governing jurisdiction changes

**After updating `terms-view.tsx`, update the "Last updated" line** near the top of that view.

The footer (`Nav.tsx` or a dedicated `Footer` component) links to both pages — if the routes change, update the footer links too.

**Privacy (`packages/web`):** After updating `privacy-view.tsx`, update the "Last updated" line at the top of that view.

## Documentation
Doc pages for this package live in `packages/frontend/docs/`. Keep them up to date when making changes — if routes, key components, or the API client interface change, update the relevant doc page alongside the code.
