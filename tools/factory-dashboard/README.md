# Factory dashboard

One local page that shows the state of the software factory: what needs you, board drift,
open PRs and their CI, the board by status, worktrees, recent CI and deploy runs, and live API
health, and a backlog review. Three tabs (CTO, Software Factory and Architecture) are kept in the URL hash (`#cto`, `#factory`, `#architecture`); the old hashes `#product` and `#business` open CTO and `#engineering` opens Software Factory. CTO is the default. It reads top to bottom as 7 panels, modelled on the Burrow CTO dashboard. Each panel has an uppercase title, a source tag and "N min ago" (when the server read the data; the ages update every minute without a new fetch; on Infra and cost the time is when the AWS cost was read, because that figure is cached up to 12 hours). Panels are `h2`, their parts `h3`, cards `h4`. Needs you: one line per item ("Review PR #N: title" for a green non-draft PR or one labelled `ready-to-merge`, "Unblock #N: title" for an issue labelled `blocked` only when none of the issues in its "### Depends on" section is still open, "Do #N: title" for any issue labelled `ready-for-human`). Product (GitHub): one row per open GitHub milestone (read with `gh api repos/.../milestones?state=open`, REST, read-only) with title, due date, days left or days late, a progress bar and "X of Y done" (closed and total issues), or "No milestones yet. Add one on GitHub."; then the open issues table (ID, Issue, Owner = first assignee else "Unassigned", State = board status, Priority = the `priority:*` label, sorted by priority; 10 rows a page); then the launch blockers. If the board did not load, State says Unknown. Engineering and Infra and cost sit side by side (one column under 700px). Engineering has the open PRs with their CI and a one-line summary (from the PR body, else the linked issue), the last 5 CI runs on main (newest first) and the last 8 commits on `origin/main` (short sha, subject, age; as of the last fetch, the dashboard never fetches). Infra and cost shows AWS spend this month against a $10.00 budget, the API health result and the time since the last good deploy. If AWS cannot be read, it says why ("AWS login missing or expired. Run: aws login", or "Could not read AWS cost." with a short reason). Business and Usage sit side by side. Business has three tiles (users, monthly cost, next sync), the open decisions (one line each), next steps by owner (overdue first, marked with the word "Overdue"), a cost bar chart with a table view, then the links card; the numbers come from `business.json` (see below). Usage has rows for users, sign-ups, active families, entries written and app installs; a value with no source shows "not yet" and the reason (only the user count has a source today, `business.json`). Decisions lists the open and decided decisions from `business.json` and every `docs/adr/*.md` with its number, title and status, each linking to the file on GitHub. What used to sit on CTO moved to Software Factory: the headline strip (launch blockers open, PRs shipped this week with a 7-day sparkline, feature flags on of total, open issues) and Shipped this week (PRs merged in the last 7 days grouped by area, each with a one-line summary taken from the PR body, at most 140 characters, plus a bar chart by area) are in Review, the roadmap (one stacked bar per area: Ready, In progress, Blocked, Backlog, Other, with a table view) is in Plan, and feature flags (`FEATURE_*` and `EXPO_PUBLIC_FEATURE_*` only) are in Release. Software Factory starts with a strip of four DORA tiles (see Delivery metrics below), then is grouped by stage of the software life cycle, each with its own heading. Plan: the board by status for open issues (one stacked bar of Ready, In progress, In review, Blocked and Backlog, for all areas or the chosen area, with the No status count under it, then a paged list per status, with Done closed), the roadmap (stacked bars by area), drift, and the backlog review (closed until you open it). Build: cycle time and work in progress, then worktrees (closed until you open it). Review: PRs merged per week as bars, the headline strip (launch blockers open, PRs shipped this week with a 7-day sparkline, feature flags on of total, open issues), and Shipped this week (see CTO above for what each part shows). Test: a health strip of four tiles (CI pass rate on main, time since the last good deploy, flaky tests open, open PRs; each has a status in words) and a strip of the last 30 CI runs on main, oldest at the left (pass is green, fail is red with a cross, cancelled or unfinished is a short grey block). Release: deploys per week, lead time for changes, feature flags, then deploys and recent runs (closed until you open them). Operate: API health (closed until you open it). Every issue title (blockers, board, needs you, drift, backlog review, flaky) has a one-line summary from the issue body (the first sentence of "Context", else the first acceptance criterion, else the first line). The page gets only summaries, never a full PR or issue body. Long lists show 10 items per page with Previous and Next buttons. The lists in the board status columns and the Shipped this week area cards are at most 420px tall and scroll inside (a focusable region named for the column). Board counts are for open issues only; a closed issue still on the board shows only as drift. Charts are inline SVG built with `createElementNS`: no chart library, no CDN, no `innerHTML`. The colors are chart tokens in the page CSS (light and dark), validated with the dataviz palette validator. A part that fails to draw shows "Could not draw this part." and the rest still draws. A part whose data failed to load says so in its summary line and inside. Every chart has a table view. With fewer than 10 finished runs the tile says "Too few runs to judge". The pass-rate bands are Healthy at 90% and up, Watch at 70% to 89%, Failing below 70%. The run strip uses the page's existing green, red and grey; no new chart colors. An area filter (from `area:*` labels), shown on both tabs, narrows every section except the Product, Infra and cost, Business, Usage and Decisions panels (each says "All areas"), the backlog review, the CI tile, the deploy tile, the CI run strip and the throughput chart (those are repo-wide).

