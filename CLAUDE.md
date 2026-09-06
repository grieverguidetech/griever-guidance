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
              Composes libs/identity, libs/gateway-messages, libs/gateway-sync into one HTTP
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
  identity/         Sign-up/sign-in (Facebook, Instagram, and — once built — Google/X/email) and
                    the session bearer token. Owns its own Hono router, mounted by apps/gateway.
                    See "Identity" below — this is who a user is, never their friends or contacts.
  gateway-messages/ The AI-drafted obituary route. No message-sending logic lives server-side —
                    sending happens entirely on-device (see "The send flow").
  gateway-sync/     The gateway's Convex client and the /sync/pull, /sync/push routes.

  identity, gateway-messages, and gateway-sync each own their own Hono router and business logic,
  with no cross-imports between them — apps/gateway only composes their routers together
  (CLAUDE.md rule 2b).
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

**2b. Identity, messages, and sync are separate libs — no cross-imports.**
`libs/identity`, `libs/gateway-messages`, and `libs/gateway-sync` each own their routes and business logic independently. `apps/gateway`'s only job is composing their Hono routers into one HTTP surface (CORS + routing) — domain logic never lives in `apps/gateway` itself, and none of the three ever imports another (each keeps its own tiny Convex client rather than sharing one).

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

**Sending is one contact at a time, from the user's own number — never a bulk send.** The Sending
step steps through `selectedContactIds` one at a time: "Open Messages" fires an `sms:` deep link
(`buildSmsLink()`) to the device's native Messages app with that contact and the composed message
pre-filled; the user taps Send there themselves — no web page or app can send an SMS on someone's
behalf, by OS design. Returning to the app (detected via the Page Visibility API on web, `AppState`
on mobile) assumes it went through and auto-advances to the next contact after a short undo window,
rather than asking "did that send?" for every person in what could be a long list. Nothing is
recorded as sent to a backend, and there is no delivery receipt — the user's own Messages thread
with that contact is the only record, which is *more* trustworthy to a grieving person than an
opaque "delivered ✓" from a service they've never heard of. The app itself keeps no history of what
was sent (see "What not to do").

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

## Identity

Sign-up/sign-in lives in `libs/identity`, mounted by `apps/gateway` (`GET/POST /auth/*`) — it is
the only lib that ever writes to Convex's `identities` table, and the only thing in this repo that
talks to Facebook's or Instagram's OAuth endpoints. It answers exactly one question — **who is
this** — and nothing else:

- **Facebook Login** (`public_profile` + `email`, no app review needed) and **Instagram's
  "Business Login for Instagram"** (a separate app/credential pair; Instagram accounts must be
  Business or Creator — personal accounts have had no login API since Basic Display's Dec-2024
  shutdown, and Instagram never supplies an email address, by platform limitation).
- The OAuth `state` param and the session itself are both short signed tokens
  (`libs/identity/src/token.ts`, HMAC-SHA256, no JWT library) — not cookies, since the gateway and
  `apps/web` are different origins and a cross-site cookie would need `SameSite=None; Secure`,
  which breaks on plain-HTTP local dev. The session token comes back to the browser in the
  callback redirect's URL fragment (`#token=…`, never a query string, so it never reaches server
  logs) and the client sends it back as `Authorization: Bearer <token>`.
