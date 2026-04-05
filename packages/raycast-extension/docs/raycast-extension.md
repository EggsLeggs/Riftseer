---
title: Raycast Extension
sidebar_label: Raycast Extension
sidebar_position: 4
---

The Riftseer Raycast extension lets you search Riftbound TCG cards and fetch a random card without leaving your keyboard.

Source: `packages/raycast-extension/` (standalone **npm** project — not part of the root Bun workspace).

---

## Commands

| Command | Description |
| --- | --- |
| **Search Cards** | Search cards by name with live results; toggle between list and grid views |
| **Random Card** | Fetch a random card from the API and display its full detail view |

---

## Search Cards

Type a card name in the search bar. Results are fetched from `GET /api/v1/cards?name=…&fuzzy=true&limit=20` as you type (throttled).

### Views

A dropdown in the search bar lets you switch between four layouts:

| Value | Layout |
| --- | --- |
| `list` | List with inline card detail sidebar |
| `3` | Grid — 3 columns |
| `5` | Grid — 5 columns |
| `6` | Grid — 6 columns |

The selected view is persisted across sessions via `useLocalStorage`.

When the search field is empty, the extension can show **Recent** cards: a list of cards you opened in the full detail view, browsed long enough in list/grid selection (debounced), or loaded via **Random Card**. The maximum count is configurable (see preferences); set it to `0` to disable history and hide that section.

### Landscape cards

Cards with `media.orientation === "landscape"` are rotated 90° clockwise using [Jimp](https://github.com/jimp-dev/jimp) before display. Rotated data-URLs are cached in memory for the session to avoid re-processing on re-render.

---

## Card detail

The shared `CardDetail` component (used by both commands) renders:

- Card image (portrait: 200×300; landscape: 300×200)
- Rules text and flavour text
- Metadata panel: type line, stats (energy/power/might), domains, tags, rarity, set, collector number, artist
- Actions: open on RiftSeer, copy card name, copy rules text, copy card image to clipboard

---

## Development & deploy

This is a standalone npm project. Do not use `bun install` here.

```bash
cd packages/raycast-extension
npm install          # install dependencies
npm run dev          # ray develop — live-reload in Raycast
npm run build        # ray build — production build
npm run lint         # ray lint
npm run publish      # publish to Raycast store
```

---

## Configuration

Set these in Raycast preferences for the extension:

| Preference | Default | Description |
| --- | --- | --- |
| `apiBaseUrl` | `https://riftseerapi-production.up.railway.app` | RiftSeer API base URL |
| `siteBaseUrl` | `https://riftseer.thinkhuman.dev` | RiftSeer site URL (used for card page links) |
| `maxRecentHistory` | `50` | Recent cards to keep locally; `0` disables recording and the empty-query Recent section |

---

## Types

`src/types.ts` is a local copy of the canonical card types from `packages/core/src/types.ts`. Since this package is a standalone npm project it cannot import from `@riftseer/core` directly. When the `Card` shape changes in core, update `src/types.ts` to match.

---

## Privacy

The extension makes read-only HTTP requests to the configured API. It may store recently viewed card data in Raycast local storage (bounded by `maxRecentHistory`); that data remains on your device. No analytics or tracking. If this ever changes, update the site [Privacy Policy](https://riftseer.thinkhuman.dev/docs/privacy).
