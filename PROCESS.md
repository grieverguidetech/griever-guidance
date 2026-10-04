# Process — how work gets done here

This is the working loop for anyone changing this repo, human or agent. Entry point:
`CLAUDE.md` → `AGENTS.md` (who does what, and the rules) → here (in what order). Read in this order:

1. **This file**: the order you do things in.
2. **`AGENTS.md`**: roles, ground rules, models, the board, definition of done.
3. **`REQUIREMENTS.md`**: what must be true (§1–§5) and the architecture and rules that keep it
   true (§6). Treat §2 and §6 as binding.
4. **`SELF_IMPROVEMENT.md`**: mistakes already made here, so you don't repeat them.
5. **`DATA.md`**: when the work touches storage, sync, sessions, or Convex.

**Keep this file current.** When you learn something that changes how work should be done here,
update this file (via `SELF_IMPROVEMENT.md`'s promote step) in the same PR.

---

## 0. Config (nothing here is secret)

| Key | Value |
|---|---|
| Repo | `grieverguidetech/griever-guidance` |
| Board | GitHub Project **#4** owned by `ptums`: https://github.com/users/ptums/projects/4 |
| Board fields | Status (Backlog · Ready · In progress · In review · Blocked · Done), Size (S/M/L), Role |
| CI | `.github/workflows/ci.yml` (every PR and push to `main`) |
| CD | `.github/workflows/deploy.yml` (after CI passes on `main`) |
| Live | `grieversguidance.com` · `web.grieversguidance.com` · `api.grieversguidance.com/health` |

`grieverguidetech` is a user account, not an org, so the board lives under `ptums`. Add issues to it
with `gh project item-add 4 --owner ptums --url <issue-url>`.

## 1. The loop

```
Intake → Refine → Ticket → Build (parallel) → Independent check → Review → PR → CI → Merge → Deploy → Verify → Learn
          pm/arch  ticketer  developer(s)      orchestrator       reviewer(s)        human    CD       tester    everyone
                       G1                                                     G2                    G3
```

**G = human gate.** Between gates the orchestrator runs on its own. The human (product owner)
decides at gates. Agents never merge and never push to `main`.

| Gate | When | The human decides |
|---|---|---|
| **G1 Scope** | Tickets are drafted | Approve, cut, or reorder. Nothing is built before this. |
| **G2 Merge** | PRs are green and reviewed | Read the "read this closely" items, then merge (or send back). |
| **G3 Release** | After deploy | Confirm the live check and any `HUMAN TODO` verification (a real phone, a real screen reader). |

Small, clearly-scoped requests ("fix this typo", "rename this") can skip G1. The orchestrator says
so in one line and goes straight to a ticket.

### Intake → Refine (G1)

1. **Read the rules that apply.** `REQUIREMENTS.md` §2 and §6 always. `DATA.md` if the change
   touches storage, sync, sessions, or Convex. The relevant `design_specs/` handoff if it touches a
   screen.
2. **Find the requirement.** Locate the row in `REQUIREMENTS.md` this work moves. If there isn't
   one, the work may not be wanted. Ask, or add the row as part of the change.
3. **Check it hasn't already been decided against.** Search `git log` and `SELF_IMPROVEMENT.md` for
   the area. Several ideas here were built, weighed, and reverted on purpose (e.g. explicit
   per-contact send confirmation, `039e459`). Don't rebuild them without a new reason.
4. **Verify external platform claims before building on them.** Facebook/Instagram/Apple/Google
   capabilities change and are often misremembered. Check current official docs and say in the
   commit what you checked. A feature that only works "sometimes" is worse than none for this user.
5. For anything bigger than one ticket, spawn **pm** (scope, user story, risks, which constraints
   it brushes against) and, if the shape of the code changes, **architect** (where it goes per
   §6, what it does *not* do). Their output goes in the issue body, not new docs.
6. Spawn **ticketer** to split the work (§4 below). Present the tickets at **G1**: a table of
   title, size, labels, depends-on, files touched, plus which constraints (C1–C10) each one touches.

### Ticket

On approval, the orchestrator creates one GitHub issue per ticket from the **Ticket** issue
template, adds it to the board, sets Status/Size/Role, and labels it `ticket` + `area:*` +
`size:*`. Only tickets with no open dependencies get `ready` / Status **Ready**.

### Build (parallel)

For each Ready ticket, up to the parallelism cap (default **2**; the human may raise it):

1. `git fetch && git worktree add .worktrees/<issue#> -b <type>/<area>-<slug> origin/main`.
   Move the card to **In progress** and label `in-progress`.
2. Spawn **developer** with: the issue text, its `files_touched`, the worktree path, and which docs
   apply. Launch independent developers **in the same turn** so they really run in parallel.
3. The developer implements with tests, runs the checks (§5), commits in the worktree, and reports
   back with the command output. It does not push or open the PR.

### Independent check

The orchestrator re-runs the checks in the worktree itself. **Don't trust a green claim.** If an
agent said "passes" and it doesn't, record that in `SELF_IMPROVEMENT.md`. Also confirm:

- only the ticket's `files_touched` changed: `git diff --stat origin/main...HEAD`;
- new behavior has tests, and there's no `.only` / `.skip` / `.todo`;
- no secrets, tokens, or `.env` contents in the diff.

### Review

Spawn **reviewer** (always) and **a11y-auditor** (any UI change), read-only, on the diff. They
run in parallel. Blockers go back to the developer; after **2 rounds** the ticket is labeled
`blocked` and raised at the next gate. Should-fix findings are fixed or written into the PR as
known follow-ups (with an issue).

### PR (G2)

Push the branch and open the PR from the template: `Closes #N`, what changed and why, check
output, reviewer verdict, **2–3 "read this closely" items** (file, function, what could be wrong,
how to check), and what was *not* verified. Move the card to **In review**.

Then alert the human with every open PR **in recommended merge order**, one line each plus the
read-closely items. The human is accountable for every line; say which parts most deserve their
own eyes. Don't pretend agent review replaces that.

On "merged": `git fetch`, remove merged worktrees (`git worktree remove`), rebase any open branch
that now conflicts, mark newly unblocked tickets Ready, and dispatch them.

### Deploy → Verify (G3)

Merging to `main` runs CI; when CI passes, `deploy.yml` deploys exactly that commit and
smoke-tests production. Watch it with `gh run list` / `gh run watch`. On failure, read the logs,
open a `bug` ticket, and log the cause in `SELF_IMPROVEMENT.md`.

**tester** then confirms the change on the live site where it can (`BASE_URL=https://web.grieversguidance.com pnpm e2e`
runs the e2e suite against production) and lists what only a human can check (a real iPhone's
Messages hand-off, VoiceOver) as `HUMAN TODO` on the issue.

### Learn

Before closing out, anyone who hit a surprise appends to `SELF_IMPROVEMENT.md`. Promote proven
rules into this file or `REQUIREMENTS.md` §6 in a PR labeled `process`.

## 2. Operating rules

**Autonomous (no asking):** reading files; creating branches and worktrees; writing code, tests and
docs inside a ticket; running typecheck/tests/builds/e2e; `gh` and `git` reads; creating issues,
labels and board items for approved work; opening PRs; commenting on issues; watching CI.

**Ask first (a gate or a question):** approving scope; merging; pushing to `main`; changing
GitHub secrets/variables or Cloudflare/Convex settings; manual deploys (`workflow_dispatch`);
deleting files you didn't create; adding a dependency outside the ticket that planned it; anything
that costs money; changing design tokens or brand colors.

**Never:** bypass CI or checks (`--no-verify`, `.only`/`.skip`, weakening an assertion to pass);
read or print `.env*` (other than `.env.example`) or secrets; paste secrets into issues, PRs,
commits, or prompts; merge your own PR; force-push to `main`.

**Asking well.** One message per gate: what was done (3–6 lines), what you need decided, your
recommendation, and the exact next step if approved. Batch questions. Don't ask what the docs
already answer.

**Waiting isn't idle.** While waiting on the human, only do work that doesn't depend on their
answer. If none exists, stop and say what you're waiting on.

**Honesty about verification.** Never write "verified", "tested" or "works" unless you ran the
check in this session and can show the output. Quote totals from the actual output (passed *and*
failed), never from memory or another agent's report. Always state what you did not check.

## 3. Branching

- **Ticket work happens on a branch, in a worktree, and lands by PR.** Name it
  `feat/<area>-<short-name>`, `fix/<area>-<short-name>`, `refactor/<area>-<short-name>`,
  `test/<area>-<short-name>`, or `chore/<area>-<short-name>`.
- `<area>` matches the commit scope and the `area:*` label: `web`, `mobile`, `gateway`,
  `identity`, `send`, `contacts`, `sync`, `data`, `marketing`, `ci`.
- **Direct commits to `main` only when the product owner asks for it** for a small change. Push
  only when asked. Pushing to `main` deploys (after CI), so every commit on `main` must be shippable.
- `.worktrees/` is git-ignored and lives inside the repo, so worktrees resolve the root
  `node_modules`. Don't run `pnpm install` in a worktree unless the ticket changes dependencies.

## 4. Tickets

A ticket is one behavior, **~300 changed lines or fewer**, one branch, one PR. Bigger means split.
Tickets that run in parallel must have **disjoint `files_touched`**. The send flow already spans
`libs/hooks`, `apps/web` and `apps/mobile`, so don't add unrelated work on top. The largest
send-flow change in history (25 files) was reverted whole.

Every ticket (the **Ticket** issue template enforces this) has: context; acceptance criteria someone
who didn't see your reasoning can check; the `REQUIREMENTS.md` row(s) it moves; the constraints
(C1–C10) it touches; `files_touched`; depends-on; size; and the tests it will add.

Dependencies (`package.json`, `pnpm-lock.yaml`) change only in a ticket that says so. If a
developer needs one mid-ticket, it comments on the issue, labels `blocked`, and stops.

## 5. Working with Nx

- For navigating the workspace, invoke the `nx-workspace` skill first.
- Run tasks through Nx (`nx run`, `nx run-many`, `nx affected`), prefixed with pnpm
  (`pnpm nx test hooks`). Never a globally installed CLI.
- For scaffolding, invoke the `nx-generate` skill first. Link workspace packages with pnpm, not
  tsconfig path hacks.
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md` if it exists.
- Never guess CLI flags. Check `nx_docs` or `--help`.

## 6. Implementing

- Put code where `REQUIREMENTS.md` §6 says it goes: types in `libs/shared`, HTTP in
  `libs/api-client`, platform-agnostic hooks in `libs/hooks`, device APIs in the app that owns the
  device.
- **No silent mocks.** If a feature isn't backed by real infrastructure yet, ship it disabled with
  honest copy ("coming soon"), not a mock that fakes success. A mocked sign-up that wrote nothing
  to Convex was a real bug here.
- **Delete dead code** when you replace something. Don't leave both paths.
- Write user-facing copy last and read it aloud as the person in `REQUIREMENTS.md` §1.
- **Tests ship with the code** (§7). A ticket without tests for its new behavior isn't done.

## 7. Testing

| Layer | Tool | Where | Runs in |
|---|---|---|---|
| Unit | Vitest | `libs/*/src/**/*.spec.ts` | `pnpm test`, CI |
| Integration | Vitest + React Testing Library (web), Hono `app.request` (gateway) | `apps/web/src/**/*.spec.tsx`, `apps/gateway/src/*.spec.ts` | `pnpm test`, CI |
| E2E | Playwright + axe | `apps/web-e2e/src/*.spec.ts` | `pnpm e2e`, CI |

- Every lib/app Vitest config builds on `vitest.base.mts`, which resolves workspace packages from
  **source** (`@org/source`), so tests never run against a stale or missing `dist/`.
- Tests resolve against source but aren't typechecked yet (specs are excluded from
  `tsconfig.lib.json`); see the open `tests` issue on the board.
- Web tests get a fresh in-memory IndexedDB and empty `localStorage` per test (`apps/web/src/test-setup.ts`).
- E2E builds the web app and serves it on its own port (`4300`, override with `E2E_PORT`) and
  **never reuses** a running server, so a `pnpm dev` or another worktree's run can't be tested by
  mistake. It runs on desktop Chrome, Pixel 7, and iPhone 15 (WebKit). The person this is for is
  on a phone. `BASE_URL=<url>` runs it against a deployed site.
- Test what the user experiences: role- and label-based locators, real copy. Constraints C1–C10
  get tests where they can be checked by code (e.g. no `!` in any template, one recipient per
  `sms:` link, every gateway route rejects bad input).
- Axe is a floor, not a claim. Known, tracked failures use Playwright's `test.fail()` with the
  issue named, which turns red once fixed. `.skip` is never allowed.
- Gateway tests never call Convex or Anthropic; stub `fetch` and env.

## 8. Verifying

```sh
pnpm check            # typecheck + every unit/integration test + every build (mobile excluded)
pnpm check:affected   # same, only what your branch touched
pnpm e2e              # Playwright, when the web flow changed (first time: pnpm exec playwright install chromium webkit)
```

Then go beyond the tests where the change warrants it:

- **Convex changes:** exercise the function against the local backend (`pnpm convex:up`,
  `pnpm convex:dev`) and say what you called and what came back.
- **UI changes:** run the app (`pnpm dev`, `pnpm dev:mobile`) and walk the affected screens on a
  phone-width viewport. Type-checking is not the same as working.
- **Gateway/deploy changes:** `apps/gateway` runs the Convex CLI from its own directory under pnpm's
  strict isolation, and `CORS_ORIGINS` must match the real deployed origin exactly.
- **Mobile device-API changes:** check the `.web.ts` stub still loads. Native-only modules crash
  the web bundle on import.
- **Numbers** (contrast ratios, sizes, timings): compute them with a command you show, never
  estimate.

Report what you did not verify. "Typecheck passes; not run on a device" is useful. Silence is not.

## 9. Documenting

In the same PR as the code:

- Update `REQUIREMENTS.md` status rows the change moves.
- Update `REQUIREMENTS.md` §6 if a rule, boundary, env var, or "what this does *not* fix" changed.
  Keep it factual; describe the current state, not the history.
- Update `DATA.md` if storage shape, sync protocol, or retention changed.
- Add to `SELF_IMPROVEMENT.md` if something went wrong or surprised you. If the lesson is about
  *how to work*, promote it into this file.

## 10. Committing

Conventional commits with a scope: `feat(identity): …`, `fix(gateway): …`, `test(send): …`.

The body explains **why**, and names what the change **does not** fix when that's non-obvious.
Later readers (and agents) rely on that to avoid assuming a gap is closed. See `595e8fb` for the
house style. End with the co-author trailer when an agent wrote the change.

## 11. Pull requests

- Title mirrors the lead commit. Body from `.github/pull_request_template.md`.
- CI must be green: typecheck, unit + integration tests, build (affected), and the full e2e suite.
- `main` must always be shippable. Anything half-done ships disabled, not broken.

## 12. Definition of done

- [ ] Ticket's acceptance criteria met; requirement row exists and its status is updated
- [ ] No constraint in `REQUIREMENTS.md` §2 is violated
- [ ] Tests added for the new behavior; `pnpm check` green, re-run by the orchestrator
- [ ] UI: e2e covers the journey; a11y-auditor reviewed; axe clean (or a tracked `test.fail`)
- [ ] Behavior verified beyond tests where applicable, and gaps stated
- [ ] Copy read as a grieving user would read it. No exclamation points
- [ ] Reviewer approved; PR has "read this closely" items; CI green; human merged
- [ ] Deployed and smoke-tested; card moved to **Done**
- [ ] `REQUIREMENTS.md` §6 / `DATA.md` / this file updated if their facts changed
- [ ] `SELF_IMPROVEMENT.md` entry added if anything went wrong
