# Self-improvement log

A running record of mistakes, surprises, and corrections — so the same one isn't made twice. Agents
read this before starting work (see `PROCESS.md`) and append to it before finishing.

## How to use this file

**Add an entry when:** a change was reverted; a fix was needed for something just shipped; a
reviewer or the product owner corrected an approach; an assumption about a platform/API turned out
wrong; or you lost meaningful time to something the next person could skip.

**Entry format:**

```
### YYYY-MM-DD — <short title>
- **What happened:** facts, with commit hashes or file paths.
- **Why:** the root cause, not the symptom.
- **Rule:** the one-line behavior change that prevents it.
```

**Promote, then prune.** When a rule has proven itself (it came up twice, or it's clearly
load-bearing), move it into `PROCESS.md` (how to work) or `REQUIREMENTS.md` §6 (what the code must
do) as a standing rule and mark the entry **Promoted → <file>**. Delete entries that turn out to be wrong. This file should stay short enough
to read in a minute; it is a staging area, not an archive.

---

## Entries

### 2026-09 — Explicit send confirmation was built, then reverted
- **What happened:** `1d72239` replaced the auto-advance/undo send loop with a persisted handoff
  log and a Yes / Not yet / Try again prompt per contact, across 25 files. Reverted in `039e459`.
- **Why:** it asked the user to confirm every person in a potentially long list — friction the
  product deliberately avoids — and persisted send state the rules say not to keep. It also
  bundled an unrelated share-sheet change, so the whole thing had to go at once.
- **Rule:** before changing the send flow, re-read "The send flow" in `REQUIREMENTS.md` §6 and ask
  whether the change adds a question to a grieving user. Keep send-flow PRs to one behavior.

### 2026-09 — Silent mocks hid a real gap
- **What happened:** `useAccount` faked sign-up entirely client-side; users "signed up" and nothing
  reached Convex. Fixed in `595e8fb`, which also shows Google/X disabled rather than mocked.
- **Why:** a mock that returns success is indistinguishable from the real thing in the UI.
- **Rule:** unbacked features ship disabled with honest copy, never as a succeeding mock.

### 2026-09 — Moving a dependency broke deploys
- **What happened:** the gateway split (`f4fbfe6`) moved the Convex SDK into `libs/gateway-sync`,
  and `convex` stopped resolving in `apps/gateway`, where the Convex CLI runs. Fixed in `9491e05`.
- **Why:** pnpm's strict isolation — a binary is only available where it's a direct dependency.
- **Rule:** when moving a dependency between packages, check every script and CLI that runs with
  `cwd` in the old package.

### 2026-09 — Deployed origin didn't match CORS_ORIGINS
- **What happened:** Cloudflare Pages appended a random suffix to the domain, so every request
  from the deployed site was blocked. Fixed in `eb925a2`.
- **Why:** the origin was assumed from the project name instead of read from the deployment.
- **Rule:** take origins and URLs from the actual deployment, never infer them.

### 2026-09 — Native-only modules crash the web bundle
- **What happened:** `expo-contacts` has no web implementation; importing it on web crashes on
  load, hence `expoContactsSource.web.ts` as a no-op stub.
- **Rule:** any native-only module in `apps/mobile` gets a `.native.ts` / `.web.ts` split, and the
  web stub is checked when the native file changes.

### 2026-09 — Meta platform capabilities are commonly misremembered
- **What happened:** friends-list access and personal DMs via Facebook/Instagram were proposed more
  than once; both are impossible for personal accounts, confirmed twice against Meta's docs.
- **Rule:** verify a platform capability in current official docs before building on it, and
  record what was checked in the commit body.

### 2026-10-03 — The e2e suite was a dead scaffold, and CI never ran tests
- **What happened:** `apps/web-e2e` still held the Nx generator's example (expects an `h1`
  containing "Welcome", on port 4200, while the app serves 5173). CI ran only typecheck and build,
  so neither the 4 Vitest suites nor e2e ever gated a merge. Replaced in `feat/ci-agentic-dev-setup`.
- **Why:** generated scaffolds look like coverage. Nothing failed, because nothing ran them.
- **Rule:** a test that isn't run by CI doesn't exist. Every new test target must show up in a CI
  run before the PR that adds it merges.

### 2026-10-03 — Lib tests resolved to stale `dist/`, and would fail on a clean checkout
- **What happened:** inferred `test` targets don't depend on `^build`, so a spec importing
  `@griever/shared` loaded `dist/`. With `dist/` removed, `data-sync`'s suite failed:
  `Failed to resolve entry for package "@griever/shared"`. Locally it silently tested whatever was
  last built.
