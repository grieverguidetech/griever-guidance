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

Griever Guidance helps people who have just lost a loved one send funeral and service details to their contacts via SMS — texted from the griever's own phone number, one contact at a time, not a bulk send from a business number. The user is in acute grief — likely sleep-deprived, overwhelmed, and on a phone. Every product and engineering decision should be evaluated against that reality. Speed, clarity, and reliability over cleverness.

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
  hooks/            Shared React hooks. Zero platform-specific dependencies allowed here.
                    Also owns the sms: deep-link builder (buildSmsLink) — see "The send flow".
  ui-web/           Shared React + Tailwind components for web.
  data-local/       IndexedDB-backed local storage (the screen-keyed session document, outbox,
                    contacts). Browser-only — see DATA.md.
  data-sync/        The offline sync engine (outbox flush, cursor-based pull/push, merge) that
                    talks to apps/gateway, never to Convex directly. See DATA.md.
  contacts/         Platform-agnostic contact-import logic shared by web and mobile: the
                    `ContactSource` adapter interface, normalize/dedupe/rank, and the
                    fetch → review → commit pipeline. Device-specific adapters (the web Contact
                    Picker, mobile's expo-contacts) live in the app that owns that device API.
  gateway-auth/     Account creation/sign-in routes (Google, Facebook, X, email) — currently a
                    placeholder, no routes yet; this task is paused.
  gateway-messages/ The AI-drafted obituary route. No message-sending logic lives server-side —
                    sending happens entirely on-device (see "The send flow").
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

**3. Messages are sent from the user's own phone, never a backend.**
There is no server-side SMS provider (no Twilio, no `libs/sms`) — a bulk send from a business number reads as impersonal for a grief app. Sending is an `sms:` deep link (`buildSmsLink()` in `libs/hooks`) that opens the device's native Messages app with one contact and the message pre-filled; the user taps Send themselves, one contact at a time. Nothing in this repo may add a backend message-sending path.

**4. hooks in libs/hooks must be platform-agnostic.**
No React Native APIs in `libs/hooks`. If a hook needs device APIs, it belongs in `apps/mobile`.

**5. The send flow state lives entirely in useSendFlow().**
No screen-level `useState` duplicating send flow logic. One hook owns it.

---

## The send flow

```
Template picker → Details form → Contact selector → Confirm → Sending → Sent
```

This is the core user journey. It is driven by `useSendFlow()` from `libs/hooks`. Any change to this flow touches `libs/hooks`, `apps/web`, and `apps/mobile`.

**Sending is one contact at a time, from the user's own number — never a bulk send, and it happens
on `apps/web` (mobile web), not the native Expo app.** The Sending step (`SendingScreen.tsx`, web
only) steps through a persisted `SendJob`'s `entries` one at a time via `useSendFlow`'s
`handOffActive()`/`confirmActive()`/`skipActive()`: "Open Messages" calls `handOffActive()` — which
**persists the loop position to `@griever/data-local`'s `sendJobStore` (IndexedDB) before returning**
— then fires an `sms:` deep link (`buildSmsLink()`) to the device's native Messages app with that
contact and the composed message pre-filled. The user taps Send there themselves — no web page or
app can send an SMS on someone's behalf, by OS design. There is no auto-advance and no inferred
delivery: the app asks once, quietly, "did that go through?" with **Yes** (confirmed, advance) /
**Not yet** (leaves it unconfirmed, advance — revisit later) / **Try again** (re-opens Messages for
the same contact, doesn't advance). `confirmed` is set *only* by that answer — never by a timer or
by the tab being backgrounded. Because the position is persisted before every handoff, force-quitting
mid-loop and relaunching resumes at the exact right person (`useSendFlow`'s own rehydration effect,
keyed by session + moment). Nothing is recorded as sent to a backend, and there is no delivery
receipt — the user's own Messages thread with that contact is the only record, which is *more*
trustworthy to a grieving person than an opaque "delivered ✓" from a service they've never heard of.
The app itself keeps no history of message content (see "What not to do") — only which `contactId`s
were actually confirmed, for the "you told N people" summary and the widening-circle dedup.

**The widening circle (the obituary path) is a single broadcast via `navigator.share()`, not a
per-contact loop.** `ConfirmScreen.tsx`'s obituary branch calls `navigator.share({ text })`
synchronously from the button's own click (no `await` before it — the API throws otherwise), falling
back to `navigator.clipboard.writeText()` with a plain "Copied" confirmation where `navigator.share`
doesn't exist (desktop, some browsers). An `AbortError` means the user dismissed the share sheet —
swallow it, don't show an error, don't change state. There is no separate composer for the share
text; it's the same `composeMessage()` used everywhere else, and the obituary link is already
inlined into that text by the template, so it is never passed a second time as `navigator.share`'s
`url` field. On desktop (or anywhere `sms:` handoff isn't plausible — see `smsHandoffPlausible()` in
`libs/hooks`), the Sending screen shows "open this on your phone" instead of a dead or disabled
button; nothing about the flow up to that point requires a phone.

---

## Contacts

Read from the device on demand — `expo-contacts` on mobile (`apps/mobile/src/lib/expoContactsSource.native.ts`;
`.web.ts` is a no-op stub, since expo-contacts has no web implementation and importing it there
crashes on load), the Contact Picker API on Android Chrome web, manual entry everywhere else
(`libs/contacts`, shared adapter logic behind the `ContactSource` interface). Never *raw* provider
data — only 6 fields survive past the picker/import screen: `contactId`, `name`, `phone`, `email`,
`tier`, `source` (see `Contact` in `libs/shared`).

Contacts are persisted on-device only (IndexedDB on web via `libs/data-local`, AsyncStorage on
mobile via `apps/mobile/src/lib/contactStore.ts` — same `ContactStore` interface, so `useContacts`
is shared) — never sent to Convex, never to the gateway. They are **not** kept forever: the saved
list is cleared 30 days after the latest known service date (`CONTACT_RETENTION_DAYS` in
`libs/hooks/src/useSessions.ts`), on the theory the family may want to reuse it right up until the
service is behind them, but has no reason to once it is. No service date yet set → no expiry
computed → contacts are kept. Mobile has no multi-session model yet, so it anchors this to a single
stored date rather than a list of sessions (see `apps/mobile/src/lib/contactRetention.ts`).

---

## Database

Convex — self-hosted via Docker for local development, Convex Cloud in production (two separate
deployments; see `infra/convex/README.md`). Schema and functions live in `apps/gateway/convex/`,
identical in both. See `DATA.md` for the full data architecture (the screen-keyed local session
document, the cursor-based sync protocol, the merge rule).

Contact data is never sent to Convex — only contact *ids* appear in synced session data, never
a name or number. Message content is never stored anywhere, by anything — not Convex, not a send
history, not a log — only composed client-side and handed to the device's own Messages app at
send time (see "The send flow").

---

## Environment variables

```
apps/gateway  PORT, CORS_ORIGINS, ANTHROPIC_API_KEY, CONVEX_SELF_HOSTED_URL,
              CONVEX_SELF_HOSTED_ADMIN_KEY, CONVEX_SITE_URL                          (local dev)
              CORS_ORIGINS, CONVEX_DEPLOY_KEY, CONVEX_URL                           (CI/prod only)
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
- No backend SMS-sending path (no Twilio, no `libs/sms`, no server-side send route) — see rule 3
- No shared types defined in apps
- No contact data reaches the gateway or Convex — on-device storage only (see "Contacts"), and never more than the 6 named `Contact` fields
- No raw provider payload (photo, provider ID, labels, etc.) kept past the picker/import screen — normalize down to the 6 `Contact` fields immediately
- No message content stored anywhere — not the DB, not state, not logs, not a send history; nothing to view or restore once sent (the user's own Messages app is the only record)
- No claiming, implying, or inferring delivery — `confirmed` is set only by the user answering "did that go through?", never by a timer, by backgrounding, or by `navigator.share()` resolving for a specific recipient (it can't — it's a broadcast)
- No `sms:` link with more than one recipient in it
- No exclamation points in user-facing copy
- No `npm` or `yarn` — pnpm only
- No gateway routes without request body/query validation
- No cross-imports between `libs/gateway-auth`, `libs/gateway-messages`, and `libs/gateway-sync`

---

## When you're unsure

This app exists because losing someone is hard enough without also managing logistics. If a decision makes the app faster or simpler for a grieving user, it's probably right. If it adds friction or complexity for the sake of technical elegance, reconsider it.
