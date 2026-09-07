# apps/raycast-extension

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
- Every request goes through `createRiftseerClient()` from `src/client.ts`, and every result is a value: read `result.ok` before `result.data`, never expect a throw. `useCachedPromise` and `usePromise` carry those results as `data`.
- Rules text, type lines, domain keys and site URLs come from the render kernel in `@riftseer/types`. `src/assets.ts` owns only the asset path per kernel key; the old per-file copies of `normalizeCardTextLayout` and `formatTypeLine` drifted from the site and are gone.
- `normalizeCardTextLayout(text, "\n\n")` is deliberate: Raycast renders Markdown, which folds a single newline.
- `tsconfig.json` uses `moduleResolution: node`, which ignores `exports` maps, so import from the `@riftseer/types` root rather than a subpath such as `@riftseer/types/client`.
- `@riftseer/types` resolves through `file:../../packages/types` straight to TypeScript source, with no build step. Edits there are picked up immediately.
- API and site origins plus the recent-history limit are Raycast preferences. A limit of zero disables history.
- Lowering the history limit truncates already-stored entries on next load. It is a destructive preference.
- Recent card payloads and the selected view live only in Raycast local storage. They are not sent back to Riftseer.
- Keep React and Node types pinned to the peer range the installed Raycast API expects — currently `@types/react` 19.0.10 and `@types/node` 22.13.10, both exact.
- A mismatch produces widespread JSX errors unrelated to the edited feature.

Update `docs/raycast-extension.md` (the user-facing reference) and `CHANGELOG.md` for user-visible changes. If local persistence, analytics or network behaviour changes, review the web privacy policy before publishing.