- **Why:** the `@org/source` export condition (which points at `src/`) was set for TypeScript but
  not for Vite/Vitest.
- **Rule:** every Vitest config extends `vitest.base.mts`. **Promoted → AGENTS.md "Known gotchas".**

### 2026-10-03 — Deploy didn't wait for CI
- **What happened:** `ci.yml` and `deploy.yml` both triggered on push to `main` and started at the
  same second (`gh run list`), so a red CI never stopped a deploy.
- **Rule:** deploy runs on `workflow_run` of CI with `conclusion == success` and checks out the
  exact SHA CI tested. **Promoted → PROCESS.md §1 "Deploy → Verify".**

### 2026-10-03 — A new test found a latent header bug in `apiFetch`
- **What happened:** `libs/api-client`'s `apiFetch` spread `...init` after its merged `headers`,
  so a caller passing `headers` dropped `Content-Type`. No caller hit it yet. A test reproduced it
  (1 failed), then the fix passed (6/6).
- **Rule:** when spreading options over defaults, spread the caller's object first and the merged
  fields last, and pin it with a test.

### 2026-10-03 — Helper text and the brand accent fail WCAG AA contrast
- **What happened:** axe flagged `--text-muted` at 4.24:1 on `--color-bg` (AA needs 4.5:1).
  Raising the mix from 60% to 65% gives 4.95:1 (computed, `PROCESS.md` §8). The brand accent
  `#0088b0` (3.65:1 on primary buttons and links), `--text-eyebrow` (2.74:1) and `.gg-reassure`
  (3.16:1) also fail. Those are design decisions, tracked on the board, with a `test.fail()` in
  `apps/web-e2e/src/a11y.spec.ts` that turns red once fixed.
- **Rule:** colour tokens get a computed contrast ratio against every background they sit on,
  before they ship.

### 2026-10-03 — Accessible names hid state on custom toggles
- **What happened:** "One of the people who should hear first" (AddContactsManual) and each row of
  WhoHearsFirst are `<label onClick={preventDefault}>` with an icon, not checkboxes, so assistive
  tech hears plain text with no checked state. Tracked on the board.
- **Rule:** a toggle is a `<button aria-pressed>` or a real `<input type="checkbox">`. Never a
  label with `preventDefault`. The a11y-auditor checks for this pattern.

### 2026-10-04 — First multi-agent run: process gaps (#9, #10, #15)
- **What happened:** worktrees had no per-package `node_modules` (PROCESS.md said they resolved the
  root's); a `--skip-nx-cache`-only check hid that Nx's typecheck cache ignored spec files, and the
  reviewer caught it; hand-backs came back empty or "placeholder"; the e2e summary showed
  "1 failed" with no detail, twice; #15 merged with red CI and turned `main` red (fixed in #16; the
  deploy gate held); agents left Nx daemons and servers running; a newly created `.claude/agents/`
  wasn't loaded until the next session.
- **Why:** the worktree note was written for npm; checks were run one way; red CI had no visible marker; hand-backs came back empty because nothing required a report and a placeholder looked like one; subagents weren't loaded because role files are read once at session start.
- **Rule:** install in every new worktree; run one cached check; an empty hand-back is not done;
  CI prints failure detail; red-CI PRs are drafts; agents stop daemons and servers; dispatch new
  roles as general-purpose agents in the session that creates them. **Promoted → PROCESS.md §1, §3, §7; AGENTS.md "Known gotchas".**

### 2026-10-11 — Stubbed tests passed; the PostgREST upsert failed live (#29, #27)
- **What happened:** #29's upsert passed every stubbed unit test, then failed live with
  `403 42501` against #27's column grants.
- **Why:** `ON CONFLICT DO UPDATE` sets every payload column, including `id`, which the grants
  don't allow. A stub can't see grants.
- **Rule:** code that calls Supabase/PostgREST gets one local run against the real migrations
  (`supabase start --workdir infra`, minimal services) before review; the PR quotes the output.
  **Promoted → PROCESS.md §8.**

### 2026-10-11 — Guards could be deleted without failing any test
- **What happened:** several times a developer's tests passed while the guard under test could be
  removed with nothing failing. The orchestrator caught it by mutating the guard.
- **Why:** the tests exercised the happy path, not the guard.
- **Rule:** for safety guards (C5 sign-out paths, RLS, contrast, account binding), the orchestrator
  mutates the guard once and confirms a test fails; the PR quotes it.
  **Promoted → PROCESS.md "Independent check".**

### 2026-10-11 — zsh doesn't word-split; a loop made a bad worktree and branch
- **What happened:** a loop using `set -- $x` created a worktree at a path containing a space and a
  local branch literally named `origin/main`. Both were removed.
