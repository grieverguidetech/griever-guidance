# Factory dashboard

One local page that shows the state of the software factory: what needs you, board drift,
open PRs and their CI, the board by status, worktrees, recent CI and deploy runs, and live API
health. An area filter (from `area:*` labels) narrows every section.

## Run

```bash
pnpm factory
```

Open http://127.0.0.1:4317. Set `FACTORY_PORT` to use another port. Data is cached for 30
seconds; the Refresh button reloads it.

## Read-only

The server only runs `gh` and `git` read commands (`issue list`, `pr list`, `run list`,
`project item-list`, `worktree list`, `status`, `rev-list`) and one GET to the health endpoint.
It never writes to GitHub or git, never fetches, and never reads `.env*` files.

## Drift rules

- Board says In review, but no open PR links the issue.
- Board says In progress, but there is no worktree and no open PR.
- Issue is closed, but the board status is not Done.
- Issue is open, but it has no board status or is not on the board.
- A worktree's `ticket/N` issue is closed.

The rules live in `src/model.ts` and are unit-tested in `src/model.spec.ts`.