- `/auth/:provider/start` only ever redirects to a `redirectTo` matching `CORS_ORIGINS` — an
  unchecked redirect target is a real vector for leaking someone's session token to another site
  (see `libs/identity/src/router.ts`'s `isAllowedRedirect`).
- Email/password (`POST /auth/password/signup` / `/signin`) is real too, not mocked — passwords are
  hashed server-side (PBKDF2-SHA256, `libs/identity/src/password.ts`) before Convex ever sees them,
  and sign-in returns the same generic "Incorrect email or password." whether the email doesn't
  exist or the password is wrong, so a failed attempt never confirms which one.
- `apps/web`'s `useIdentity` hook (`libs/hooks`) is the real thing now — it replaced `useAccount`
  (deleted, along with the `Account` type it was the only user of). Signing in via
  Facebook/Instagram is a full-page redirect (there's no popup/iframe flow), so the callback's
  `#token=…` fragment is consumed once at boot (`apps/web/src/app/app.tsx`) rather than through any
  client-side routing.
- **This does not, by itself, make `/sync/pull`/`/sync/push` work in production.** Those routes
  still authenticate via `convex/auth.ts`'s `requireUser` dev stub (`GG_DEV_AUTH`), a separate,
  older mechanism from this session's Bearer token — `apps/web/src/lib/registerSync.ts`'s
  `setSyncUserId` feeds the real signed-in `userId` into that stub's `x-gg-user` header (correct in
  local dev, where `GG_DEV_AUTH=1`), but a real deployment never sets `GG_DEV_AUTH` (enforced by
  `scripts/check-dev-auth.mjs`), so `requireUser` still throws there regardless of who's signed in.
  Verifying the real session token server-side and replacing the stub with it is separate,
  not-yet-done work. Separately, nothing in `apps/web`'s actual send flow (`useSessions`,
  `useSendFlow`) writes into `libs/data-local`'s screen-keyed store yet, so even where sync *can*
  authenticate, the outbox it would flush is currently always empty — see DATA.md for the intended
  shape; wiring the two together is its own task, not started.

**Identity data and app-state data are two separate Convex tables, joined by `userId`** —
`identities` (authProvider, providerSub, email, emailVerified — nothing else) and `profiles`
(senderName, contactSource, checklistTicks). `sessions.userId` is a second foreign key onto the
same `identities.userId`. Nothing but `libs/identity`'s Convex functions
(`apps/gateway/convex/identity.ts`) may read or write `identities`/`profiles` directly — everything
else in this repo reaches a user only by their opaque `userId`.

**What Facebook/Instagram sign-in is not, and cannot become:** it does not, and cannot, give this
app a friends list or a way to message someone's contacts. Facebook's `user_friends` permission
only ever returns friends who *also* use this app and have separately granted it — never a
person's real friend list. Neither platform has an API for a personal account to DM another
personal account without that mechanism first requiring a Page/Business identity and the recipient
messaging first. Verify before disagreeing — this has been checked twice against current Meta
documentation. Sign-in with Facebook or Instagram is identity only; reaching a person's contacts is
still the device/manual/Share-sheet path described under "Contacts" and "The send flow" — the two
never merge.

`apps/web`'s `SignUp`/`CreateAccount` screens call the real `/auth/*` flow via `useIdentity` — see
the bullets above. Google and X are still shown, disabled ("coming soon"): no backend exists for
either, and leaving them silently mocked (as Facebook/Instagram/password used to be) would recreate
the exact "signed up, nothing in Convex" gap this replaced.

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
              CONVEX_SELF_HOSTED_ADMIN_KEY, CONVEX_SITE_URL,
              FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET,
              GATEWAY_BASE_URL, IDENTITY_SESSION_SECRET, IDENTITY_SERVICE_SECRET (local dev)
              CORS_ORIGINS, CONVEX_DEPLOY_KEY, CONVEX_URL                           (CI/prod only)
apps/web      VITE_API_URL
apps/mobile   EXPO_PUBLIC_API_URL

Convex (set via `npx convex env set`, never a `.env` file — see infra/convex/README.md)
              IDENTITY_SERVICE_SECRET  (must match apps/gateway's value exactly)
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
- No exclamation points in user-facing copy
- No `npm` or `yarn` — pnpm only
- No gateway routes without request body/query validation
- No cross-imports between `libs/identity`, `libs/gateway-messages`, and `libs/gateway-sync`
- No friends-list or peer-to-peer DM API calls to Facebook or Instagram — see "Identity"; neither platform allows either for a personal contact, regardless of OAuth

---

## When you're unsure

This app exists because losing someone is hard enough without also managing logistics. If a decision makes the app faster or simpler for a grieving user, it's probably right. If it adds friction or complexity for the sake of technical elegance, reconsider it.
