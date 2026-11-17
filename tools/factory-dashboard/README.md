# Factory dashboard

One local page that shows the state of the software factory: what needs you, board drift,
open PRs and their CI, the board by status, worktrees, recent CI and deploy runs, and live API
health, and a backlog review. Two tabs (CTO and Software Factory) are kept in the URL hash (`#cto`, `#factory`); the old hashes `#product` and `#business` open CTO and `#engineering` opens Software Factory. CTO is the default. It reads top to bottom: Needs you (cards with summaries: a green non-draft PR or one labelled `ready-to-merge`; an issue labelled `blocked` only when none of the issues in its "### Depends on" section is still open; any issue labelled `ready-for-human`), then a Product group, an Engineering group, an Infra and cost group, a Business group and a Decisions group. Product has a headline strip (launch blockers open, PRs shipped this week with a 7-day sparkline, feature flags on of total, open issues), launch blockers, PRs merged in the last 7 days grouped by area (each with a one-line summary taken from the PR body, at most 140 characters, plus a bar chart by area), a roadmap as one stacked bar per area (Ready, In progress, Blocked, Backlog, Other) with a table view, then feature flags (`FEATURE_*` and `EXPO_PUBLIC_FEATURE_*` only). Engineering has the open PRs with their CI and a one-line summary (from the PR body, else the linked issue), then the last 8 commits on `origin/main` (short sha, subject, age; as of the last fetch, the dashboard never fetches). Infra and cost shows AWS spend this month against a $10.00 budget, the API health result and the time since the last good deploy. If AWS cannot be read, it says why ("AWS login missing or expired. Run: aws login", or "Could not read AWS cost." with a short reason). Decisions, after Business, lists every `docs/adr/*.md` with its number, title and status, each linking to the file on GitHub. Business has decisions needed, next steps by owner (overdue first, marked with the word "Overdue"), three tiles (users, monthly cost, next sync), then a cost bar chart with a table view, then the links card; the numbers come from `business.json` (see below). Software Factory is grouped by stage of the software life cycle, each with its own heading. Plan: the board by status for open issues (one stacked bar of Ready, In progress, In review, Blocked and Backlog, for all areas or the chosen area, with the No status count under it, then a paged list per status, with Done closed), drift, and the backlog review (closed until you open it). Build: worktrees (closed until you open it). Review: PRs merged per week as bars. Test: a health strip of four tiles (CI pass rate on main, time since the last good deploy, flaky tests open, open PRs; each has a status in words) and a strip of the last 30 CI runs on main, oldest at the left (pass is green, fail is red with a cross, cancelled or unfinished is a short grey block). Release: deploys and recent runs (closed until you open them). Operate: API health (closed until you open it). Every issue title (blockers, board, needs you, drift, backlog review, flaky) has a one-line summary from the issue body (the first sentence of "Context", else the first acceptance criterion, else the first line). The page gets only summaries, never a full PR or issue body. Long lists show 10 items per page with Previous and Next buttons. Board counts are for open issues only; a closed issue still on the board shows only as drift. Charts are inline SVG built with `createElementNS`: no chart library, no CDN, no `innerHTML`. The colors are chart tokens in the page CSS (light and dark), validated with the dataviz palette validator. A part that fails to draw shows "Could not draw this part." and the rest still draws. A part whose data failed to load says so in its summary line and inside. Every chart has a table view. With fewer than 10 finished runs the tile says "Too few runs to judge". The pass-rate bands are Healthy at 90% and up, Watch at 70% to 89%, Failing below 70%. The run strip uses the page's existing green, red and grey; no new chart colors. An area filter (from `area:*` labels), shown on both tabs, narrows every section except the Product and Business groups (each says "All areas"), the backlog review, the CI tile, the deploy tile, the CI run strip and the throughput chart (those are repo-wide).

## Run

```bash
pnpm factory
```

Open http://127.0.0.1:4317. Set `FACTORY_PORT` to use another port. Data is cached for 5
minutes; the Refresh button reloads it.

## Backlog review

`backlog-review.json` holds one review per open issue: `number`, `action` (`close`, `decide`,
`rewrite` or `keep`), `recommendation` and `why`, plus a top-level `reviewedAt` date. The server
reads the file on each refresh, so an edit shows without a restart (after the 5 minute cache, or
press Refresh). Rows sort close, decide, rewrite, not reviewed, keep, then by issue number. Open
issues with no review show as "Not reviewed". Reviews for closed issues are left out and counted.
A missing or invalid file shows its reason in the section and does not break the page.

## Business numbers

`business.json` is the only source for the Business group on the CTO tab. It is private: it is in `.gitignore` and must never be committed (this repo is public). Copy `business.example.json` to `business.json` and fill it in. When the file does not exist, the group says so and the rest of the page works. No API is called and no secret is read, so keep only names, counts and dollar amounts in it. The server reads it on each refresh (after the 5 minute cache, or press Refresh). Unknown values are `null` and show as "Not set". An invalid file shows its reason in the group and does not break the page. Every key must be present; `null` is the only way to say unknown, and a missing key is an error. Dates must be real dates (2026-02-31 is refused), `monthly` must be under 1,000,000,000, and `users.count` a safe whole number. `links` is optional: a list of `{ "label": "...", "url": "https://..." }`. A missing `links` means none. Every `url` must start with `https://` and every `label` must be text, or the group shows the reason. When the list is not empty, a small Links card at the bottom of the Business group opens each link in a new tab. Keep real links only in `business.json`.

