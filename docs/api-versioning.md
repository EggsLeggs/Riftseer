# API versioning

`/api/v1` is the contract every client is built on: `apps/web`, `apps/discord-bot`, `apps/reddit-bot`, `apps/raycast-extension`, the Tabletop Simulator mod in `apps/tts`, and third parties we do not know about. The mod is the hardest consumer to update, because a change ships through Steam Workshop and reaches players on their own schedule, so treat it as the floor: if a change would break the mod, it breaks someone.

## What may change

- Additive changes ship without notice: a new route, a new optional query parameter, a new field on a response. Clients must ignore fields they do not know.
- A field's type, a field's meaning, a route's path, a status code for a case that already exists, and the removal of anything: these are breaking. They need a deprecation note in `CHANGELOG.md` before they happen, then at least one release cycle in which the old behaviour still works, then a second changelog line when they land. A release cycle here is a deploy to production; give it a week where the fix is not urgent.
- A rewrite that cannot honour that becomes `/api/v2`, mounted beside `/api/v1`, and `v1` keeps answering until every first-party client has moved and the changelog has said so.
- Default-legal legality, the resolve contract (`POST /cards/resolve` returns an oracle plus the requested or preferred printing) and stable printing ids are part of the promise, not implementation detail.

## How a change is reviewed

The committed `apps/api/openapi.json` is generated from the mounted routes by `bun run generate:spec` in `apps/api`, and `spec:check` in the workspace gate fails when it is stale. That makes the spec diff in a PR the complete list of what changed on the wire: a reviewer reads it the way they would read a schema migration. No spec diff, no contract change; a spec diff with a removed path or property is a breaking change and needs the changelog entry above.

`apps/api/src/__tests__/tts-contract.test.ts` asserts the exact fields the mod reads. It is the test that fails when a change would break a client that cannot be redeployed with the API.

## What is not promised

- `GET /docs` and the shape of the spec document itself.
- Field order, whitespace and the pretty-printing of JSON.
- Rate limits, which are a floor against abuse and may tighten without notice.
- Anything under `/api/v1/admin`, which is behind `ADMIN_USER_IDS` and changes with the admin UI.
