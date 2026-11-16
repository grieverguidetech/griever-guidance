# Factory dashboard

One local page that shows the state of the software factory: what needs you, board drift,
open PRs and their CI, the board by status, worktrees, recent CI and deploy runs, and live API
health, and a backlog review. An area filter (from `area:*` labels) narrows every section except the backlog review.

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
`project item-list`, `worktree list`, `status`, `rev-list`), one GET to the health endpoint, and a read of `backlog-review.json`.
It never writes to GitHub or git, never fetches, and never reads `.env*` files.

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
- Logs: `tail -f ~/Library/Logs/gg-factory.log`
- Status: `launchctl print gui/$(id -u)/com.grieversguidance.factory`

### Friendly URL with no port (one-time, needs sudo)

Run this yourself from the main checkout:

```text
sudo bash tools/factory-dashboard/launchd/port80-install.sh
```

Then open http://gg-tech-dashboard.localhost. (`pnpm factory:port80` prints this command; it does
not run sudo.) The step changes three things on this Mac:

- Writes `/etc/pf.anchors/com.grieversguidance.factory` with two rules that send port 80 on the
  loopback (127.0.0.1 and ::1) to port 4317. Nothing outside this Mac can reach it.
- Loads the rules into the pf anchor `com.apple/gg-factory` and turns pf on (`pfctl -E`). It does
  not edit `/etc/pf.conf`.
- Writes `/Library/LaunchDaemons/com.grieversguidance.factory.pf.plist`, which loads the rules
  again at boot.

The server accepts the host names `127.0.0.1`, `localhost` (with the port) and
`gg-tech-dashboard.localhost`. It rejects every other host name. It listens on 127.0.0.1 and ::1.

To undo: `sudo bash tools/factory-dashboard/launchd/port80-uninstall.sh`
(`pnpm factory:port80:remove` prints it). Both scripts are safe to run again.

`gh` uses your keychain login. The scripts never read `.env*` files.