## Architecture tab

Draws every `mermaid` code block in `docs/*.md`, `docs/adr/*.md` and `docs/learnings/*.md` (main checkout). The docs are the only source: the dashboard keeps no copy, and a new block shows after a reload. `GET /api/diagrams` reads the files on each call (not cached). Groups: System (`backend-services.md`, the ADRs and any other doc), User flows (`frontend.md`), Data (`docs/learnings`). Each card has the title (nearest heading above the block), a link to the file and line on GitHub (`main`), "Last changed N days ago" from `git log -1` for the file ("May be out of date" over 30 days), the drawing, and "Show the text" (the source in a `<details>`). A diagram Mermaid cannot draw shows "Could not draw this diagram." with the reason; the others still draw. Mermaid (pinned in `package.json`) is served from `node_modules` at `/vendor/mermaid.min.js`, runs with `securityLevel: 'strict'`, and follows the page's light or dark theme. The page loads nothing from outside localhost. Run `pnpm install` once so the bundle exists. No tests cover it (decision in #909); check by hand on a spare port with `curl /api/diagrams`.

## Delivery metrics (DORA)

All of this is repo-wide: the area filter does not change it. No tests cover it (the product owner decided so on 2026-11-16); check it by hand with `FACTORY_PORT=4398 pnpm factory` and `curl /api/state` (the `delivery` key).

