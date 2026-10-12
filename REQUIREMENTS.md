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
| C1 | Messages are sent from the user's own phone via an `sms:` deep link, one contact at a time. No backend SMS path, no bulk send, no business number. Account emails (confirmation, reset, invites) come from the backend. They never carry message content, contacts, or the deceased person's details. | §6 rule 3 |
| C2 | Message content is never stored — not Convex, not local state after send, not logs, not a history. Person details are not message content, and they sync to Supabase. Drafts, edited wording and who was messaged stay on the device. | §6 "What not to do" |
| C3 | Contact data never reaches the gateway or Convex. Contact data **and contact ids** never reach the gateway, Supabase or Convex in flow sync. An invitee's email is typed by the owner and never picked from contacts. | §6 "Contacts" |
| C4 | Only the 7 `Contact` fields (`contactId`, `name`, `phone`, `email`, `tier`, `source`, `createdAt`) survive past the import screen. `createdAt` is a timestamp, not personal data. | §6 "Contacts" |
| C5 | Offline-first: nothing after sign-up may wait on the network, and nothing inside a flow ever does. Only account actions (sign-up, sign-in, reset, invite, revoke an invite, join, remove a member) need a connection, and they say so calmly. The device is authoritative. | DATA.md posture |
| C6 | Sign-in (email today, Facebook later) is identity only — never a friends list, never a DM path. Members are added only by an owner typing an email. They are never suggested. | §6 "Identity" |
| C7 | All user-facing copy is calm and plain. No exclamation points, no celebratory microcopy. | §6 "Tone and copy" |
| C8 | Every gateway route validates its request body/query. | §6 "What not to do" |
| C9 | Deletion is never offered inside a flow or as a swipe action — only in settings. Removing a member or revoking an invite happens in profile or settings only. | DATA.md §7 |
| C10 | The product never implies an order to funeral planning other than the real one: pronouncement → custody → burial/cremation → service → obituary → broader public announcement. Telling close family and friends first, one at a time from the user's own phone (the app's "Announce the passing" step), is not that public announcement and can happen at any point. Never ask for an obituary link during setup. | design_specs README |
| C11 | Members can't create a person. Enforced by database rules (RLS), not just the UI. | §6 "Identity"; DATA.md "Shared people (Supabase)" |

---

## 3. Functional requirements

### 3.1 Account & identity (Flow D)

