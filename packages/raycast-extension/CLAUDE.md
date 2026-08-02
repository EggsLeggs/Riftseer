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

- Search uses `GET /api/v1/cards`; random uses `GET /api/v1/cards/random`. Responses are oracle-shaped and carry a preferred printing. Render rules fields from the oracle and physical-card fields from the printing.
- Canonical shared types come directly from `@riftseer/types`; `src/types.ts` contains only extension response wrappers.
- API and site origins plus the recent-history limit are Raycast preferences. A limit of zero disables history.
- Recent card payloads and the selected view live only in Raycast local storage. They are not sent back to Riftseer.
- Keep the React and Node type versions pinned to the peer range expected by the installed Raycast API; mismatches produce widespread JSX errors unrelated to the edited feature.

Update `docs/raycast-extension.md` and `CHANGELOG.md` for user-visible changes. If local persistence, analytics or network behavior changes, review the web privacy policy before publishing.
