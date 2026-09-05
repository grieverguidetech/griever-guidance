<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What this is

Griever Guidance helps people who have just lost a loved one send funeral and service details to their contacts via SMS. The user is in acute grief — likely sleep-deprived, overwhelmed, and on a phone. Every product and engineering decision should be evaluated against that reality. Speed, clarity, and reliability over cleverness.

---

## Monorepo structure

```
apps/
  gateway/    Hono on Cloudflare Workers (and locally via @hono/node-server), port 3001 in dev.
              Composes libs/gateway-auth, libs/gateway-messages, libs/gateway-sync into one HTTP
              surface (CORS + routing) — this app owns no domain logic itself. Also holds the
              Convex functions (apps/gateway/convex/).
  web/        React + Vite + Tailwind. Browser send flow and account management.
  mobile/     Expo + React Native. The primary user surface — mobile-first, core RN only.
  marketing/  Astro. Public-facing site. No shared business logic.

libs/
  shared/           Source of truth for all types, interfaces, and message templates.
                    Nothing gets duplicated into apps. If it's shared, it lives here.
  api-client/       All HTTP calls to apps/gateway. Apps never call fetch directly.
  sms/              The only place that knows about Twilio. Currently mocked.
  hooks/            Shared React hooks. Zero platform-specific dependencies allowed here.
  ui-web/           Shared React + Tailwind components for web.
  data-local/       IndexedDB-backed local storage (the screen-keyed session document, outbox,
                    contacts). Browser-only — see DATA.md.
  data-sync/        The offline sync engine (outbox flush, cursor-based pull/push, merge) that
                    talks to apps/gateway, never to Convex directly. See DATA.md.
  gateway-auth/     Account creation/sign-in routes (Google, Facebook, X, email) — currently a
                    placeholder, no routes yet; this task is paused.
  gateway-messages/ Send/templates/history/obituary routes — the SMS-sending domain.
  gateway-sync/     The gateway's Convex client and the /sync/pull, /sync/push routes.

  Each gateway-* lib owns its own Hono router and business logic, with no cross-imports between
  them — apps/gateway only composes their routers together (CLAUDE.md rule 2b).
```

---

## Stack

| Layer | Tech |
|---|---|
| Mobile | Expo + React Native (core components only) |
| Web | React + Vite + Tailwind |
| Gateway | Hono on Cloudflare Workers, fronting Convex |
| Data | Convex — self-hosted via Docker locally, Convex Cloud in production (see infra/convex/README.md) |
| Marketing | Astro |
| Package manager | pnpm — never npm or yarn |
| Monorepo | Nx (task running, code generation) |

---

## Running the project

```sh
pnpm dev:gateway    # Hono via @hono/node-server, port 3001
pnpm dev:web        # Vite on port 5173
pnpm dev:mobile     # Expo
pnpm dev:marketing  # Astro
pnpm dev            # gateway + web concurrently

pnpm convex:up      # start the local Convex backend + dashboard (Docker)
pnpm convex:dev     # deploy apps/gateway/convex functions, watch for changes
```

---

## Architectural rules

**1. Types belong in libs/shared.**
Never define a type in an app that anything else might need. If it crosses a boundary, it goes in `libs/shared`.

**2. All API calls go through libs/api-client.**
Apps import from `libs/api-client` and call nothing else. No raw `fetch` in app code.

**2a. The gateway is the only thing that talks to Convex.**
`apps/web` (via `libs/data-sync`) calls `apps/gateway`'s REST endpoints, never Convex directly — no Convex client, URL, or credentials in `apps/web`. This is what makes rule 2 true for sync, not just for `/send`/`/history`/etc.

**2b. Auth, messages, and sync are separate libs — no cross-imports.**
`libs/gateway-auth`, `libs/gateway-messages`, and `libs/gateway-sync` each own their routes and business logic independently. `apps/gateway`'s only job is composing their Hono routers into one HTTP surface (CORS + routing) — domain logic never lives in `apps/gateway` itself, and one gateway-* lib never imports another.

**3. Twilio is isolated to libs/sms.**
The API calls `libs/sms`. Nothing else does. When real Twilio credentials are wired in, only `libs/sms` changes. The mock logs to console and returns a fake SID — that's intentional.

**4. hooks in libs/hooks must be platform-agnostic.**
No React Native APIs in `libs/hooks`. If a hook needs device APIs, it belongs in `apps/mobile`.

**5. The send flow state lives entirely in useSendFlow().**
No screen-level `useState` duplicating send flow logic. One hook owns it.

---

## The send flow

```
Template picker → Details form → Contact selector → Confirm → Sent
```

This is the core user journey. It is driven by `useSendFlow()` from `libs/hooks`. Any change to this flow touches `libs/hooks`, `apps/web`, and `apps/mobile`.

---

## Contacts

Read from the device on demand via `expo-contacts` (mobile) or `useMockContacts()` in development. Contact data is never stored — not in the database, not in state beyond the active send session.

---

## Database

Convex — self-hosted via Docker for local development, Convex Cloud in production (two separate
deployments; see `infra/convex/README.md`). Schema and functions live in `apps/gateway/convex/`,
identical in both. See `DATA.md` for the full data architecture (the screen-keyed local session
document, the cursor-based sync protocol, the merge rule).

Contact data is never sent to Convex — only contact *ids* appear in synced session data, never
a name or number. Message content is never stored — only rendered at send time.

---

## Environment variables

```
apps/gateway  PORT, CORS_ORIGINS, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER,
              ANTHROPIC_API_KEY, CONVEX_SELF_HOSTED_URL, CONVEX_SELF_HOSTED_ADMIN_KEY,
              CONVEX_SITE_URL                                                        (local dev)
              CORS_ORIGINS, CONVEX_DEPLOY_KEY, CONVEX_URL                            (CI/prod only)
apps/web      VITE_API_URL
apps/mobile   EXPO_PUBLIC_API_URL
```

`CORS_ORIGINS` is comma-separated allowed origins — there is no "allow all" mode; an empty value
blocks every cross-origin request (see `apps/gateway/src/worker.ts`).

Never hardcode these. Never commit `.env` files.

---

## Tone and copy

This is a grief app. All user-facing copy — templates, labels, error messages, empty states — should be calm, clear, and human. No exclamation points. No "Awesome!" or "Great job!" microcopy. When in doubt, fewer words.

---

## What not to do

- No third-party UI component libraries in `apps/mobile` (no NativeBase, React Native Paper, Tamagui, etc.) — use core RN components
- No Twilio calls outside `libs/sms`
- No shared types defined in apps
- No contact data stored anywhere — not the DB, not state, not logs
- No exclamation points in user-facing copy
- No `npm` or `yarn` — pnpm only
- No gateway routes without request body/query validation
- No cross-imports between `libs/gateway-auth`, `libs/gateway-messages`, and `libs/gateway-sync`

---

## When you're unsure

This app exists because losing someone is hard enough without also managing logistics. If a decision makes the app faster or simpler for a grieving user, it's probably right. If it adds friction or complexity for the sake of technical elegance, reconsider it.
