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
