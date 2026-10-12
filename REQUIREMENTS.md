# Requirements — Grievers Guidance

What the product must do, what it must never do, and where each requirement stands today.
§1–§5 are the checklist of *what has to be true*; §6 is the architecture and the standing rules
that keep it true; `DATA.md` explains *where data lives*; `PROCESS.md` explains how to change any
of it. When a requirement's status changes, update its row in
the same PR that changes it.

Status key: **Done** · **Partial** · **Not started** · **Open** (needs a product decision)

---

## 1. Who this is for

Someone who has just lost a loved one and needs to tell people when and where the service is. They
are sleep-deprived, overwhelmed, on a phone, and afraid of forgetting something. Their dominant
question is *"what am I forgetting"* — the product's job is to show one next thing and make
everything else visibly not-yet-their-problem.

Every requirement below is subordinate to that. If a requirement makes the app slower or more
confusing for that person, the requirement is wrong.

---

## 2. Non-negotiable constraints

These are not features; breaking one is a defect regardless of what it enables.

| # | Constraint | Source |
|---|---|---|
| C1 | Messages are sent from the user's own phone via an `sms:` deep link, one contact at a time. No backend SMS path, no bulk send, no business number. | §6 rule 3 |
| C2 | Message content is never stored — not Convex, not local state after send, not logs, not a history. | §6 "What not to do" |
| C3 | Contact data never reaches the gateway or Convex. Only contact *ids* appear in synced session data. | §6 "Contacts" |
| C4 | Only the 7 `Contact` fields (`contactId`, `name`, `phone`, `email`, `tier`, `source`, `createdAt`) survive past the import screen. `createdAt` is a timestamp, not personal data. | §6 "Contacts" |
| C5 | Offline-first: nothing after sign-up may block on a network round-trip. The device is authoritative. | DATA.md posture |
| C6 | Sign-in (email today, Facebook later) is identity only — never a friends list, never a DM path. | §6 "Identity" |
| C7 | All user-facing copy is calm and plain. No exclamation points, no celebratory microcopy. | §6 "Tone and copy" |
| C8 | Every gateway route validates its request body/query. | §6 "What not to do" |
| C9 | Deletion is never offered inside a flow or as a swipe action — only in settings. | DATA.md §7 |
| C10 | The product never implies an order to funeral planning other than the real one: pronouncement → custody → burial/cremation → service → obituary → broader public announcement. Telling close family and friends first, one at a time from the user's own phone (the app's "Announce the passing" step), is not that public announcement and can happen at any point. Never ask for an obituary link during setup. | design_specs README |

---

## 3. Functional requirements

### 3.1 Account & identity (Flow D)

**All of this is hidden behind `VITE_FEATURE_AUTH` (apps/web) and `EXPO_PUBLIC_FEATURE_AUTH`
(apps/mobile) until the app has users** (off by default; see "Identity" in §6). The statuses below describe the code, not what users see.