- `updatedAt`: date, `YYYY-MM-DD`.
- `users`: `{ "count": whole number or null, "date": date or null }`.
- `costs`: a list of `{ "service": text, "monthly": US dollars or null }`. The total is computed from the lines that are set, and the tile says how many are not set.
- `decisions`: a list of `{ "question", "options" (list of text, may be empty), "recommendation" (text or null), "decided" (text or null), "owner", "date" }`. A decision with `decided: null` is open and shows under "Decisions needed".
- `nextSteps`: a list of `{ "owner", "task", "due" (date or null), "done" (true or false) }`. A step is overdue when it is not done and its due date is before today. Steps are grouped by owner, overdue first.
- `nextSync`: date or null.

## Read-only

The server only runs `gh`, `git` and one `aws` read command (`issue list` (open issues with their bodies, closed issues of the last 28 days for the drift and area checks, closed issues of the last 7 days with their bodies for summaries), `pr list`, `run list`,
`project item-list`, `variable list` (feature flag names and values only), `pr list --state merged` (28 days, with the opened time, the body and the branch name, which feed the PR summary and area; Shipped keeps the last 7), `run list --workflow ci.yml --branch main` and `run list --workflow deploy.yml`, `worktree list`, `status`, `rev-list`, `log origin/main` for the recent commits), `aws ce get-cost-and-usage` (this month, MONTHLY, UnblendedCost; see below), a read of `docs/adr/*.md`, one GET to the health endpoint, and a read of `backlog-review.json` and `business.json`.
It never calls `gh secret`, never writes to GitHub or git, never fetches, writes only one file (the AWS cost cache, `~/Library/Caches/gg-factory/aws-cost.json`, outside the repo), and never reads `.env*` files.

### AWS cost

Cost Explorer bills $0.01 a call. The server calls it only when the page asks for state. A good reading is kept for 12 hours and only for the month it was read in (the period is UTC; on the 1st the old reading is stale). It is saved to `~/Library/Caches/gg-factory/aws-cost.json` (created if missing), so a restart does not call again. Refresh does not clear it. A failed or unreadable reply (including an empty `ResultsByTime` or a unit other than USD) is not kept and not saved, so the next page load tries again (a failed call costs nothing). When Cost Explorer marks the figure as an estimate, the page says "(estimate)". The page gets only the dollar amount, the budget and the read time. On failure it gets one plain reason: login problems (ExpiredToken, expired token, no credentials, SSO, InvalidClientTokenId, UnrecognizedClient) show "AWS login missing or expired. Run: aws login"; anything else shows "Could not read AWS cost." plus the first line of the error, cut to 120 characters with the CLI boilerplate removed (the error code is kept) and ARNs, 12-digit account ids, key ids and long token-like strings redacted. An unparsable reply shows "Could not read AWS cost. Unreadable reply". The raw error is never sent. The server never runs `aws login` or any other `aws` command; run `aws login` yourself in a terminal. Your AWS login comes from your own AWS CLI setup; this tool reads no `.env*` file. The always-on launchd agent needs `aws` on its PATH and uses the default AWS profile; if `aws` is not on that PATH, the group shows "Could not read AWS cost." with the reason.

## Drift rules

- Board says In review, but no open PR links the issue.
- Board says In progress, but there is no worktree and no open PR.
- Issue is closed, but the board status is not Done.
- Issue is open, but it has no board status or is not on the board.
- A worktree's `ticket/N` issue is closed.

The rules live in `src/model.ts`.

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

### Restart and auto-restart

After this merges, run `pnpm factory:install` once to turn on restart mode (the installed plist is a copy of the template). The plist sets `FACTORY_RESTART_ON_CHANGE=1`. In that mode:

- The server notes the newest file time under `src/` and `public/` at start and checks it every 30
  seconds. On a change it logs "Code changed, restarting" and exits with code 1. launchd's
  KeepAlive (SuccessfulExit=false) starts it again on the new code.
- The header shows a "Restart dashboard" button. It sends `POST /api/restart`, the server answers
  202 and exits with code 1, and the page shows "Restarting…", polls `/api/state` for up to 30
  seconds, then reloads. The endpoint needs an allowed Host, an `Origin` of exactly
  `http://<allowed host>`, the header `X-Factory-Restart: 1` and this mode. The server sends no CORS
  headers, so another web page cannot pass the preflight.
- If `/api/state` lacks a section the page expects, the page says "The dashboard was updated.
  Restart it to load the new code."

When run by hand (`pnpm factory`) none of this is on: no watcher, no button, and `POST /api/restart`
is refused. The GitHub queries are lighter too: a 5 minute cache and 28 days of closed issues.

Limit of the 28 day window: the drift rules "closed, but the board status is not Done" and "worktree of a closed issue" see only issues closed in the last 28 days, so an older closed issue with a wrong board status or a leftover worktree is not flagged. Board counts do not depend on the window: an issue that is not in the open list is closed and is not counted.

### Friendly URL

You can also open http://gg-tech-dashboard.localhost:4317. The server listens on 127.0.0.1 and
::1 (macOS resolves `*.localhost` to ::1). It accepts only `127.0.0.1:<port>`, `localhost:<port>`
and `gg-tech-dashboard.localhost:<port>` as host names, and rejects the rest, including the bare
name with no port and `[::1]:<port>`.

If port 4317 is already in use, the server logs "Port 4317 in use" and exits without a restart
loop. `install.sh` then reports that the agent did not answer.

`gh` uses your keychain login. The scripts never read `.env*` files.