**Web accounts are live in production** (`FEATURE_AUTH=true`, since 2026-10-11). The code still sits
behind `VITE_FEATURE_AUTH` (apps/web) and `EXPO_PUBLIC_FEATURE_AUTH` (apps/mobile), which default to
off; mobile has not been switched on (see "Identity" in §6). ID-8 to ID-10 are planned family
sharing (G1, 2026-10-11, reversing the read-only snapshot idea in #39).

| ID | Requirement | Web | Mobile | Notes |
|---|---|---|---|---|
| ID-1 | Sign up / sign in with Facebook | Not started | Not started | Planned later (#36); the old Convex-backed path is removed |
| ID-2 | Sign up / sign in with Instagram | Dropped | Dropped | Personal IG accounts have no login API; Business/Creator only, and no email |
| ID-3 | Email/password sign-up and sign-in on Supabase Auth, non-enumerating errors | Done (live in production) | Done (flag on only) | `@griever/api-client/auth`, `useSupabaseIdentity`; passwords never reach the gateway |
| ID-4 | Google sign-in | Not started | Not started | Shown disabled, "coming soon" |
| ID-5 | X sign-in | Not started | Not started | Shown disabled, "coming soon" |
| ID-6 | Session token verified server-side on `/sync/*`, replacing the `GG_DEV_AUTH` stub | Superseded | — | The session is now a Supabase JWT (`supabaseAuth` verifies it for `/me/*`); shared people sync reads it through Supabase instead (`flows.owner_id`, #130); the Convex `/sync/*` stub is being retired (#140) |
| ID-7 | Account before session — sign-up needs a connection; everything after works offline | Done (live in production) | Partial | DATA.md "Settled"; mobile is suspended while its flag is off |
| ID-8 | An owner invites a member by typing their email (in profile) | Not started | Not started | Planned: #116, #117 (database), #120 (shared types), #121, #122, #124 (gateway), #125 (hooks), #126 (web), #129 (mobile). Email is typed, never picked from contacts (C3, C6) |
| ID-9 | A member joins from the emailed link (web in v1) | Not started | Not started | Planned: #117, #128 (web); mobile join is a follow-up (#139) |
| ID-10 | Members can't create a person (RLS) | Not started | Not started | Planned: #116, #130 (database rules), #123, #127, #129 (UI). C11 |

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
| SE-6 | Home lists the people you're writing about, newest first, with 'What you'll need' at the top. 'Create a new one' leads to setup → contacts (only when the device has none) → who hears first → the path; the path returns to Home. | Done | Done | Web with accounts on: sign-up → Profile (Continue) → Home (#114). Mobile: #108; mobile accounts stay suspended while its flag is off |

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
| DS-6 | Person details (name, date of passing, service date, obituary link, service ready) are shared with the owner's members through Supabase; drafts, contacts and who was told stay on each device | Not started | Planned: #130 (table), #131 (routes), #132, #133, #134 (sync), #135, #136 (start sync, "Shared by Anna"). Ships behind FEATURE_SHARING, off until #135/#136 (#124). Service time and place are a follow-up (#138). DATA.md "Shared people (Supabase)" |

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

**Reversed by the family-sharing G1 (2026-10-11):** the read-only snapshot direction (#23, #39) is
dropped. An owner can invite family members by email, members work on the owner's people, and
person details (not messages, drafts or contacts) sync through Supabase. See C1, C2, C3, C5, C6,
C9, C11 in §2 and DATA.md "Shared people (Supabase)".

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
              Composes libs/identity, libs/gateway-messages, libs/gateway-sync and
              libs/gateway-flows into one HTTP surface (CORS + routing) — this app owns no
              domain logic itself. Also holds the Convex functions (apps/gateway/convex/).
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
  gateway-auth/     The one shared helper for the gateway's domain libs:
                    Supabase JWT verification and a PostgREST client that acts as the caller.
  gateway-flows/    Invite and member routes (GET /members, POST /invites, POST /invites/accept,
                    DELETE /invites/:id, DELETE /members/:memberId) and the invite mailer; mounted
                    by apps/gateway. The /flows routes are planned (#131).

  identity, gateway-messages, gateway-sync, and gateway-flows each own their own Hono router and
  business logic, with no cross-imports between them — apps/gateway only composes their routers
  together. The only shared code is libs/gateway-auth (rule 2b below).
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

**2b. Identity, messages, sync, and flows are separate libs — no cross-imports.**
`libs/identity`, `libs/gateway-messages`, `libs/gateway-sync`, and `libs/gateway-flows` each own their routes and business logic independently. `apps/gateway`'s only job is composing their Hono routers into one HTTP surface (CORS + routing) — domain logic never lives in `apps/gateway` itself, and none of them ever imports another (each keeps its own tiny Convex client rather than sharing one). The one exception is a single shared helper lib, `libs/gateway-auth` (Supabase JWT verification plus PostgREST calls made as the caller), which the domain libs may import. It is the only shared helper; `libs/identity`, `libs/gateway-messages`, `libs/gateway-sync`, and `libs/gateway-flows` still never import each other.

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

**Auth is feature-flagged, and live on the web.** Accounts have been on in production since
2026-10-11 (`FEATURE_AUTH=true`). `apps/web` shows sign-up/sign-in only when built with
`VITE_FEATURE_AUTH=true` (`apps/web/src/lib/features.ts`), and `apps/mobile` only with
`EXPO_PUBLIC_FEATURE_AUTH=true` (`apps/mobile/src/lib/features.ts`); anything else is off, and
mobile is not switched on yet. With the flag off, onboarding starts at adding contacts, `useSupabaseIdentity` is not used, and sync
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
  service-role key (see the family-sharing rule below). With `SUPABASE_URL` or `SUPABASE_ANON_KEY` unset the routes answer 503.
- Invitations: `POST /invites` creates the invite and emails the link (via Resend, from
  `INVITE_FROM_EMAIL`, pointing at `WEB_URL`); if the email cannot be sent the invite is revoked and
  the caller gets a calm 503. The routes live in `libs/gateway-flows`.
- Sign-in errors use one generic message whether the email exists or not, so a failed attempt never
  confirms which one (the copy lives in `useSupabaseIdentity`).
- **The Convex `/sync/pull`/`/sync/push` routes do not work in production, and are not the plan.**
  They still authenticate via `convex/auth.ts`'s `requireUser` dev stub (`GG_DEV_AUTH`), and a real
  deployment never sets `GG_DEV_AUTH` (enforced by `scripts/check-dev-auth.mjs`), so `requireUser`
  throws there regardless of who is signed in. The old question of how `auth.users.id` maps to
  `sessions.userId` is answered by the shared-people design: person details sync through a
  Supabase `flows` table whose `flows.owner_id` is `auth.users.id` (#130). The dev-only Convex sync
  is retired in #140. Separately, nothing in the web send flow (`useSessions`, `useSendFlow`)
  writes into `libs/data-local`'s screen-keyed store yet, so the outbox sync would flush is
  currently empty; see DATA.md.
- **Family sharing (decided at G1, 2026-10-11; not built yet).** An owner adds members only by
  typing an email (C6). Still **no service-role key**: invites use our own single-use token, and a
  joiner redeems it through an RPC called under their own JWT, so row-level security applies to
  every step. Members can't create a person (C11), enforced by RLS. Tickets: #116, #117, #121,
  #122, #128, #130.

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

Contact data is never sent to Convex. Contact *ids* never appear in shared person sync (C3); the
dev-only Convex session sync still carries ids, never a name or number, until it is retired (#140). Message content is never stored anywhere, by anything — not Convex, not a send
history, not a log — only composed client-side and handed to the device's own Messages app at
send time (see "The send flow").

**Supabase boundary (accounts).** App state tied to an account (the `profiles` row: sender name and
contact source; the email lives in Supabase Auth) is stored in Supabase Postgres, with row-level
security so a user reaches only their own row and no delete policy (C9). Convex's deploy is
unchanged; session sync (still dev-only) stays there. Contacts, drafts and message content stay on the device and reach no
server (C2, C3, C4); only person details sync. Migrations and pgTAP tests live in `infra/supabase/`; migrations must stay backward-compatible
with the live gateway. Supabase is the only account path: the Convex `identities`/`profiles`
tables are removed (#37).
`checklistTicks` is not carried over yet. Shared people details will live in Supabase too (a
`flows` table with `flows.owner_id` = `auth.users.id`, plus memberships, #116, #130); see DATA.md
"Shared people (Supabase)".

---

### Environment variables

```
apps/gateway  PORT, CORS_ORIGINS, ANTHROPIC_API_KEY, CONVEX_SELF_HOSTED_URL,
              CONVEX_SELF_HOSTED_ADMIN_KEY, CONVEX_SITE_URL,
              SUPABASE_URL, SUPABASE_ANON_KEY (public wrangler [vars]; no service-role key)
              INVITE_FROM_EMAIL, WEB_URL (wrangler [vars]), RESEND_API_KEY (Worker secret, set by
              deploy.yml from the GitHub secret; skipped when empty, and a key already on the
              Worker stays; to remove it: `wrangler secret delete RESEND_API_KEY --config
              apps/gateway/wrangler.toml`; with no key, POST /invites answers 503)
              CORS_ORIGINS, CONVEX_DEPLOY_KEY, CONVEX_URL                           (CI/prod only)
apps/web      VITE_API_URL, VITE_FEATURE_AUTH ("true" enables sign-up/sign-in; default off),
              VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (read only when the flag is on)
              VITE_FEATURE_SHARING ("true" enables sharing; default off)
              VITE_FEATURE_OBITUARY_DRAFTING ("true" enables AI obituary drafting; default off)
apps/mobile   EXPO_PUBLIC_API_URL
```

Production repo variables (public, not secrets): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `FEATURE_AUTH`, `FEATURE_SHARING`
(off until the PO sets it to `true`). The gateway's only Worker secret is `RESEND_API_KEY` (from the
repo secret of the same name).
Web production has `FEATURE_AUTH=true` (since 2026-10-11). To turn accounts off or on again, change it
and re-run the deploy. Mobile (`EXPO_PUBLIC_*`, EAS) is a follow-up.

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
- No cross-imports between `libs/identity`, `libs/gateway-messages`, `libs/gateway-sync`, and `libs/gateway-flows` (only `libs/gateway-auth` is shared)
- No contact ids in flow sync (C3), and no invitee picked from contacts: the owner types the email (C6)
- No service-role key anywhere (see "Identity")
- No friends-list or peer-to-peer DM API calls to Facebook or Instagram — see "Identity"; neither platform allows either for a personal contact, regardless of sign-in

---

### When you're unsure

This app exists because losing someone is hard enough without also managing logistics. If a decision makes the app faster or simpler for a grieving user, it's probably right. If it adds friction or complexity for the sake of technical elegance, reconsider it.
