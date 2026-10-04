# AGENTS.md: roles, rules, and the board

Tool-agnostic. Applies to the orchestrator and every subagent (Claude Code, Codex, Cursor, or a
human playing a role). **`PROCESS.md` says *when*; this file says *who* and *how*.**
`REQUIREMENTS.md` says *what* and is the source of truth for the product.

## Ground rules

1. **The user comes first.** Someone who has just lost a loved one, on a phone, exhausted
   (`REQUIREMENTS.md` §1). If a change makes the app slower or more confusing for that person,
   the change is wrong, whatever it enables.
2. **`REQUIREMENTS.md` §2 (C1–C10) and §6 are binding.** Breaking one is a defect. Flag conflicts;
   don't resolve them silently.
3. **All work is tracked on the board** (GitHub Project #4, see `PROCESS.md` §0). No ticket, no
   branch. The issue is where scope, decisions, and blockers are written down.
4. **One ticket = one branch = one worktree = one PR.** Stay inside the ticket's `files_touched`.
5. **Agents never merge and never push to `main`.** The human merges. CI deploys.
6. **Every PR links its issue** (`Closes #N`), has green CI, and includes the check output.
7. **Small PRs** (~300 changed lines). Bigger: ask the ticketer to split.
8. **Blocked or ambiguous:** comment on the issue, label `blocked`, stop. Don't guess on
   requirements, and don't invent product decisions. Bring them to a gate with a recommendation.
9. **Secrets.** Never read or print `.env` / `.env.*` (`.env.example` is fine), tokens, or keys.
   Never put secrets in prompts, issues, commits, PRs, or logs.
10. **Check `git status` before writing.** Never delete or overwrite files you didn't create. If
    you find changes you didn't make, stop and tell the human.
11. **Honesty about verification.** Never say "verified", "tested", or "works" unless you ran it in
    this session and can show the output. State what you did NOT check. Quote totals from output,
    not from memory or another agent's report.
12. **Tests ship with every ticket.** No `.only` / `.skip` / `.todo`. Never weaken an assertion to
    get green; fix the cause or record a tracked `test.fail()` with the issue named.
13. **Simple, readable code the human can defend.** Small functions, plain names, comments only
    where the *why* isn't obvious. Point out the risky parts in the PR.
14. **Calm copy.** No exclamation points, no celebratory microcopy (C7). Read it aloud as the user.
15. **Log real process problems** in `SELF_IMPROVEMENT.md`. Every entry ends in a rule.

## Roles

Each role is a Claude Code subagent in `.claude/agents/<name>.md`. Other tools: read that file as
the role's brief.

| Role | Writes code? | Job |
|---|---|---|
| **orchestrator** | No feature code | Runs `PROCESS.md`. Owns the board, worktrees, gates, parallelism, and the independent check. Delegates everything else. |
| **pm** | No | Turns a request into a user story, scope, risks, and the constraints it brushes against. Proposes (never applies) `REQUIREMENTS.md` changes. Cuts scope toward "one next thing". |
| **architect** | Docs only | Decides where code goes per §6 and what it deliberately doesn't do. Updates `REQUIREMENTS.md` §6 / `DATA.md` in the ticket that changes the facts. |
| **ticketer** | No | Splits approved work into small tickets with disjoint `files_touched`, checkable acceptance criteria, and planned tests. Creates nothing until G1. |
| **developer** | Yes | Implements exactly one ticket in its worktree, with tests. Runs the checks and reports the output. Commits; doesn't push or open the PR. |
| **tester** | Tests only | Finds untested requirements and constraints; writes tests-only PRs; maintains the e2e suite; runs e2e against production after deploys; lists `HUMAN TODO` checks. |
| **reviewer** | No (read-only) | Diff review: acceptance criteria, correctness, constraints C1–C10, copy tone, tests that would fail if the code broke, security/privacy, scope creep. Ranks blocker / should-fix / nit. Gives 2–3 "read this closely" items. |
| **a11y-auditor** | No (read-only) | Any UI change: keyboard flow, focus, labels, roles/states, contrast (computed, not guessed), touch targets, reduced motion, screen-reader announcements. Runs the Playwright + axe suite. |

### Models

- **Orchestrator and judgment roles** (pm, architect, ticketer, reviewer, a11y-auditor): the
  session's model (`model: inherit`). Start the session on the strongest available model.
- **developer and tester**: `model: sonnet`. A cheaper implementer is acceptable because the
  independent check, reviewer, and CI catch problems; a weaker reviewer is not.
- Default parallelism is **2** concurrent developers. Raise it only when tickets have disjoint
  files and the human's usage allows.

## Stack (see `REQUIREMENTS.md` §6 for the full picture)

- **pnpm** (pinned via `packageManager`) + **Nx**. Never npm or yarn.
- `apps/`: `web` (React + Vite + Tailwind), `mobile` (Expo), `gateway` (Hono on Cloudflare
  Workers, fronting Convex), `marketing` (Astro), `web-e2e` (Playwright).
- `libs/`: `shared`, `api-client`, `hooks`, `ui-web`, `data-local`, `data-sync`, `contacts`,
  `identity`, `gateway-messages`, `gateway-sync`.
- Tests: **Vitest** (+ React Testing Library, jest-dom, fake-indexeddb) for unit and
  integration; **Playwright** (+ `@axe-core/playwright`) for e2e. See `PROCESS.md` §7.
- CI/CD: GitHub Actions. `ci.yml` gates every PR and `main`; `deploy.yml` deploys to Cloudflare
  (Workers + Pages) and Convex Cloud only after CI passes on `main`, then smoke-tests production.

### Known gotchas

- **Inferred Nx `test` targets don't build dependencies first.** A Vitest config that doesn't
  extend `vitest.base.mts` resolves workspace packages to `dist/` and fails on a clean checkout.
- **Spec files are excluded from `tsconfig.lib.json`** so they don't ship in `dist/`. They aren't
  typechecked yet. Model fixtures on the real types anyway.
- **Husky isn't installed here**, so CI is the only gate. Run `pnpm check:affected` before you
  report done.
- **E2E needs browsers once per machine:** `pnpm exec playwright install chromium webkit`.
- **Parallel e2e runs:** each worktree uses port 4300 by default. Set `E2E_PORT` per worktree
  when running e2e in more than one at a time.
- **Native-only modules** (`expo-contacts`) need a `.web.ts` stub or they crash the web bundle.
- **`CORS_ORIGINS`** must match the deployed origin exactly; take URLs from the deployment, never
  infer them.

## Commands (root `package.json` is the interface)

`pnpm dev` · `dev:web` · `dev:gateway` · `dev:mobile` · `dev:marketing` · `check` (typecheck +
test + build) · `check:affected` · `typecheck` · `test` · `build` · `e2e` · `convex:up` ·
`convex:dev`

## The board

| Status | Means | Label |
|---|---|---|
| Backlog | Captured, not refined | — |
| Ready | Has acceptance criteria, no open dependencies | `ready` |
| In progress | A developer is working in a worktree | `in-progress` |
| In review | PR open; reviewer + CI; waiting on the human | `in-review` |
| Blocked | Needs a human decision or an outside dependency | `blocked` |
| Done | Merged and deployed | (issue closed) |

Every ticket also carries `ticket`, one `area:*`, and one `size:*` label, plus `a11y` / `copy` /
`tests` / `process` where they apply. Labels are the fallback if a board field can't be set.

## Definition of done

See `PROCESS.md` §12.
