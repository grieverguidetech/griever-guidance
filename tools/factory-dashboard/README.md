# Factory dashboard

One local page that shows the state of the software factory: what needs you, board drift,
open PRs and their CI, the board by status, worktrees, recent CI and deploy runs, and live API
health, and a backlog review. Three tabs (Product, Engineering, Business) are kept in the URL hash. Product reads top to bottom in order of importance: a headline strip (launch blockers open, PRs shipped this week with a 7-day sparkline, feature flags on of total, open issues), launch blockers, PRs merged in the last 7 days grouped by area (each with a one-line summary taken from the PR body, at most 140 characters, plus a bar chart by area), a roadmap as one stacked bar per area (Ready, In progress, Blocked, Backlog, Other) with a table view, then feature flags (`FEATURE_*` and `EXPO_PUBLIC_FEATURE_*` only). The page gets only the summary, never the full PR body. Charts are inline SVG built with `createElementNS`: no chart library, no CDN, no `innerHTML`. The colors are chart tokens in the page CSS (light and dark), validated with the dataviz palette validator. Engineering starts with four health sections (CI health on main: pass rate of the last 30 CI runs, cancelled and unfinished runs ignored; flaky-test issues; the last 5 deploys and time since the last good one; throughput: PRs merged per week for 4 weeks and median hours opened to merged), then the sections above. Business says "Coming soon". An area filter (from `area:*` labels) narrows every section except the backlog review and the health sections other than Flaky tests.

## Run

```bash
pnpm factory
```

Open http://127.0.0.1:4317. Set `FACTORY_PORT` to use another port. Data is cached for 30
seconds; the Refresh button reloads it.

## Backlog review

`backlog-review.json` holds one review per open issue: `number`, `action` (`close`, `decide`,
`rewrite` or `keep`), `recommendation` and `why`, plus a top-level `reviewedAt` date. The server
reads the file on each refresh, so an edit shows without a restart (after the 30 second cache, or
press Refresh). Rows sort close, decide, rewrite, not reviewed, keep, then by issue number. Open
issues with no review show as "Not reviewed". Reviews for closed issues are left out and counted.
A missing or invalid file shows its reason in the section and does not break the page.

## Read-only

The server only runs `gh` and `git` read commands (`issue list`, `pr list`, `run list`,
`project item-list`, `variable list` (feature flag names and values only), `pr list --state merged` (28 days, with the opened time, the body and the branch name, which feed the PR summary and area; Shipped keeps the last 7), `run list --workflow ci.yml --branch main` and `run list --workflow deploy.yml`, `worktree list`, `status`, `rev-list`), one GET to the health endpoint, and a read of `backlog-review.json`.
It never calls `gh secret`, never writes to GitHub or git, never fetches, and never reads `.env*` files.

## Drift rules

- Board says In review, but no open PR links the issue.
- Board says In progress, but there is no worktree and no open PR.
- Issue is closed, but the board status is not Done.
- Issue is open, but it has no board status or is not on the board.
- A worktree's `ticket/N` issue is closed.

The rules live in `src/model.ts` and are unit-tested in `src/model.spec.ts`.

## Always on

A macOS LaunchAgent (`com.grieversguidance.factory`) starts the dashboard at login and restarts it
if it stops. It always runs from the main checkout, not from a worktree. The server only calls
GitHub when the page is open, so an idle server uses no API rate limit.

- Install (safe to run again): `pnpm factory:install`. It finds `node`, `pnpm` and `gh`, writes
  `~/Library/LaunchAgents/com.grieversguidance.factory.plist`, loads it, then waits up to 20
  seconds for http://127.0.0.1:4317. Pass another repo root as an argument if needed.
- Uninstall: `pnpm factory:uninstall`.
- Logs: `tail -f ~/Library/Logs/gg-factory.log`. The log grows over time. Clear it with
  `: > ~/Library/Logs/gg-factory.log`.
- After an `nvm` (or other node version) change, run `pnpm factory:install` again. The agent
  keeps the node and pnpm paths it found at install time.
- Status: `launchctl print gui/$(id -u)/com.grieversguidance.factory`

### Friendly URL

You can also open http://gg-tech-dashboard.localhost:4317. The server listens on 127.0.0.1 and
::1 (macOS resolves `*.localhost` to ::1). It accepts only `127.0.0.1:<port>`, `localhost:<port>`
and `gg-tech-dashboard.localhost:<port>` as host names, and rejects the rest, including the bare
name with no port and `[::1]:<port>`.

If port 4317 is already in use, the server logs "Port 4317 in use" and exits without a restart
loop. `install.sh` then reports that the agent did not answer.

`gh` uses your keychain login. The scripts never read `.env*` files.
