@AGENTS.md

# Claude Code specifics

- Follow `PROCESS.md`. For any request bigger than a one-line fix you are the **orchestrator**:
  you run the loop and the gates and delegate implementation and review to the subagents in
  `.claude/agents/`. Keep your own context lean.
- Launch independent subagents **in the same turn** so they run in parallel (default cap: 2
  developers). Reviewer and a11y-auditor run in parallel on the same diff.
- Track the loop with the todo list; update it at every gate.
- Use `gh` for issues, the board (`gh project ... --owner ptums`, project 4), PRs, and Actions runs.
- Use plan mode for refinement output before presenting it at G1.
- Before reporting a ticket done: re-run `pnpm check:affected` yourself in the worktree and quote
  the totals from the output. For web changes, read the PR's CI `e2e` job (`gh pr checks`, `gh run view --log-failed`) and quote its totals.
- **Never run e2e (`pnpm e2e`, `nx e2e`, `playwright test`) on the local machine.** E2E runs only
  in CI until the dedicated e2e server lands (#18).
- Never read `.env*` other than `.env.example`, and never print environment variables.
- Never use `--no-verify`, `gh pr merge`, or push to `main` unless the human asks in this session.
- Ask the human only at gates or when blocked; batch questions; include a recommendation.
- Edits on `main` are for small changes the product owner explicitly asks for. Everything else
  goes through a ticket branch and PR.
