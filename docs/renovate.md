# Dependency updates

Renovate opens the dependency PRs. It runs as the hosted Mend GitHub App, reads
`.github/renovate.json5`, and has no API of its own beyond GitHub: the
Dependency Dashboard issue, the PRs it opens, and the job log on the Mend
portal are the whole interface.

## Cadence

- Branches are created on Mondays between 00:00 and 03:59 UTC.
- Every non-major bump lands in one PR titled `fix(deps): update all non-major
dependencies`. Majors get a PR each, with two exceptions: GitHub Actions
  share one, and the `postgres` docker major is disabled outright because it
  has to follow the hosted Supabase Postgres major, which Renovate cannot see.
  Bump that one by hand in `docker-compose.yml` and `test.yml` together.
- Lockfile maintenance runs weekly. It regenerates `bun.lock` and the two
  standalone `package-lock.json` files even when no range moved.
- Lockfile maintenance is not covered by `ignorePaths`. `docs/` is a workspace
  member, so a root `bun install` re-resolves its dependencies and commits them
  to `bun.lock` even though Renovate will not open a PR against
  `docs/package.json`. That is how #156 moved the Docusaurus tree and broke
  Mermaid SSR. `docs.yml` now runs on `bun.lock` as well, so the docs build
  actually gets exercised when that happens.
- A release has to be three days old before Renovate will propose it. Until
  then, the PR carries a pending `renovate/stability-days` check.
- Vulnerability fixes come from the OSV database, not from Dependabot alerts.
  They ignore the schedule and the two limits below: every limit check in
  Renovate is guarded on `!isVulnerabilityAlert`, so a security PR opens
  immediately however many others are queued.
- OSV covers the npm dependencies only. Nothing scans the docker images in
  `docker-compose.yml` and `test.yml` — `security.yml` runs Gitleaks, which
  looks for secrets, not CVEs. Those tags are on you.
- Two PRs an hour, ten open at once, for everything else. A "create everything"
  click on the dashboard trickles out at that rate.
- Nothing automerges. CI is the gate and a human merges.

## Where to look

- The **Dependency Dashboard** issue lists what is waiting on the schedule and
  every dependency Renovate detected. Tick a line to get that PR now. Tick the
  last checkbox to make Renovate run again.
- The job log is on the Mend portal, sign in with GitHub:
  `https://developer.mend.io/github/EggsLeggs/Riftseer`. Go there when a PR
  you expected never appeared.
- From a terminal:

```bash
# --author does not match a GitHub App on `gh issue list`, and neither does
# --app; both return nothing. The search filter does.
gh issue list --search "author:app/renovate"   # the dashboard issue number
gh pr list --author app/renovate --state all   # what it has opened
gh issue view <dashboard> --json body -q .body # what is awaiting schedule

# Force a run without leaving the terminal: tick the dashboard's last checkbox.
gh issue view <dashboard> --json body -q .body \
  | sed 's/- \[ \] <!-- manual job -->/- [x] <!-- manual job -->/' \
  | gh issue edit <dashboard> --body-file -
```

## Changing the config

- Validate before pushing. Renovate reports a bad config as a new issue and
  stops, which is easy to miss.

```bash
npx --yes --package renovate renovate-config-validator .github/renovate.json5
```

- Never rebase a Renovate branch by hand. Tick the rebase box in the PR body
  and it regenerates the lockfiles itself.
- To close a PR and stop hearing about that version, close it. Renovate treats
  a closed PR as "ignore this version".
- `ignorePaths` covers `docs/` while the Docusaurus site still exists. Remove
  that entry when the site goes.