| ID | Requirement | Web | Mobile | Notes |
|---|---|---|---|---|
| ID-1 | Sign up / sign in with Facebook | Not started | Not started | Planned later (#36); the old Convex-backed path is removed |
| ID-2 | Sign up / sign in with Instagram | Dropped | Dropped | Personal IG accounts have no login API; Business/Creator only, and no email |
| ID-3 | Email/password sign-up and sign-in on Supabase Auth, non-enumerating errors | Done (flag on only) | Done (flag on only) | `@griever/api-client/auth`, `useSupabaseIdentity`; passwords never reach the gateway |
| ID-4 | Google sign-in | Not started | Not started | Shown disabled, "coming soon" |
| ID-5 | X sign-in | Not started | Not started | Shown disabled, "coming soon" |
| ID-6 | Session token verified server-side on `/sync/*`, replacing the `GG_DEV_AUTH` stub | Superseded | — | The session is now a Supabase JWT (`supabaseAuth` verifies it for `/me/*`); applying it to `/sync/*` is #20/#39. Blocks production sync |
| ID-7 | Account before session — sign-up needs a connection; everything after works offline | Done (flag on only) | Partial | DATA.md "Settled"; suspended while auth is flagged off |

### 3.2 Contacts (Flow D)

| ID | Requirement | Web | Mobile | Notes |
|---|---|---|---|---|
| CT-1 | Import from device contacts | Partial (Android Chrome Contact Picker only) | Done (`expo-contacts`) | |
| CT-2 | Manual contact entry | Done | Partial | Fallback everywhere |
| CT-3 | Normalize, dedupe, and rank imported contacts | Done | Done | `libs/contacts` |
| CT-4 | Contacts stored on-device only | Done (IndexedDB) | Done (AsyncStorage) | Shared `ContactStore` interface |
| CT-5 | Clear saved contacts 30 days after the latest known service date; keep them if no date is set | Done | Done (single-date anchor) | `CONTACT_RETENTION_DAYS` |
| CT-6 | A device with no contacts does not restore a session | Partial | Not started | DATA.md §2 |

### 3.3 Session & guided path (Flow C, L3)

| ID | Requirement | Web | Mobile | Notes |
|---|---|---|---|---|
| SE-1 | Ask for the deceased person's details once per session; every flow reads from it | Done | Partial | Mobile: each person's name and date are kept as a session; templates still ask for the name on their own form |
| SE-2 | Sessions survive app close and restore on relaunch; landing offers "continue" first | Done | Partial | Mobile restores people and the open one from AsyncStorage; no "continue" prompt yet |
| SE-3 | Multiple sessions ("Someone else I've lost") | Done | Done | Mobile: on-device only (#20); no delete (C9); no server sync yet |
| SE-4 | Guided path landing (C1) ordered around the real planning sequence | Done | Not started | |
| SE-5 | Checklist ticks persist silently per *account* | Partial | Not started | `profiles.checklistTicks` |

### 3.4 Send flow (Flows A & B)

| ID | Requirement | Web | Mobile | Notes |
|---|---|---|---|---|
| SF-1 | Template picker → Details → Contacts → Confirm → Sending → Sent, driven by `useSendFlow()` | Done | Done | |
| SF-2 | Close family hears first, from a small hand-picked group; wider circle later | Done | Not started | `WhoHearsFirst`, `WideningCircle` |
| SF-3 | Sending steps through contacts one at a time with a pre-filled `sms:` link | Done | Done | `buildSmsLink()` |
| SF-4 | After handing a message off, one "Next" tap moves to the next person ("Done" on the last), with no "did it send?" question per contact | Done | Done | Replaced auto-advance on return, which never fired when the tab stayed visible (e.g. desktop) |
| SF-5 | Share button (OS share sheet) with clipboard fallback, same undo toast | Done | Not started | |
| SF-6 | AI-drafted obituary, reached from "Has the obituary been published?" ("Help me write it"); name and date of passing prefilled from the session; the draft is copied or shared to the funeral home or paper, never published or stored by the app | Partial — UI built; flagged off (`VITE_FEATURE_OBITUARY_DRAFTING`), so "Help me write it" shows disabled with an "in beta" tooltip. Turning it on needs a valid `ANTHROPIC_API_KEY` on the Worker. | Not started | `libs/gateway-messages` |
| SF-7 | Announcement form has no required fields — read-only session recap + optional note | Done | Not started | |

### 3.5 Sync & data

| ID | Requirement | Status | Notes |
|---|---|---|---|
| DS-1 | Cursor-based pull/push through the gateway, never Convex directly | Done | `libs/data-sync`, `libs/gateway-sync` |
| DS-2 | Send-flow state writes into `libs/data-local`'s screen-keyed store so the outbox has something to flush | Not started | Outbox is currently always empty |
| DS-3 | Sync is invisible — no spinners or "saving…" states | Partial | DATA.md §4.6 |
| DS-4 | Deleted sessions soft-delete, hard-purge at 90 days | Done (server) | `convex/crons.ts` |
| DS-5 | "Delete everything" in settings purges immediately, clears every local store | Partial | Server mutation exists; no settings UI yet |

### 3.6 Marketing

| ID | Requirement | Status |
|---|---|---|
| MK-1 | Public Astro site with no shared business logic | Partial |

---

## 4. Non-functional requirements

- **Performance:** every screen usable on a mid-range phone over a weak connection. No screen may
  wait on the network after sign-up (C5).
- **Accessibility:** tap targets and type sized for tired eyes and shaky hands; focus outlines
  visible; date/time fields keyboard- and screen-reader-accessible.
- **Reliability:** a force-quit at any point loses at most seconds of typing, never a session.
- **Privacy:** see C2–C4. Session tokens travel in `Authorization` headers, never query strings or
  cookies, and never in logs.
- **Platforms:** mobile (Expo) is the primary surface; web is a full peer; marketing is static.

---

## 5. Open questions

These need a product-owner decision before the related work can be called done. Do not resolve
them in code by assumption — raise them.

1. **Account deletion wording** — nulling the user row leaves sessions unreadable but present until
   purge. Does that satisfy what the privacy copy will promise? (DATA.md §8.1)
2. **Outbox durability across reinstall** — unflushed edits die with IndexedDB. Is a few seconds of
   exposure acceptable? (DATA.md §8.3)
3. **Contact re-match on re-import** — a contact whose number changed between devices falls back to
   unresolved. Tolerable? (DATA.md §8.4)
4. **Mobile multi-session** — settled (Oct 2026, #20). Mobile uses the same `useSessions` hook as web,
   over an AsyncStorage-backed cache (`apps/mobile/src/lib/deviceCache.ts`) with the same
   `gg.sessions.v1` shape. Server sync of sessions is a later ticket.
5. **Moving to the next person** — settled (Sep 2026) on one "Next" tap after the hand-off. Auto-advance
   on return to the app was dropped because it never fired when the tab stayed visible. The
   Yes / Not yet / Try again prompt (`039e459`, reverted) stays rejected, because it asks a question
   about every person.

---

## 6. Architecture and rules

The standing technical rules. Break one only with the product owner's agreement, and update this
section in the same PR.

### What this is

Grievers Guidance helps people who have just lost a loved one send funeral and service details to their contacts via SMS — texted from the griever's own phone number, one contact at a time, not a bulk send from a business number. The user is in acute grief — likely sleep-deprived, overwhelmed, and on a phone. Every product and engineering decision should be evaluated against that reality. Speed, clarity, and reliability over cleverness.

---

### Monorepo structure

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
  data-local/       IndexedDB-backed local storage (the screen-keyed session document, outbox,
                    contacts). Browser-only — see DATA.md.
  data-sync/        The offline sync engine (outbox flush, cursor-based pull/push, merge) that
                    talks to apps/gateway, never to Convex directly. See DATA.md.
  contacts/         Platform-agnostic contact-import logic shared by web and mobile: the
                    `ContactSource` adapter interface, normalize/dedupe/rank, and the
                    fetch → review → commit pipeline. Device-specific adapters (the web Contact
                    Picker, mobile's expo-contacts) live in the app that owns that device API.
  identity/         The gateway's side of Supabase accounts: verifies the Supabase JWT and serves
                    GET/PUT /me/profile. Owns its own Hono router, mounted by apps/gateway.
                    See "Identity" below — this is who a user is, never their friends or contacts.
  gateway-messages/ The AI-drafted obituary route. No message-sending logic lives server-side —
                    sending happens entirely on-device (see "The send flow").
  gateway-sync/     The gateway's Convex client and the /sync/pull, /sync/push routes.

  identity, gateway-messages, and gateway-sync each own their own Hono router and business logic,
  with no cross-imports between them — apps/gateway only composes their routers together
  (rule 2b below).
```

---

### Stack

| Layer | Tech |
|---|---|
| Mobile | Expo + React Native (core components only) |
| Web | React + Vite + Tailwind |
| Gateway | Hono on Cloudflare Workers, fronting Convex |
| Data | Convex — self-hosted via Docker locally, Convex Cloud in production (see infra/convex/README.md) |
| Marketing | Astro |
| Package manager | pnpm — never npm or yarn |
| Monorepo | Nx (task running, code generation) |
| Tests | Vitest (+ React Testing Library) for unit and integration; Playwright (+ axe) for e2e — see `PROCESS.md` §7 |
| CI/CD | GitHub Actions: `ci.yml` gates PRs and `main`; `deploy.yml` deploys only after CI passes on `main` |

---

### Domain and hosting

**`grieversguidance.com` is the official domain** — every public URL (marketing, web app, gateway,
`CORS_ORIGINS`) should live under it. The DNS zone and all deploys are on the
Tumultywebservices Cloudflare account; the old Grieverguidetech account is retired.
`*.pages.dev` / `*.workers.dev` addresses are deploy targets behind the custom domains, never
URLs to hand users or hardcode.

| Address | Serves | Configured in |
|---|---|---|
| `grieversguidance.com`, `www.` | marketing (Pages project `griever-guidance-marketing`) | Pages → Custom domains |
| `web.grieversguidance.com` | web app (Pages project `griever-guidance-web`) | Pages → Custom domains |
| `api.grieversguidance.com` | gateway (Worker `griever-guidance-gateway`) | `apps/gateway/wrangler.toml` `routes` |

`VITE_API_URL` and `PUBLIC_WEB_URL` are set in `.github/workflows/deploy.yml`; `CORS_ORIGINS` in
`apps/gateway/wrangler.toml`. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `FEATURE_AUTH` are GitHub repo
variables that the deploy workflow passes to the gateway and the web build.

---

### Running the project

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

### Architectural rules

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

### The send flow

```
Template picker → Details form → Contact selector → Confirm → Sending → Sent
```

This is the core user journey. It is driven by `useSendFlow()` from `libs/hooks`. Any change to this flow touches `libs/hooks`, `apps/web`, and `apps/mobile`.

**Sending is one contact at a time, from the user's own number — never a bulk send.** The Sending
step steps through `selectedContactIds` one at a time: "Open Messages" fires an `sms:` deep link
(`buildSmsLink()`) to the device's native Messages app with that contact and the composed message
pre-filled; the user taps Send there themselves — no web page or app can send an SMS on someone's
behalf, by OS design. Once the message has been handed off (Messages opened, shared, or copied),
the card shows "Next" ("Done" for the last person) and a way to reopen it. One tap moves on, with
no "did that send?" question for every person in what could be a long list. Nothing is inferred from
the app going to the background and coming back: that signal is unreliable, and on a desktop, where
Messages opens beside the browser, it never fires. Nothing is
recorded as sent to a backend, and there is no delivery receipt — the user's own Messages thread
with that contact is the only record, which is *more* trustworthy to a grieving person than an
opaque "delivered ✓" from a service they've never heard of. The app itself keeps no history of what
was sent (see "What not to do").

---

### Contacts

Read from the device on demand — `expo-contacts` on mobile (`apps/mobile/src/lib/expoContactsSource.native.ts`;
`.web.ts` is a no-op stub, since expo-contacts has no web implementation and importing it there
crashes on load), the Contact Picker API on Android Chrome web, manual entry everywhere else
(`libs/contacts`, shared adapter logic behind the `ContactSource` interface). Never *raw* provider
data — only 7 fields survive past the picker/import screen: `contactId`, `name`, `phone`, `email`,
`tier`, `source`, `createdAt` (a timestamp, not personal data) (see `Contact` in `libs/shared`).

Contacts are persisted on-device only (IndexedDB on web via `libs/data-local`, AsyncStorage on
mobile via `apps/mobile/src/lib/contactStore.ts` — same `ContactStore` interface, so `useContacts`
is shared) — never sent to Convex, never to the gateway. They are **not** kept forever: the saved
list is cleared 30 days after the latest known service date (`CONTACT_RETENTION_DAYS` in
`libs/hooks/src/useSessions.ts`), on the theory the family may want to reuse it right up until the
service is behind them, but has no reason to once it is. No service date yet set → no expiry
computed → contacts are kept. Mobile keeps sessions too and uses the same expiry (#20); its old
single stored service date was removed (#85).

---

### Identity

**Auth is feature-flagged off until the app has users.** `apps/web` shows sign-up/sign-in only
when built with `VITE_FEATURE_AUTH=true` (`apps/web/src/lib/features.ts`), and `apps/mobile` only
with `EXPO_PUBLIC_FEATURE_AUTH=true` (`apps/mobile/src/lib/features.ts`); anything else is off.
With it off, onboarding starts at adding contacts, `useSupabaseIdentity` is not used, and sync
never starts (it needs a signed-in `userId`).

Accounts are Supabase Auth, email and password only. The client signs up, signs in, and signs out
through `@griever/api-client/auth` (supabase-js); the session lives in the client and is read
through the `useSupabaseIdentity` hook (`libs/hooks`), which web and mobile share. Facebook
sign-in is planned later (#36); Instagram is dropped (personal accounts have no login API, and
Instagram never supplies an email); Google and X are not built. Nothing in this repo talks to
Facebook's or Instagram's OAuth endpoints today.

`libs/identity` is the gateway's side, and it answers one question, **who is this**:

- `supabaseAuth` (`supabaseJwt.ts`) verifies the caller's Supabase access token against the
  project's JWKS (`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`). It also checks
  `iss = ${SUPABASE_URL}/auth/v1`; a wrong or missing issuer is a 401.
- Supabase signing-key rotation must use the standby-key step (publish the new key first, then
  switch), because the gateway refetches the JWKS on an unknown `kid` at most every 30 s. Cached
  keys also live for 5 minutes (`JWKS_TTL_MS`), so a revoked key can still verify tokens for up to
  5 minutes per isolate; keep that in mind for an emergency revoke.
- `profileRouter` serves `GET/PUT /me/profile` (the sender name) against Supabase PostgREST as the
  signed-in caller (anon key plus their JWT, so row-level security applies). There is no
  service-role key. With `SUPABASE_URL` or `SUPABASE_ANON_KEY` unset the routes answer 503.
- Sign-in errors use one generic message whether the email exists or not, so a failed attempt never
  confirms which one (the copy lives in `useSupabaseIdentity`).
- **This does not, by itself, make `/sync/pull`/`/sync/push` work in production.** Those routes
  still authenticate via `convex/auth.ts`'s `requireUser` dev stub (`GG_DEV_AUTH`), and a real
  deployment never sets `GG_DEV_AUTH` (enforced by `scripts/check-dev-auth.mjs`), so `requireUser`
  throws there regardless of who is signed in. Verifying the Supabase session on `/sync/*` and
  mapping `auth.users.id` to `sessions.userId` is separate work (#20, #39). Separately, nothing in
  the web send flow (`useSessions`, `useSendFlow`) writes into `libs/data-local`'s screen-keyed
  store yet, so the outbox sync would flush is currently empty; see DATA.md.

**Accounts live in Supabase `profiles`** (see "Supabase boundary" under Database). The Convex
`identities` and `profiles` tables and their functions (`convex/identity.ts`) are removed (#37).
Convex holds only `sessions` and `counters`, for dev-only sync. Everything else in
this repo reaches a user only by their opaque `userId`.

**What sign-in is not, and cannot become:** it does not, and cannot, give this app a friends list
or a way to message someone's contacts. Facebook's `user_friends` permission only ever returns
friends who *also* use this app and have separately granted it, never a person's real friend list,
and neither Facebook nor Instagram has an API for a personal account to DM another personal
account. Sign-in is identity only; reaching a person's contacts is still the device/manual/Share-sheet
path described under "Contacts" and "The send flow". The two never merge.

---

### Database

Convex — self-hosted via Docker for local development, Convex Cloud in production (two separate
deployments; see `infra/convex/README.md`). Schema and functions live in `apps/gateway/convex/`,
identical in both. See `DATA.md` for the full data architecture (the screen-keyed local session
document, the cursor-based sync protocol, the merge rule).

Contact data is never sent to Convex — only contact *ids* appear in synced session data, never
a name or number. Message content is never stored anywhere, by anything — not Convex, not a send
history, not a log — only composed client-side and handed to the device's own Messages app at
send time (see "The send flow").

**Supabase boundary (accounts).** App state tied to an account (the `profiles` row: sender name and
contact source; the email lives in Supabase Auth) is stored in Supabase Postgres, with row-level
security so a user reaches only their own row and no delete policy (C9). Convex's deploy is
unchanged; session sync (still dev-only) stays there. Contacts and message content stay on the device and reach no
server (C2, C3, C4). Migrations and pgTAP tests live in `infra/supabase/`; migrations must stay backward-compatible
with the live gateway. Supabase is the only account path: the Convex `identities`/`profiles`
tables are removed (#37).
`checklistTicks` is not carried over yet, and how `auth.users.id` maps to Convex `sessions.userId`
is open (owned by #20/#39).

---

### Environment variables

```
apps/gateway  PORT, CORS_ORIGINS, ANTHROPIC_API_KEY, CONVEX_SELF_HOSTED_URL,
              CONVEX_SELF_HOSTED_ADMIN_KEY, CONVEX_SITE_URL,
              SUPABASE_URL, SUPABASE_ANON_KEY (public wrangler [vars]; no service-role key)
              CORS_ORIGINS, CONVEX_DEPLOY_KEY, CONVEX_URL                           (CI/prod only)
apps/web      VITE_API_URL, VITE_FEATURE_AUTH ("true" enables sign-up/sign-in; default off),
              VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (read only when the flag is on)
              VITE_FEATURE_OBITUARY_DRAFTING ("true" enables AI obituary drafting; default off)
apps/mobile   EXPO_PUBLIC_API_URL
```

Production repo variables (public, not secrets): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `FEATURE_AUTH`.
To turn accounts on: set `FEATURE_AUTH=true` and re-run the deploy. Mobile (`EXPO_PUBLIC_*`, EAS) is
a follow-up.

`CORS_ORIGINS` is comma-separated allowed origins — there is no "allow all" mode; an empty value
blocks every cross-origin request (see `apps/gateway/src/worker.ts`).

Never hardcode these. Never commit `.env` files.

---

### Tone and copy

This is a grief app. All user-facing copy — templates, labels, error messages, empty states — should be calm, clear, and human. No exclamation points. No "Awesome!" or "Great job!" microcopy. When in doubt, fewer words.

---

### What not to do

- No third-party UI component libraries in `apps/mobile` (no NativeBase, React Native Paper, Tamagui, etc.) — use core RN components
- No backend SMS-sending path (no Twilio, no `libs/sms`, no server-side send route) — see rule 3
- No shared types defined in apps
- No contact data reaches the gateway or Convex — on-device storage only (see "Contacts"), and never more than the 6 named `Contact` fields
- No raw provider payload (photo, provider ID, labels, etc.) kept past the picker/import screen — normalize down to the 7 `Contact` fields immediately
- No message content stored anywhere — not the DB, not state, not logs, not a send history; nothing to view or restore once sent (the user's own Messages app is the only record)
- No exclamation points in user-facing copy
- No `npm` or `yarn` — pnpm only
- No gateway routes without request body/query validation
- No cross-imports between `libs/identity`, `libs/gateway-messages`, and `libs/gateway-sync`
- No friends-list or peer-to-peer DM API calls to Facebook or Instagram — see "Identity"; neither platform allows either for a personal contact, regardless of sign-in

---

### When you're unsure

This app exists because losing someone is hard enough without also managing logistics. If a decision makes the app faster or simpler for a grieving user, it's probably right. If it adds friction or complexity for the sake of technical elegance, reconsider it.