- **Why:** bash splits unquoted variables; zsh doesn't.
- **Rule:** in zsh, don't rely on word splitting; use `${x%%:*}` / `${x#*:}` or one explicit command
  per worktree. **Promoted → PROCESS.md "Build".**

### 2026-10-11 — "Merged" was reported for PRs that weren't (#40, #41, #42)
- **What happened:** three times the human said a PR was merged when it was still open.
- **Rule:** confirm `gh pr view N --json state` is `MERGED` before removing worktrees or moving
  cards. **Promoted → PROCESS.md "PR (G2)".**

### 2026-10-11 — `SUPABASE_ACCESS_TOKEN` was set to a non-PAT value, twice
- **What happened:** every gateway deploy failed with "Invalid access token format".
- **Why:** the request for the secret didn't say what format it must have.
- **Rule:** when asking the human for a secret, state the exact format or prefix (e.g. an `sbp_`
  personal access token from Account → Access Tokens) and give a local check (`supabase login`)
  before setting it. **Promoted → PROCESS.md §2.**

### 2026-10-11 — Mobile dependencies declared as `"*"` drifted
- **What happened:** React 19.2.6 against React Native's 19.1.0 renderer, and expo-contacts 57 code
  on SDK 54, hid a startup crash and a contacts API break.
- **Why:** `"*"` resolves to whatever is latest, not what the SDK supports.
- **Rule:** pin Expo/RN dependencies to the SDK's `bundledNativeModules` versions; never `"*"`.
  **Promoted → PROCESS.md §8.**

### 2026-10-11 — A hand-rolled `nx affected -t build` "failed" on mobile's EAS target
- **What happened:** the orchestrator's `nx affected -t build` reported a failure that was mobile's
  EAS build target, which `check:affected` deliberately excludes.
- **Rule:** use the repo's `pnpm check:affected`, not hand-rolled nx commands, for the independent
  check. **Promoted → PROCESS.md "Independent check".**

### 2026-10-18 — An icon barrel import made web:test flaky under load (#152)
- **What happened:** Nx flagged `web:test` as flaky twice. Whole-App specs hit Vitest's 5 s
  timeout when other work was running. With three suites running at once, 2–4 tests failed per
  run; the suite spent about 270 s importing modules.
- **Why:** screens imported icons from `@phosphor-icons/react`, whose root loads about 3,000
  modules. Every spec file that renders a screen paid about 2 s of CPU for that, so the specs
  fought each other for the CPU and the journeys ran slow.
- **Rule:** import Phosphor icons by path (`@phosphor-icons/react/CheckCircle`), never from the
  package root. `apps/web/src/iconImports.spec.ts` fails if a root import comes back. When a spec
  is slow, look at the import time in Vitest's summary before touching timeouts.

### 2026-10-19 — A new e2e test reloaded before IndexedDB finished writing (#176)
- **What happened:** "ticks stay after a reload" was flaky on desktop and phone Chrome in PR #179.
  The tick was on screen, but the saved value was missing after the reload.
- **Why:** the test reloaded right after the on-screen check. The IndexedDB write was still in
  flight, and on a slow runner the reload cut it off.
- **Rule:** an e2e test that reloads to prove persistence waits on the stored value first
  (`expect.poll` on IndexedDB/localStorage), never on the UI alone and never on a fixed sleep.

### 2026-10-19 — Two PRs sharing a hook contract merged without the planned rebase (#178, #179)
- **What happened:** #179 changed `libs/hooks` step order, and #178's mobile wrapper depended on
  it. Both PR bodies said "whichever merges second must be rebased", but both merged within a
  minute, so the first CI run on the combined code was `main` (it passed).
- **Why:** the merge-order note was advice in the PR body, not something the order of events enforced.
- **Rule:** when two open PRs touch the same contract, keep the second one in draft until the
  first is merged, then rebase it and mark it ready. Don't hand the human both as mergeable at once.

### 2026-10-19 — `SUPABASE_ACCESS_TOKEN` was rejected again, this time as invalid (#180)
- **What happened:** the gateway deploy for `515a7ee` failed at `supabase link` with "Invalid
  access token". The same secret worked for the 2026-10-18 deploy, so it was revoked or expired
  between deploys. Web and Marketing deployed; the smoke test was skipped.
- **Why:** nothing checks the token before a deploy needs it, so a dead token surfaces only on a
  merge to `main`.
- **Rule:** when a deploy fails at `supabase link`, check the token first (§2 "Asking for a
  secret"), and quote which jobs did deploy. The live gateway stays on the last good build until
  the job is re-run.
