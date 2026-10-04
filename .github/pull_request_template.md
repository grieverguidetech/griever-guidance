Closes #

## What changed and why

## Read this closely

<!-- 2–3 places the human should check with their own eyes. -->

1. `file`, `function`: what could be wrong, how to check
2.

## Constraints touched (REQUIREMENTS.md §2)

<!-- e.g. "C2: no message text is persisted — the draft drops `sendJob`; tested in useSendFlow.spec.ts". Or "None". -->

## Checks

- [ ] `pnpm check:affected` passes (orchestrator re-ran it in the worktree)
- [ ] `pnpm e2e` passes (web changes)
- [ ] Tests added for the new behavior; no `.only` / `.skip` / `.todo`
- [ ] UI: keyboard, labels, states, focus covered; a11y-auditor reviewed
- [ ] Copy read as a grieving user would read it; no exclamation points
- [ ] `REQUIREMENTS.md` / `DATA.md` / `PROCESS.md` updated if their facts changed

```
paste the check output totals here (passed AND failed)
```

## Review

<!-- Reviewer verdict and any should-fix items deferred to an issue. -->

## Not verified

<!-- What wasn't checked, e.g. "not run on a real iPhone". -->