- Strip of 4 tiles at the top of Software Factory: Deploy frequency and Lead time for changes have a value and a band in words (Elite, High, Medium, Low). Change failure rate and Time to recover say "Not measured yet".
- Deploy frequency counts successful `deploy.yml` runs on `main` (runs created in the last 56 days are read, at most 500; if the list reaches 500 the page says "May be cut off", also on the tile) over 28 days, shown per week. Bands, by deploys per day: more than 1 is Elite; from 1 a day down to 1 a week is High; down to 1 a month is Medium; less is Low. "Deploys per week" shows 8 weeks as bars with a table view.
- Lead time, per PR merged in the last 28 days: code (first commit to PR opened), review (opened to merged), deploy (merged to the end of the first successful deploy run for the PR's merge commit; if none matches, the first successful deploy run that started after the merge). A PR with no such run shows "Not deployed yet" and is left out of the deploy and total medians (code and review medians use all PRs). Bands, on the median total: under 1 day Elite, up to 1 week High, up to 30 days Medium, over Low. Bars show the medians; the table view lists every PR, 10 per page.
- First-commit times come from one read-only `gh api graphql` search (`base:main`, 100 PRs a page, 10 pages at most, 1 commit per PR), because `gh pr list --json commits` is over the GraphQL node limit at this size. At 1,000 PRs it stops and the page says "May be cut off: more than 1,000 PRs merged in 28 days". A GraphQL `errors` reply is reported as a source error. A PR with no first commit time shows "First commit unknown", is left out of the code median, and its total starts when the PR was opened.
- Deploy matching is approximate. For a `workflow_run` deploy, `headSha` is the main HEAD when the run was created, not always the PR's merge commit, so the match is by sha first and else by time. The error is usually a few minutes. A deploy counts when its run ends. The Total median is the median of each PR's total, not the sum of the stage medians. With no PR merged in 28 days the tile says "No PRs merged in 28 days".
- Cycle time: median time from opened to closed for `ticket` issues closed as completed (not "not planned") in the last 28 days. Work in progress: open board items in In progress plus In review.

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

`business.json` is the only source for the Business, Usage and Decisions panels on the CTO tab. It is private: it is in `.gitignore` and must never be committed (this repo is public). Copy `business.example.json` to `business.json` and fill it in. When the file does not exist, the panels say so and the rest of the page works. No API is called and no secret is read, so keep only names, counts and dollar amounts in it. The server reads it on each refresh (after the 5 minute cache, or press Refresh). Unknown values are `null` and show as "Not set". An invalid file shows its reason in the group and does not break the page. Every key must be present; `null` is the only way to say unknown, and a missing key is an error. Dates must be real dates (2026-02-31 is refused), `monthly` must be under 1,000,000,000, and `users.count` a safe whole number. `links` is optional: a list of `{ "label": "...", "url": "https://..." }`. A missing `links` means none. Every `url` must start with `https://` and every `label` must be text, or the group shows the reason. When the list is not empty, a small Links card at the bottom of the Business group opens each link in a new tab. Keep real links only in `business.json`.

- `updatedAt`: date, `YYYY-MM-DD`.
- `users`: `{ "count": whole number or null, "date": date or null }`.
- `costs`: a list of `{ "service": text, "monthly": US dollars or null }`. The total is computed from the lines that are set, and the tile says how many are not set.
- `decisions`: a list of `{ "question", "options" (list of text, may be empty), "recommendation" (text or null), "decided" (text or null), "owner", "date" }`. A decision with `decided: null` is open and shows under "Decisions needed".
- `nextSteps`: a list of `{ "owner", "task", "due" (date or null), "done" (true or false) }`. A step is overdue when it is not done and its due date is before today. Steps are grouped by owner, overdue first.
- `nextSync`: date or null.

## Linear: GRI

The Business panel on the CTO tab lists the open issues of the Linear team with key GRI (completed, canceled and duplicate are left out): ID (a link), title, status, priority, assignee ('Unassigned' when none) and last updated. Rows sort by priority (no priority last), then newest update first, 10 per page.

One-time setup: create a personal API key in Linear (Settings, Security and access) and store it in the macOS Keychain. The command asks for the key without echoing it:

```sh
security add-generic-password -a "$USER" -s gg-dashboard-linear -w
```

The server reads the key from the Keychain on each call (`security find-generic-password -s gg-dashboard-linear -w`), sends one read-only GraphQL query to `https://api.linear.app/graphql`, and keeps the result in memory for 10 minutes. The key is never logged, never sent to the page or `/api/state`, and never written to a file. Without the key the section says "Linear key not set. See the README." If the call fails it says "Could not read Linear: <reason>". If a refresh fails after a good read, the last good rows stay with a note. One read has an 8 second limit and shows at most 1000 issues. The rest of the page loads either way.

## Read-only

The server only runs `gh`, `git` and one `aws` read command (`issue list` (open issues with their bodies and assignees, closed issues of the last 28 days for the drift and area checks, closed issues of the last 7 days with their bodies for summaries), `pr list`, `api repos/.../milestones` (open milestones, REST), `run list`,
`project item-list`, `variable list` (feature flag names and values only), `pr list --state merged` (28 days, with the opened time, the body and the branch name, which feed the PR summary and area; Shipped keeps the last 7), `run list --workflow ci.yml --branch main` and `run list --workflow deploy.yml` (runs of the last 56 days, at most 500, with the end time and commit sha), one `gh api graphql` search query for merged PRs with their first commit time, `worktree list`, `status`, `rev-list`, `log origin/main` for the recent commits), `aws ce get-cost-and-usage` (this month, MONTHLY, UnblendedCost; see below), a read of `docs/adr/*.md`, one GET to the health endpoint, a read of `backlog-review.json` and `business.json`, and one read-only Linear GraphQL query (see Linear: GRI).
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
