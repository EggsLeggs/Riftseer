# packages/raycast-extension

Standalone npm/Raycast project for card search and random-card views. It is outside the root Bun workspace.

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
npm run lint:ray
npm run publish
```

The Raycast Store author in `package.json` must be a real Raycast username before full lint or publish succeeds.

## Invariants

- Search uses `GET /api/v1/cards`; random uses `GET /api/v1/cards/random`. Responses are oracle-shaped and carry a preferred printing.
- Render rules fields from the oracle and physical-card fields from the printing.
- Search sends `fuzzy=true` and `limit=20` as fixed query parameters. Neither is a Raycast preference.
- Canonical shared types come directly from `@riftseer/types`; `src/types.ts` contains only extension response wrappers.
- `@riftseer/types` resolves through `file:../types` straight to TypeScript source, with no build step. Edits there are picked up immediately.
- API and site origins plus the recent-history limit are Raycast preferences. A limit of zero disables history.
- Lowering the history limit truncates already-stored entries on next load. It is a destructive preference.
- Recent card payloads and the selected view live only in Raycast local storage. They are not sent back to Riftseer.
- Keep React and Node types pinned to the peer range the installed Raycast API expects — currently `@types/react` 19.0.10 and `@types/node` 22.13.10, both exact.
- A mismatch produces widespread JSX errors unrelated to the edited feature.

Update `docs/raycast-extension.md` and `CHANGELOG.md` for user-visible changes. If local persistence, analytics or network behaviour changes, review the web privacy policy before publishing.
