# Dependency updates

Renovate opens the dependency PRs. It runs as the hosted Mend GitHub App, reads
`.github/renovate.json5`, and has no API of its own beyond GitHub: the
Dependency Dashboard issue, the PRs it opens, and the job log on the Mend
portal are the whole interface.

## Cadence

- Branches are created on Mondays between 00:00 and 03:59 UTC.
- Every non-major bump lands in one PR titled `fix(deps): update all non-major
  dependencies`. Majors get a PR each, except GitHub Actions, which share one.
- Lockfile maintenance runs weekly. It regenerates `bun.lock` and the two
  standalone `package-lock.json` files even when no range moved.
- A release has to be three days old before Renovate will propose it. Until
  then the PR carries a pending `renovate/stability-days` check.
- Vulnerability fixes come from the OSV database, not from Dependabot alerts,
  and ignore the schedule.
- Two PRs an hour, ten open at once. A "create everything" click on the
  dashboard trickles out at that rate.
- Nothing automerges. CI is the gate and a human merges.

## Where to look

- The **Dependency Dashboard** issue lists what is waiting on the schedule and
  every dependency Renovate detected. Tick a line to get that PR now. Tick the
  last checkbox to make Renovate run again.
- The job log is on the Mend portal, sign-in with GitHub:
  `https://developer.mend.io/github/EggsLeggs/Riftseer`. Go there when a PR
  you expected never appeared.
- From a terminal:

```bash
gh issue list --author app/renovate            # the dashboard issue number
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
