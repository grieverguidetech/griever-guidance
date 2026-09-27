# Process — how work gets done here

This is the working loop for anyone changing this repo, human or agent, and the entry point
`CLAUDE.md` → `AGENTS.md` → here. Read in this order:

1. **This file** — the order you do things in.
2. **`REQUIREMENTS.md`** — what must be true (§1–§5) and the architecture and rules that keep it
   true (§6). Treat §2 and §6 as binding.
3. **`SELF_IMPROVEMENT.md`** — mistakes already made here, so you don't repeat them.
4. **`DATA.md`** — when the work touches storage, sync, sessions, or Convex.

**Keep this file current.** When you learn something that changes how work should be done here,
update this file (via `SELF_IMPROVEMENT.md`'s promote step) in the same PR.

---

## 1. Before writing code

1. **Read the rules that apply.** `REQUIREMENTS.md` §2 and §6 always. `DATA.md` if the
   change touches storage, sync, sessions, or Convex. The relevant `design_specs/` handoff if the change touches a screen.
2. **Find the requirement.** Locate the row in `REQUIREMENTS.md` this work moves. If there isn't
   one, the work may not be wanted — ask, or add the row as part of the change.
3. **Check it hasn't already been decided against.** Search `git log` and `SELF_IMPROVEMENT.md` for
   the area. Several ideas in this repo were built, weighed, and reverted on purpose (e.g. explicit
   per-contact send confirmation, `039e459`). Don't rebuild them without a new reason.
4. **Verify external platform claims before building on them.** Facebook/Instagram/Apple/Google
   API capabilities change and are frequently misremembered. Check current official documentation
   and say in the commit what you checked. A feature that only works "sometimes" is worse than no
   feature for this user.
5. **Scope it small.** One behavior per PR. Changes to the send flow already span `libs/hooks`,
   `apps/web`, and `apps/mobile` — don't add unrelated work on top. The largest send-flow change in
   history (25 files) was reverted whole.

## 2. Working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

### Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

### When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

## 3. Branching

- Never commit directly to `main`. Branch as `feat/<area>-<short-name>`, `fix/<area>-<short-name>`,
  or `refactor/<area>-<short-name>`.
- `<area>` matches the commit scope: `web`, `mobile`, `gateway`, `identity`, `send`, `contacts`,
  `sync`, `data`, `marketing`, `ci`.

## 4. Implementing

- Put code where `REQUIREMENTS.md` §6 says it goes: types in `libs/shared`, HTTP in `libs/api-client`,
  platform-agnostic hooks in `libs/hooks`, device APIs in the app that owns the device.
- Use Nx generators for new projects (`nx-generate` skill); link workspace packages with pnpm, not
  tsconfig path hacks.
- **No silent mocks.** If a feature isn't backed by real infrastructure yet, show it disabled with
  honest copy ("coming soon"), don't fake success. A mocked sign-up that wrote nothing to Convex
  was a real bug here.
- **Delete dead code** when you replace something (`useAccount` → `useIdentity` deleted both the
  hook and its now-unused type). Don't leave both paths.
- Write user-facing copy last and read it aloud as the person in §1 of `REQUIREMENTS.md`.

## 5. Verifying

Run through Nx, prefixed with pnpm:

```sh
pnpm nx affected -t typecheck        # what CI gates on
pnpm nx affected -t test
pnpm nx affected -t build --exclude=mobile   # mobile:build needs EAS; CI excludes it too
pnpm nx run web-e2e:e2e                      # when the web flow changed
```

Then go beyond the tests where the change warrants it:

- **Convex changes:** exercise the function against the local backend (`pnpm convex:up`,
  `pnpm convex:dev`) and say what you called and what came back.
- **UI changes:** run the app (`pnpm dev`, `pnpm dev:mobile`) and walk the affected screens on a
  phone-width viewport. Type-checking is not the same as working.
- **Gateway/deploy changes:** remember `apps/gateway` runs the Convex CLI from its own directory
  under pnpm's strict isolation, and `CORS_ORIGINS` must match the real deployed origin exactly.
- **Mobile device-API changes:** check the `.web.ts` stub still loads — native-only modules crash
  the web bundle on import.

Report what you did not verify. "Typecheck passes; not run on a device" is useful. Silence is not.

## 6. Documenting

In the same PR as the code:

- Update `REQUIREMENTS.md` status rows the change moves.
- Update `REQUIREMENTS.md` §6 if a rule, boundary, env var, or "what this does *not* fix" changed. Keep it
  factual; describe the current state, not the history.
- Update `DATA.md` if storage shape, sync protocol, or retention changed.
- Add to `SELF_IMPROVEMENT.md` if something went wrong or surprised you (see that file). If the lesson is about *how to work*, promote it into
  this file.

## 7. Committing

Conventional commits with a scope: `feat(identity): …`, `fix(gateway): …`, `refactor(send): …`.

The body explains **why**, and explicitly names what the change **does not** fix when that's
non-obvious — later readers (and agents) rely on that to avoid assuming a gap is closed. See
`595e8fb` for the house style. End with the co-author trailer when an agent wrote the change.

## 8. Pull requests

- Title mirrors the lead commit. Body: what changed, why, how it was verified, what's still open.
- CI (`.github/workflows/ci.yml`) runs affected typecheck and build. Both must pass.
- Merges to `main` deploy (`.github/workflows/deploy.yml`), so `main` must always be shippable.
  Anything half-done ships disabled, not broken.

## 9. Definition of done

- [ ] Requirement row exists and its status is updated
- [ ] No constraint in `REQUIREMENTS.md` §2 is violated
- [ ] Typecheck, tests, and build pass through Nx
- [ ] Behavior verified beyond tests where applicable, and gaps stated
- [ ] Copy read as a grieving user would read it — no exclamation points
- [ ] `REQUIREMENTS.md` §6 / `DATA.md` / this file updated if their facts changed
- [ ] `SELF_IMPROVEMENT.md` entry added if anything went wrong
