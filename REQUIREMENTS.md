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

Since 2026-10-30 the web has a second job (#385): a desk where the family plans the details
(the person, the service, later the announcement, obituary and thank-yous) so they can send from
the phone without retyping. **Web = plan at a desk, mobile = send.**

Sending the planned details from the phone needs sync. The sync was approved on 2026-10-30
(DS-7, ADR 0001): the person's detail fields follow the person to the owner's other devices and
members. The sync is built (#517 to #522 are closed) and the web turns it on with `FEATURE_SYNC`; since `5806fc7` the mobile production profile in `apps/mobile/eas.json` sets `EXPO_PUBLIC_FEATURE_AUTH` and `EXPO_PUBLIC_FEATURE_SYNC` to `"true"` too. The production Clerk key is set in EAS, outside the repo, so the repo cannot confirm it; a build without it keeps accounts off, and its planning fields stay on the phone. #371 tracks the TestFlight and store release.

Every requirement below is subordinate to that. If a requirement makes the app slower or more
confusing for that person, the requirement is wrong.

---

## 2. Non-negotiable constraints

These are not features; breaking one is a defect regardless of what it enables.

| # | Constraint | Source |
|---|---|---|
| C1 | Messages are sent from the user's own phone via an `sms:` deep link, one contact at a time. Service and obituary may also use the OS share sheet and email compose (2026-11-01, #559, Decision 1). Email compose is to the publisher only (MOB-9), and `sms:` links never carry several recipients. Each send is still the user's own action: no server send and no bulk text. `sms:` stays one contact at a time. Sending is mobile-only: the web has no send path. Transition (2026-10-30, #385): the old web send flow stays only in the flag-off build (`VITE_FEATURE_CMS` off) until a later round removes it. No backend SMS path, no bulk send, no business number. Account emails (confirmation, reset, invites) come from the backend. They never carry message content, contacts, or the deceased person's details. | §6 rule 3 |
| C2 | Dropped 2026-10-30 (#385): web planning text is stored on the device so it can be sent from the phone later; nothing is sent from web. The old rule, kept for the record and still in force in the flag-off build: message content is never stored — not local state after send, not logs, not a history. Person details are not message content, and they sync to the AWS data function. Drafts, the send flow's edited wording (`messageOverride`) and who was messaged stay on the device. The four planning messages (service, announcement, obituary text, thank-you) sync under DS-7 (ADR 0001). | §6 "What not to do" |
| C3 | Contact data never reaches the gateway. Contact data **and contact ids** never reach the gateway or the data function in flow sync. An invitee's email is typed by the owner and never picked from contacts. | §6 "Contacts" |
| C4 | Only the 7 `Contact` fields (`contactId`, `name`, `phone`, `email`, `tier`, `source`, `createdAt`) survive past the import screen. `createdAt` is a timestamp, not personal data. | §6 "Contacts" |
| C5 | Dropped 2026-10-30 (#385): offline is tech debt, last saved wins. The old rule, kept for the record: offline-first, nothing after sign-up may wait on the network, and nothing inside a flow ever does. Only account actions (sign-up, sign-in, reset, invite, revoke an invite, join, remove a member) need a connection, and they say so calmly. The device is authoritative. Existing offline behaviour (mobile, the flag-off web send flow) stays as built until a ticket changes it; nothing new needs to work offline. | DATA.md posture |
| C6 | Sign-in (email today, Facebook later) is identity only — never a friends list, never a DM path. Members are added only by an owner typing an email. They are never suggested. | §6 "Identity" |
| C7 | All user-facing copy is calm and plain. No exclamation points, no celebratory microcopy. | §6 "Tone and copy" |
| C8 | Every gateway route validates its request body/query. | §6 "What not to do" |
| C9 | Deletion is never offered inside a flow or as a swipe action — only in settings. Removing a member or revoking an invite happens in profile or settings only. | DATA.md §7 |
| C10 | The product never implies an order to funeral planning other than the real one: pronouncement → custody → burial/cremation → service arranged → obituary → service held → broader public announcement. Telling close family and friends first, one at a time from the user's own phone (the app's "Announce the passing" step), is not that public announcement and can happen at any point. Never ask for an obituary link during setup. | design_specs README |
| C11 | Members can't create a person. Enforced by the data function's rules, not just the UI. | §6 "Identity"; DATA.md "Shared people" |

---

## 3. Functional requirements

### 3.1 Account & identity (Flow D)

**Web accounts are live in production** (`FEATURE_AUTH=true`, since 2026-10-11). The code still sits
behind `VITE_FEATURE_AUTH` (apps/web) and `EXPO_PUBLIC_FEATURE_AUTH` (apps/mobile), which default to
off; mobile has not been switched on (see "Identity" in §6). ID-8 to ID-10 are planned family
sharing (G1, 2026-10-11, reversing the read-only snapshot idea in #39).

| ID | Requirement | Web | Mobile | Notes |
|---|---|---|---|---|
| ID-1 | Sign up / sign in with Facebook | Not started | Not started | Planned later (#36); the old path is removed |
| ID-2 | Sign up / sign in with Instagram | Dropped | Dropped | Personal IG accounts have no login API; Business/Creator only, and no email |
| ID-3 | Sign-up and sign-in on Clerk, non-enumerating errors | Done (live in production) | Done (flag on only) | Clerk (`apps/web/src/lib/clerk.tsx`, `useAccount`); passwords never reach the gateway. Supabase Auth was retired (#326) |
| ID-4 | Google sign-in | Not started | Not started | No button in the UI yet |
| ID-5 | X sign-in | Not started | Not started | No button in the UI yet |
| ID-6 | Session token verified server-side on `/sync/*`, replacing the `GG_DEV_AUTH` stub | Superseded | — | The session is now a Clerk token (`clerkAuth` verifies it); the Convex `/sync/*` stub was removed (#203) |
| ID-7 | Account before session — sign-up needs a connection; everything after works offline | Done (live in production) | Partial | DATA.md "Settled"; mobile is suspended while its flag is off. Mobile never asks "What should we call you?": as the first screen, Account leaves once the user is signed in and the profile call has answered (or failed), with or without a name; a name is only ever entered on "Your account" (#694) |
| ID-8 | An owner invites a member by typing their email (in profile) | Not started | Not started | Planned: #116, #117 (database), #120 (shared types), #121, #122, #124 (gateway), #125 (hooks), #126 (web), #129 (mobile). Email is typed, never picked from contacts (C3, C6) |
| ID-9 | A member joins from the emailed link (web in v1) | Not started | Not started | Planned: #117, #128 (web); mobile join is a follow-up (#139) |
| ID-10 | Members can't create a person (RLS) | Not started | Not started | Planned: #116, #130 (database rules), #123, #127, #129 (UI). C11 |

### 3.2 Contacts (Flow D)

| ID | Requirement | Web | Mobile | Notes |
|---|---|---|---|---|
| CT-1 | Import from device contacts | Not offered (web import deleted 2026-10-21); removed when `VITE_FEATURE_CMS` is on | Done (`expo-contacts`) | |
| CT-2 | Manual contact entry | Done; superseded when `VITE_FEATURE_CMS` is on | Done | Fallback everywhere. Mobile: "Add someone myself" on the contacts step after setup (#226) and "Add by hand" on the picker; phone checked with the same rule as web. Device-tested on a phone: HUMAN TODO |
| CT-3 | Normalize, dedupe, and rank imported contacts | Done | Done | `libs/contacts` |
| CT-4 | Contacts stored on-device only | Done (IndexedDB); superseded when `VITE_FEATURE_CMS` is on | Done (AsyncStorage) | Shared `ContactStore` interface |
| CT-5 | Clear saved contacts 30 days after the latest known service date; keep them if no date is set | Done | Done (single-date anchor) | `CONTACT_RETENTION_DAYS` |
| CT-6 | A device with no contacts does not restore a session | Partial | Not started | DATA.md §2 |

### 3.3 Session & guided path (Flow C, L3)

| ID | Requirement | Web | Mobile | Notes |
|---|---|---|---|---|
| SE-1 | Ask for the deceased person's details once per session; every flow reads from it | Done; superseded when `VITE_FEATURE_CMS` is on | Done | Mobile: "Create a new one" opens a setup screen (name required, date optional, no obituary field) and saves both to the person; the date is free text and the sender name is not asked here; the moment's details form opens with the name filled in (#213) |
| SE-2 | Sessions survive app close and restore on relaunch; landing offers "continue" first | Done; superseded when `VITE_FEATURE_CMS` is on | Done | Mobile restores people and the open one from AsyncStorage; launch opens the last person opened unless that person is blank or sign-in comes first; no separate continue prompt (2026-11-05) |
| SE-3 | Multiple sessions ("Someone else I've lost") | Done; superseded when `VITE_FEATURE_CMS` is on | Done | Mobile: on-device only (#20); no delete (C9); no server sync yet |
| SE-4 | Guided path landing (C1) ordered around the real planning sequence. On web the path is the hub: every done row is tappable and opens a fresh, empty draft of that moment (no old wording, C2 in the flag-off build); the done date stays and the count adds up; a moment with a half-written draft shows "Started" and one tap resumes it. "Edit person" is on the path. | Done; superseded when `VITE_FEATURE_CMS` is on | Partial | #176. Mobile: the person screen shows the four send cards with their status (MOB-5, PR #638); there is no template picker on that path. Tappable done rows and "Started" resume are not built on mobile |
| SE-5 | The five "Gather when you can" ticks ("What you'll need") are kept silently **on this device only**. All items start unticked; each row is a toggle (`aria-pressed`, strikethrough plus a filled icon), shown on the checklist screen and on Your account; both read the same on-device ticks. Never notified, nagged, badged or counted; nothing goes to the network. **Split (2026-10-30, #385):** those five ticks are unchanged: device-only, never counted, never read anywhere else. The new phase ticks and "Doesn't apply" marks (WEB-10) are saved on the person and will sync in a later round (not synced in round 1). The phase checks (WEB-10) and the Overview's next item (WEB-12) are the only places that read them. Still no notifications, nagging, badges or counts. The phase check is not a badge or a count. **Mobile (#699):** the person screen has a quiet text button "What you'll need" that opens the phone checklist sheet (MOB-14); Share obituary's What you'll need button opens the same sheet. Edit person (setup) opens the same sheet for the open person. Your account on the phone has no "What you'll need" and no checklist; the old Gather-only sheet is gone (#732, #739). | Done (the five device ticks, unchanged); phase ticks: see WEB-10 | Not started | #176. Settled by the product owner (Oct 2026): persist, on device, not synced. Local `account.checklistTicks` (DATA.md §2.1). Supersedes the per-account server copy (`profiles.checklistTicks`). Split recorded in #406 (round 1 assumption, #385 B1, B9) |
| SE-6 | Home lists the people you're writing about under the heading "Who you're writing about", newest first. 'What you'll need' lives on "Your account" on web (same on-device ticks as the checklist screen); while accounts are off, Home keeps a link to it. On the phone it is not on Your account (SE-5). It stays reachable from the path and Settings. 'Create a new one' leads to setup → contacts (only when the device has none) → who hears first → the path; the path returns to Home. On web, tapping a person on Home always opens their path (never a form); a half-written message shows "Started" there and resumes in one tap (keeps #25). | Done; superseded when `VITE_FEATURE_CMS` is on | Partial | With `VITE_FEATURE_CMS` on, Home never shows: "Your people" replaces it inside the editor shell (people newest first, "Start with someone I've lost" for owners only, the existing member empty state), "Change" opens it, and Back from Your account or Settings returns to where it was opened from: "Your people", or that person's Overview (#451). Web with accounts on: sign-up → Profile (Continue) → Home (#114). Mobile: #108; setup done (#213), contacts step done (#226: shown only when the phone has no contacts; a local read slower than 1.5 s counts as none), who hears first: #227; mobile accounts stay suspended while its flag is off. Web path-as-hub: #176; mobile reopens a person at the send cards (MOB-5, PR #638). On the phone, there is no More menu (#699). The person screen's top button "What you'll need" opens the checklist sheet (MOB-14); Edit person and Add someone are in the name switcher (#698), which opens from the person's name even with one person; Home shows only before anyone is named. "Your account" is a quiet text link at the foot of the person screen, shown only with accounts on; it opens the phone's Your account (MOB-18), which has no checklist (#732, #739). Edit person (setup) has the same What you'll need button and sheet for that person. "Add from your contacts" is no longer on the person screen; the people sheet imports contacts (2026-11-06). Mobile has no name prompt after sign-in or sign-up: Account leaves to Home once the profile call has answered (or failed), with or without a name, and "Your account" keeps its name field filled from the profile (#694). #190, #191 |

### 3.4 Send flow (Flows A & B)

| ID | Requirement | Web | Mobile | Notes |
|---|---|---|---|---|
| SF-1 | Mobile: Person → Ready to send, with the people sheet when needed → Texting → Person. Web: Path → first form → Contacts → Confirm → Sending → Path with a quiet note. Both driven by `useSendFlow()` | Done; removed when `VITE_FEATURE_CMS` is on | Done | #176: web has no picker and no Sent screen. The hook keeps its `template` step; the web flow treats it, and Back on a moment's first form, as "exit to the path". The #559 target for mobile is Hub cards → people → send screen → sending → hub (§6); mobile runs it since PR #645 (#628); the people list is a sheet over Ready to send (#673) |
| SF-2 | Close family hears first, from a small hand-picked group; wider circle later | Done; removed when `VITE_FEATURE_CMS` is on | Superseded by MOB-1 | `WhoHearsFirst`, `WideningCircle`. Mobile now has one people list (MOB-1, #620, PR #635) |
| SF-3 | Sending steps through contacts one at a time with a pre-filled `sms:` link | Done; removed when `VITE_FEATURE_CMS` is on | Done | `buildSmsLink()` |
| SF-4 | After handing a message off, one "Next" tap moves to the next person ("Done" on the last), with no "did it send?" question per contact. On web, Done on the last person opens the path at once with a `role="status"` note that stays until the next navigation or a Close tap (no timer, no motion): "Everyone has been told." / "The service details have been shared." / "The obituary has been shared." / "Your thank-yous have been sent."; if anyone was skipped, "You told N of M. You can text the others from your own Messages app any time." The note also says "We don't keep a copy of what was sent" (C2, flag-off build). | Done; removed when `VITE_FEATURE_CMS` is on | Done | Replaced auto-advance on return, which never fired when the tab stayed visible (e.g. desktop). Web note: #176; mobile still shows its Sent screen. Mobile changes under MOB-4 (2026-11-01, #559): on return from Messages, the app asks "Sent to {name}? Next: {name}" (§5 item 5). Done in PR #642 (#623). Device: the prompt on return, HUMAN TODO. Web is unchanged. Phone note (2026-11-05, #669): the MOB-4 answer is the primary button in the bottom bar; Not yet and Skip sit above it |
| SF-5 | Share button (OS share sheet) with clipboard fallback, same undo toast | Done; removed when `VITE_FEATURE_CMS` is on | Done (service and obituary) | Mobile: "Share elsewhere" (MOB-10, #631, PR #648), allowed with zero people picked; no clipboard fallback or undo toast on mobile; a failed share shows a calm error line. Device: the share sheet on iOS and Android, HUMAN TODO |
| SF-6 | AI-drafted obituary, reached from "Has the obituary been published?" ("Help me write it"); name and date of passing prefilled from the session; the draft is copied or shared to the funeral home or paper, never published or stored by the app | Partial — UI built; flagged off (`VITE_FEATURE_OBITUARY_DRAFTING`), so "Help me write it" shows disabled with an "in beta" tooltip. Turning it on needs a valid `ANTHROPIC_API_KEY` on the Worker. Removed when `VITE_FEATURE_CMS` is on. | Not started | `libs/gateway-messages` |
| SF-7 | Announcement form has no required fields — read-only session recap + optional note. Continue goes straight to "Who should know?": no service question. The message says "details to follow", or carries the service line if the session has a service date. A saved draft on the retired service step resumes on contacts. | Done; removed when `VITE_FEATURE_CMS` is on | Not started | #176. The separate "Have the arrangements been made?" gate for the service moment stays (C2 in the flag-off build, C10) |

### 3.5 Sync & data

| ID | Requirement | Status | Notes |
|---|---|---|---|
| DS-1 | Cursor-based pull/push through the gateway | Removed | The Convex backend and the `/sync/*` routes were removed (#203). `libs/data-sync` stays as unused client code. Shared people sync uses the AWS data function (DS-6) |
| DS-2 | Send-flow state writes into `libs/data-local`'s screen-keyed store so the outbox has something to flush | Not started | Outbox is currently always empty |
| DS-3 | Sync is invisible — no spinners or "saving…" states | Partial | DATA.md §4.6 |
| DS-4 | Deleted sessions soft-delete, hard-purge at 90 days | Removed | The Convex purge cron was removed (#203). No server holds sessions now |
| DS-5 | "Delete everything" in settings purges immediately, clears every local store | Partial | The Convex server mutation was removed (#203). Local clearing only |
| DS-6 | Person details (name, date of passing, service date, obituary link, service ready) are shared with the owner's members through the AWS data function; drafts, contacts and who was told stay on each device | Not started | Planned: #130 (table), #131 (routes), #132, #133, #134 (sync), #135, #136 (start sync, "Shared by Anna"). Ships behind FEATURE_SHARING, off until #135/#136 (#124). Service time and place are a follow-up (#138); the detail fields now follow in DS-7. DATA.md "Shared people" |
| DS-7 | The person's detail fields (24 text fields for the person, service, visitation, burial, reception, announcement, obituary and thank-you; `burialPrivate`; the five section statuses) are shared with the same people as DS-6, through the same record. Per field, the last save to reach the server wins; no client timestamps. Text above the length caps is cut, not refused. Never shared: drafts, the send flow's edited wording (`messageOverride`), recipients, contacts, sender name, checklist ticks and reminders | Built; web on; mobile production flags on since `5806fc7`, Clerk key set in EAS, release in #371 (shared keys, caps and parser #516; data function #517, gateway #518, sync engine #519, web #520, mobile #521, phone prefill #522: all closed) | Approved by the product owner 2026-10-30. Keys and caps: `libs/shared/src/flowDetails.ts`. The publisher's email typed on Share obituary (MOB-9) is device-only: one local key per person, never a synced key. The survivors' names in `obituarySurvivors` reach the server; this is accepted and recorded in `docs/adr/0001-person-details-sync.md`. The checklist does not sync yet (B9, SE-5) |

### 3.6 Marketing

| ID | Requirement | Status |
|---|---|---|
| MK-1 | Public Astro site with no shared business logic | Partial |

### 3.7 Web editor

Added 2026-10-30 (#385, round 1). The web becomes a planning editor: the family plans at a desk,
and the phone sends (C1). Everything here ships behind `VITE_FEATURE_CMS`, which is **on in
production** (product owner, 2026-10-30: no users yet). With the flag off the web app is unchanged. Round 1 considers only The person and
Service when it picks the next section. Planning fields sync between devices under DS-7 once it ships (ADR 0001); until then they stay
on the device that typed them. Notes marked "round 1
assumption" are the assumptions accepted in #385 (A1 to A9 and B1 to B10).

| ID | Requirement | Status | Notes |
|---|---|---|---|
| WEB-1 | Shell and nav: a side nav (layout switches at the `md` breakpoint; round 1 assumption, #385 A7) that moves between the sections | Done (behind `VITE_FEATURE_CMS`, on in production) | #391. With the editor on, loading or signing in lands on the most recent person's Overview, once per load or sign-in; with nobody saved it lands on the empty Overview (a calm page with one next step; a member sees the explaining line and no Start button, C11). Overview and Your people are different pages in every state. "Start with someone I've lost" opens The person from any page. The side nav is the same in every state (status circles always shown), has no person name line and no Change button; "Your people" in the nav leads to the list. The account page is titled "Account". There is no forced name prompt: first and last name are filled once from the Clerk user when the server confirms the profile has none, and Overview shows a note linking to Account when there is still no first name (#448, #603) |
| WEB-2 | Overview: every section with its status (Not started, In progress, Ready) and one next section | Done (behind `VITE_FEATURE_CMS`, on in production) | #392. Next considers every section. Also the landing screen after load or sign-in (#448) |
| WEB-3 | The person: edit the person's details; "Mark as ready" | Done (behind `VITE_FEATURE_CMS`, on in production) | #393. The first save sets In progress; "Mark as ready" sets Ready. Editing a Ready section keeps it Ready (round 1 assumption, #385 A2) |
| WEB-4 | Service: edit the service details, with a "Use the details above" reset; "Mark as ready" | Done (behind `VITE_FEATURE_CMS`, on in production) | #394. Service type is free text and not in the message (round 1 assumption, #385 A4). The "Use the details above" reset is a round 1 assumption (#385 A8). Ready also sets the synced `serviceReady`; un-marking sets it false (round 1 assumption, #385 A3). Four events: visitation, funeral or memorial service (with officiant), burial or "private family service", reception (round 1 assumption, #385 B6, B7). `serviceDate` stays the main service date and anchors contact retention (round 1 assumption, #385 B8). Fields: #407, #420 |
| WEB-5 | Announcement | Done (behind `VITE_FEATURE_CMS`, on in production) | #502, #505. Message follows The person until edited; "Use the details above" resets it. Phone nudge: WEB-13 |
| WEB-6 | Obituary | Done (behind `VITE_FEATURE_CMS`, on in production) | #503, #505. Template fields and text (#615 removed where it is published); the text follows the fields until edited |
| WEB-7 | Thank-yous | Done (behind `VITE_FEATURE_CMS`, on in production) | #504, #505. Message follows the name until edited |
| WEB-8 | Your account (Back goes to Home; round 1 assumption, #385 A9) | Done (behind `VITE_FEATURE_CMS`, on in production) | #391 |
| WEB-9 | Checklist panel ("What you'll need"): a third column on wide screens; show or hide is remembered per device; below `lg` a button opens it as a sheet. Not a nav item | Done (behind `VITE_FEATURE_CMS`, on in production) | #417, #419, #421. Remembered in `gg.cmsChecklistPanel.v1` (DATA.md §1) (round 1 assumption, #385 B2, B3) |
| WEB-10 | The 6 phases of the Funeral Arrangements Checklist. Each item can be ticked or marked "Doesn't apply"; a phase shows a green check when every item is ticked or doesn't apply. No counts | Done (behind `VITE_FEATURE_CMS`, on in production) | #408, #414, #415, #416, #421. Saved on the person; not synced in round 1 (SE-5, DATA.md §2.1). The tell-close-family item reads "Tell immediate family and closest friends yourself, by phone or a personal message, before anything public" (C10) (round 1 assumption, #385 B1, B4, B5) |
| WEB-11 | Item detail screen in the main column: what it is, why it matters, who to call, what to bring, doesn't apply when. Facts checked against official sources by a human | Done (behind `VITE_FEATURE_CMS`, on in production) | #410, #411, #412, #418, #421. A person checks each fact before it ships (round 1 assumption, #385 B10) No item shows "More guidance is coming" today (0 of 37) |
| WEB-12 | Overview shows the current phase and the next open item | Done (behind `VITE_FEATURE_CMS`, on in production) | #392, #421. Reads the WEB-10 state (SE-5). The current phase is the first one not done (round 1 assumption, #385 B5) |
| WEB-13 | Phone nudge on the section screens | Partial (Announcement; Service, Obituary, Thank-yous next) | #751. Once a section is Ready, a calm line in that section's tint says the sending happens in the phone app, with a "Got it" button. Opt-in on `MarkReady`; never on The person. Dismissal is kept per device and section in `gg.cmsPhoneNudge.v1` (DATA.md §1), never synced. No Sent state on web (C2), no order (C10) |
| WEB-14 | Overview phone card, tinted per section | Done (behind `VITE_FEATURE_CMS`) | #558 built the card; this ticket tints it |

### 3.8 Phone send round (#559)

Added 2026-11-01 (Peter, #559, Decisions 1 to 4 and the G1 defaults). The phone is the send app: it takes
what was planned on web and sends it to the right people. One people list, and small last-minute edits,
not web-level editing. Web is not part of this round, so the Web column is "n/a". Row statuses are set
by the closing ticket #633.

| ID | Requirement | Web | Mobile | Notes |
|---|---|---|---|---|
| MOB-1 | One people list on the phone. The tier split is gone from the UI; `tier` stays in the data and every contact is `family`. Import from the phone's contacts and tick people | n/a | Done | #620, PR #635. Device: import from the phone contacts, HUMAN TODO. VoiceOver and TalkBack pass, HUMAN TODO. Supersedes SF-2 (mobile) |
| MOB-2 | The phone records who was messaged, on the device only, so the cards and shortcuts can read it | n/a | Done | #621, PR #636. C2 and C3 hold: no message content, no contact ids in sync |
| MOB-3 | Each message starts with the first name: "{First name}," on its own first line. No greeting when the name is empty or has digits. A per-message switch turns it off. On by default (Decision 2) | n/a | Done | #622, PR #639. Device: the line break after the name in Messages, HUMAN TODO. VoiceOver and TalkBack pass, HUMAN TODO. |
| MOB-4 | On return from Messages, the app shows "Sent to {name}? Next: {name}". One tap confirms and opens the next. Skip and Not yet stay. A send is never assumed. Next stays as the fallback when no return is detected (Decision 3, §5 item 5) | n/a | Done | #623, PR #642. Device: the prompt on return from Messages, iOS and Android, HUMAN TODO. VoiceOver and TalkBack pass, HUMAN TODO. Changes SF-4 on mobile |
| MOB-5 | Four send cards on the person screen: Announcement, Service, Obituary, Thank-you. The screen is titled "Ready to send" and the four cards look like the web Overview cards: the title, a state word at the top right (Sent, In progress or Not started), and one muted line. A done card shows a check beside "Sent". The state word is also the last word of the card's accessible name. The muted line says who was told: "Sent to {n} people" ("person" for 1, no "of M"), or "Emailed to the paper" for an obituary that was only emailed. A card that is not done shows its web-style summary, or "Needs the service date" (the first missing detail) in its place. In progress means a draft was started, a send was stopped part-way, or the obituary text waits for its link. The one next card has an accent bar and a "Continue" line, and the bottom button names it. | n/a | Done | #624, PR #638; the Overview-style cards, state words and check: #728, #733, #738. VoiceOver and TalkBack pass (state word read last, the check not read twice), HUMAN TODO. Compact done cards, one lit next card named on the bottom button; thank-yous are not lit before the service date (2026-11-05, #667). Copy: `phoneHub.json`. |
| MOB-6 | Search in the people picker | n/a | Done | #625, PR #640. VoiceOver and TalkBack pass, HUMAN TODO. |
| MOB-7 | Picker shortcuts: "Everyone you told" (people who got the announcement) and "Not sent yet" | n/a | Done | #626, PR #644. VoiceOver and TalkBack pass, HUMAN TODO. Reversal of #214 ("nothing is preselected"), decided 2026-11-05, #674: on a fresh draft the service and the obituary link start with "Everyone you told" picked (announcement recipients still saved, not yet sent this moment); the announcement and thank-yous start with nobody. Applied once, only when no draft is saved for that moment: a hand-cleared selection stays empty, and a resumed draft or mid-send never gets defaults added. Reads only the on-device record (MOB-2); nothing new syncs (C2, C3). Ready to send says "everyone you told" (with the names on the next line) when the picked people are the default. Reopening the service or obituary after a send picks the people told but not yet sent that moment. |
| MOB-8 | A short Details row on the send screen, with small inputs for the template's fields (for example date, time, place) that re-compose the message. When the text was hand-edited, the Details inputs are hidden. Service and thank-you open on the people, not the full form. The thank-you note, if any, is the last line. The service date is a native date picker and the service time is a native time picker (iOS: a spinner with Done; Android: the system dialog); each has a Clear action, and the field opens a calendar or clock, never a typed box. The service Location has place suggestions from the gateway (MOB-17); the typed text always stays the value | n/a | Done | #627, #628, PRs #643, #645; date picker #734; time picker #740. Place search: #737, #742 (MOB-17). VoiceOver and TalkBack pass, HUMAN TODO. Device: both pickers on iOS and Android, HUMAN TODO. |
| MOB-9 | Obituary in two steps (Decision 4). Step 1: email the text to the publisher with mail compose. Step 2: once it is published, the user pastes the link on the phone and texts the link message. The link is added only on the phone; it is never asked for at setup (C10). "Email it to the paper" opens the in-app compose sheet (`expo-mail-composer`) with To, subject and the obituary text; the user taps Send (C1). To comes from an optional "Publisher's email" field: exactly one address, typed (never picked from contacts, C3, C4); a comma or semicolon, or an address that does not look like name@site.tld, is refused with calm copy and nothing opens. It is kept per person on this phone only (a separate local key, never synced, DS-7). Without a usable composer it falls back to `mailto:` with To, then to the share sheet. Once the mail sheet or the share sheet has opened, the bottom button becomes "Done". Done marks the obituary done on the person screen (`obituaryEmailedAt`, set once, on this phone only, never synced) and returns to Ready to send; the link can still be pasted and texted later. A dismissed share sheet does not show Done | n/a | Done | #629, #630, #702, PRs #641, #646; Done and the device-only marker: #729, #735. Device: a long obituary in mail compose, HUMAN TODO. VoiceOver and TalkBack pass, HUMAN TODO. |
| MOB-10 | "Share elsewhere" (OS share sheet) for service and obituary. Allowed with zero people picked (Decision 1, C1) | n/a | Done | #631, PR #648. Device: the share sheet lists Facebook and WhatsApp; closing it on Android shows no error, HUMAN TODO. VoiceOver and TalkBack pass, HUMAN TODO. |
| MOB-11 | Thank-yous: an optional one-line note per person. The note is the last line of that person's message | n/a | Done | #632, PR #647. VoiceOver and TalkBack pass, HUMAN TODO. |
| MOB-12 | A fixed bottom bar on the phone's send screens: one primary button that names the next thing, at least 52 points tall, clear of the home indicator. Secondary actions sit above it as links | n/a | Done | #665: the component (`ui/ActionBar.tsx`); the hub, texting, Ready to send and the people list (Done · {n} chosen, #672) use it. TalkBack reads the Done count, HUMAN TODO. |
| MOB-13 | Ready to send: one screen with the message, a To row with the count and names, Edit wording and Change details in place, Share elsewhere for service and obituary, and one button "Text {n} people". Replaces Review your message; no Sample message (dropped 2026-11-05) | n/a | Done | #670: the screen, with Back to the person screen (the obituary: its link screen). #671: the announcement opens on it; no intro screen. Its optional note is under Change details. #673: the people list is a sheet over this screen; arriving never opens it. VoiceOver and TalkBack order (To row, then button), the keyboard not covering the message box, swipe-down on iOS and Android, VoiceOver staying inside the sheet, and TalkBack Back closing the sheet: HUMAN TODO |
| MOB-14 | Phone checklist sheet: the person screen's top button "What you'll need" (quiet text button, no More menu) and Share obituary's What you'll need button both open one sheet. It lists the four time phases in order, then "Gather when you can"; a group opens inside the same sheet with ticks. There is no "Doesn't apply" on the phone. A `not_applicable` mark saved from the web shows as done on the phone, and pressing it clears it (as on web, #605). No counts, no percentages. Ticks are saved on the person, on this phone. Screen-reader focus returns to the button when the sheet closes | n/a | Done | #697 (the sheet and group panel), #699 (the buttons; More removed), #730 (no Doesn't apply on the phone). VoiceOver and TalkBack pass, HUMAN TODO. |
| MOB-15 | Share obituary shows the obituary text (the edited text, else the draft built from the person's details) in a card with one button: "Edit the text", or "Write the text" when there is none. Editing is one plain multiline box (Save and Cancel above it); while editing, Step 2 and Continue are hidden. Every way out of the box saves first, with no confirm dialog: header Back, Continue, a person switch, and Android Back (the first press closes an open keyboard; with the keyboard closed it saves and goes back). Saving unchanged text writes nothing. Saving a changed text writes the full text to `obituaryText` on the person (a synced key, DS-7, so it syncs when sync is on); the text stops following the details once you change it, as on the web. Saving an empty box clears `obituaryText`, and the text follows the details again (a calm line says so). Cancel keeps the old text. Email and Copy use the saved text and are hidden while editing. With no text, Step 1 says "Write it above, or on the web." The published link is still added only on this screen, after publishing (C10). After the obituary is emailed, Done marks it done on this phone (MOB-9) | n/a | Done | #701; Done after emailing: #729, #735. Copy: `phoneObituary.json`. VoiceOver and TalkBack (focus on the box when editing opens, back on the Edit button after Save or Cancel, the saved line announced), the keyboard not covering the box: HUMAN TODO. |
| MOB-16 | Date of birth on the phone. The person setup screen, which is also Edit person, has an optional "Date of birth" between the name and the date of passing. It is a native date picker with a Clear action; the earliest day is January 1, 1900 and the latest is today. If the birth date is after the date they passed, a calm line says "This is after the date they passed. You can keep it." and nothing is refused. Clearing it and saving removes it. The same date of birth (1900 to today) is a field on the phone's Your account profile (MOB-18) | n/a | Done | #731 (the person), #732 (the account profile). Copy: `phonePerson.json`. Device: the picker on iOS and Android, VoiceOver and TalkBack, HUMAN TODO. |
| MOB-17 | Place search for the service Location. As the person types three or more characters in the Details row, suggestions appear under the field (a short debounce; the count is announced). Picking one writes "{name}, {address}" into Location only, never into any other field; the typed text is always the value, and on any failure the field stays a plain text box with one calm line. The phone calls the gateway, never Google: `POST /places/suggest` and `POST /places/details`, public (no sign-in), limited to 60 requests per minute per IP, with the Google key held on the server (`GOOGLE_PLACES_SERVER_KEY`) and nothing typed stored or logged. Place types are limited to `SERVICE_PLACE_TYPES` | n/a | Done | Gateway: #737 (`libs/gateway-places`). Phone: #742 (`PlaceField`). Device: suggestions with a real key, screen-reader announcement of the count, keyboard not covering the list, HUMAN TODO. The server key and the Cloudflare rate limiter binding are set outside the repo (#723): not confirmed here. |
| MOB-18 | Your account on the phone, with accounts on. It has: Profile (first name, last name, optional date of birth, optional address; first name required), Sign-in and security (the sign-in email, and "Manage sign-in", which opens the Clerk-hosted account page in the browser), Help and support (the support email address and an "Email support" button that opens the mail app), Sign out, and Delete account (MOB-19). It has no What you'll need or checklist, no Plans, no Payments and no "On your phone" section: those stay web-only. People helping you is deferred. The phone has no "Mark as ready" | n/a | Done | Profile and personal details: #732, #739. Email, Manage sign-in, Help and support: #741. Copy: `account.json`, `phoneAccount.json`. Device: Manage sign-in in the system browser and back, Email support with and without a mail app, VoiceOver and TalkBack, HUMAN TODO. |
| MOB-19 | Delete account on the phone. It is only in Your account (C9). One button opens a confirm step in place; only the second, deliberate button deletes, through Clerk. If Clerk needs a fresh sign-in first, nothing is deleted and a calm line says to sign out, sign in, and try again. When the delete works, the app drops the send flow, shows "Your account is deleted", and removes everything it keeps on the phone (every `gg.` key: people, drafts, contacts, checklist ticks, the account cache, queued syncs and publisher emails). That wipe makes no request. Other things the phone shows after sign-out stay unchanged | n/a | Done | #745 (and #732 for the screen it sits on). Device: a real delete on iOS and Android, the verify step, a restart showing a clean app, HUMAN TODO. |
| MOB-20 | The label of every button that is not the primary one (secondary, tertiary, header and ghost) is 15 points, the same as the primary label | n/a | Done | #744 (guarded in `largeText.spec`). |

---

## 4. Non-functional requirements

- **Performance:** every screen usable on a mid-range phone over a weak connection. No screen may
  wait on the network after sign-up (C5 was dropped 2026-10-30; offline is tech debt, so the web editor needs a connection only where it already does).
- **Accessibility:** tap targets and type sized for tired eyes and shaky hands; focus outlines
  visible; date/time fields keyboard- and screen-reader-accessible.
- **Reliability:** a force-quit at any point loses at most seconds of typing, never a session.
- **Privacy:** see C3–C4 (C2 was dropped 2026-10-30). Session tokens travel in `Authorization` headers, never query strings or
  cookies, and never in logs.
- **Platforms:** mobile (Expo) is the primary surface; web = plan at a desk, mobile = send; marketing is static.

---

## 5. Open questions

**Reversed by the family-sharing G1 (2026-10-11):** the read-only snapshot direction (#23, #39) is
dropped. An owner can invite family members by email, members work on the owner's people, and
person details (not messages, drafts or contacts) sync through the AWS data function. See C1, C2 (dropped 2026-10-30), C3, C5 (dropped 2026-10-30), C6,
C9, C11 in §2 and DATA.md "Shared people".

**Offline is tech debt (2026-10-30, #385).** The web editor needs a connection only where it already
does. Last saved wins. C5 is dropped; making the editor work offline is not planned in round 1.

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
   Yes / Not yet / Try again prompt (`039e459`, reverted) was rejected, because it asked a question
   about every person.
   **Reversed on mobile 2026-11-01 (Peter, G1 of #559, Decision 3).** On return from Messages the app
   shows "Sent to {name}? Next: {name}". One tap confirms and opens the next person; it replaces the
   Next tap when a return is detected, so the user taps no more than before. It differs from `039e459`: that was a 3-way
   question (Yes / Not yet / Try again); this is one tap, with Skip and Not yet kept. The reason it
   works now is that the native app state change fires reliably on the phone, unlike the web tab.
   The send job itself is not persisted; only the existing on-device `recipientsNotified` id list is
   (MOB-2). Next stays as the fallback when no return is detected. Web is unchanged: it keeps the
   single Next tap.

6. **Obituary editor (round 2)** — built from the obituary template's parts, with a full text and a short form. Both stay editable. Not in round 1 (WEB-6).

---

## 6. Architecture and rules

The standing technical rules. Break one only with the product owner's agreement, and update this
section in the same PR.

### What this is

Grievers Guidance helps people who have just lost a loved one send funeral and service details to their contacts via SMS — texted from the griever's own phone number, one contact at a time, not a bulk send from a business number. Since 2026-10-30 the web is a planning editor (plan at a desk) and the mobile app does all sending. The web editor ships behind `VITE_FEATURE_CMS`, off in production; until a later round removes it, the old web send flow stays in the flag-off build. The user is in acute grief — likely sleep-deprived, overwhelmed, and on a phone. Every product and engineering decision should be evaluated against that reality. Speed, clarity, and reliability over cleverness.

---

### UI is per app

Hooks (`libs/hooks`), shared logic (`libs/shared` and the other logic libs), copy (`libs/copy`) and tokens (`libs/tokens`) are shared by web and mobile. UI is per app: mobile owns `apps/mobile/src/ui` and must not import `@griever/ui`; web uses `libs/ui`. A spec in `apps/mobile` fails if mobile imports `@griever/ui`.

---

### Monorepo structure

```
apps/
  gateway/    Hono on Cloudflare Workers (and locally via @hono/node-server), port 3001 in dev.
              Composes libs/identity, libs/gateway-messages, libs/gateway-flows and libs/gateway-places into
              one HTTP surface (CORS + routing) — this app owns no domain logic itself.
  web/        React + Vite + Tailwind. Planning editor (behind VITE_FEATURE_CMS, off in production),
              account management, and the old browser send flow until a later round removes it.
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
                    has no live backend now that Convex is removed (#203). See DATA.md.
  contacts/         Platform-agnostic contact-import logic shared by web and mobile: the
                    `ContactSource` adapter interface, normalize/dedupe/rank, and the
                    fetch → review → commit pipeline. Device-specific adapters (the web Contact
                    Picker, mobile's expo-contacts) live in the app that owns that device API.
  identity/         The gateway's side of accounts: verifies the Clerk token and serves
                    GET/PUT /me/profile. Owns its own Hono router, mounted by apps/gateway.
                    See "Identity" below — this is who a user is, never their friends or contacts.
  gateway-messages/ The AI-drafted obituary route. No message-sending logic lives server-side —
                    sending happens entirely on-device (see "The send flow").
  gateway-auth/     The one shared helper for the gateway's domain libs:
                    Clerk token verification and the signed client for the AWS data function.
  gateway-flows/    Invite and member routes (GET /members, POST /invites, POST /invites/accept,
                    DELETE /invites/:id, DELETE /members/:memberId) and the invite mailer; mounted
                    by apps/gateway. The /flows routes are planned (#131).
  gateway-places/   Place search proxy, POST /places/suggest and /places/details, to Google Places
                    API (New) with a server key; stores and logs nothing.

  identity, gateway-messages, gateway-flows, and gateway-places each own their own Hono router and
  business logic, with no cross-imports between them — apps/gateway only composes their routers
  together. The only shared code is libs/gateway-auth (rule 2b below).
```

---

### Stack

| Layer | Tech |
|---|---|
| Mobile | Expo + React Native (core components only) |
| Web | React + Vite + Tailwind |
| Gateway | Hono on Cloudflare Workers, fronting the AWS data function |
| Accounts | Clerk |
| Data | DynamoDB behind an AWS Lambda data function (accounts, shared people). Convex and Supabase were removed (#203, #326) |
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
`apps/gateway/wrangler.toml`. `CLERK_ISSUER`, `DATA_FUNCTION_URL` and `FEATURE_AUTH` are GitHub repo
variables that the deploy workflow passes to the gateway and the web build.

---

### Running the project

```sh
pnpm dev:local web     # DynamoDB Local, data function, gateway (port 3001), Vite (port 5173)
pnpm dev:local mobile  # the same stack, gateway on 0.0.0.0, then Expo
pnpm dev:marketing     # Astro
```

---

### Architectural rules

**1. Types belong in libs/shared.**
Never define a type in an app that anything else might need. If it crosses a boundary, it goes in `libs/shared`.

**2. All API calls go through libs/api-client.**
Apps import from `libs/api-client` and call nothing else. No raw `fetch` in app code.

**2a. The gateway is the only thing that holds server credentials.**
`apps/web` calls `apps/gateway`'s REST endpoints (and Clerk, with its public publishable key). No service-role key or other server secret in `apps/web`. (This rule was about Convex before it was removed, #203.)

**2b. Identity, messages, and flows are separate libs — no cross-imports.**
`libs/identity`, `libs/gateway-messages`, `libs/gateway-flows`, and `libs/gateway-places` each own their routes and business logic independently. `apps/gateway`'s only job is composing their Hono routers into one HTTP surface (CORS + routing) — domain logic never lives in `apps/gateway` itself, and none of them ever imports another. The one exception is a single shared helper lib, `libs/gateway-auth` (Clerk token verification plus the signed calls to the data function), which the domain libs may import. It is the only shared helper; `libs/identity`, `libs/gateway-messages`, `libs/gateway-flows`, and `libs/gateway-places` still never import each other.

**3. Messages are sent from the user's own phone, never a backend.**
There is no server-side SMS provider (no Twilio, no `libs/sms`) — a bulk send from a business number reads as impersonal for a grief app. Sending is an `sms:` deep link (`buildSmsLink()` in `libs/hooks`) that opens the device's native Messages app with one contact and the message pre-filled; the user taps Send themselves, one contact at a time. Service and obituary may also hand the text to the OS share sheet or to email compose (2026-11-01, #559); that is still the user's own action each time. Nothing in this repo may add a backend message-sending path or a bulk text.

**4. hooks in libs/hooks must be platform-agnostic.**
No React Native APIs in `libs/hooks`. If a hook needs device APIs, it belongs in `apps/mobile`.

**5. The send flow state lives entirely in useSendFlow().**
No screen-level `useState` duplicating send flow logic. One hook owns it.

---

### The send flow

```
Mobile: Person → Ready to send, with the people sheet when needed → Texting → Person
Web:    Path → first form → Contact selector → Confirm → Sending → Path (with a quiet note)
        (flag-off build only: with VITE_FEATURE_CMS on, web plans and does not send)
```

On mobile the people list is a sheet over Ready to send, open only while the flow step is
'contacts' (#673). Arriving from the person screen steps on to Ready to send, so the sheet opens
only from "Change who gets this" or "Choose who to tell". Done, Close, a tap on the dim area, a
swipe down and Android Back close the sheet and keep the ticks.

On web the path is the hub (#176): there is no picker and no Sent screen. Back on a moment's first
form returns to the path; the hook's `template` step is kept for mobile and is treated by the web
flow as "exit to the path". The announcement has no service-details question: the message says
"details to follow" or carries the service details the session already has.

With `VITE_FEATURE_CMS` on, the web line above does not exist: web plans and does not send, and
the mobile line is the only send path. The web line stays only in the flag-off build until a later
round removes it.

This is the core user journey. It is driven by `useSendFlow()` from `libs/hooks`. Any change to this flow touches `libs/hooks`, `apps/web`, and `apps/mobile`.

**Sending is one contact at a time, from the user's own number — never a bulk send.** The Sending
step steps through `selectedContactIds` one at a time: "Open Messages" fires an `sms:` deep link
(`buildSmsLink()`) to the device's native Messages app with that contact and the composed message
pre-filled; the user taps Send there themselves — no web page or app can send an SMS on someone's
behalf, by OS design. Once the message has been handed off (Messages opened, shared, or copied),
the card shows "Next" ("Done" for the last person) and a way to reopen it. One tap moves on, with
no "did that send?" question for every person in what could be a long list. On web, nothing is
inferred from the tab going to the background and coming back: that signal is unreliable, and on a
desktop, where Messages opens beside the browser, it never fires. On mobile (2026-11-01, #559,
Decision 3), return from Messages shows "Sent to {name}? Next: {name}". One tap confirms and opens
the next person. Skip and Not yet stay. A send is never assumed. The native app state change fires
reliably on the phone, so this replaces the Next tap and is not a 3-way question (§5 item 5). Next
stays as the fallback when no return is detected. Web is unchanged. "Share elsewhere" (service and
obituary, MOB-10) hands the message once to the OS share sheet; the user picks where it goes and taps
send, and the app sends nothing and records no one. Nothing is
recorded as sent to a backend, and there is no delivery receipt — the user's own Messages thread
with that contact is the only record, which is *more* trustworthy to a grieving person than an
opaque "delivered ✓" from a service they've never heard of. The app itself keeps no history of what
was sent (only who was messaged, on the device; not the text) (see "What not to do").

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
is shared) — never sent to the gateway. They are **not** kept forever: the saved
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
mobile is not switched on yet. With the flag off, onboarding starts at adding contacts, `useAccount` is not used, and sync
never starts (it needs a signed-in `userId`).

Accounts are Clerk. The client signs up, signs in, and signs out through Clerk's own screens on web (they show Clerk's own sign-in error copy; `libs/hooks/src/accountCache.ts` holds only the app's own account-error copy). Mobile signs up with its own `SignUpScreen` using Clerk's `useSignUp`. The
session lives in Clerk and is read through the `useAccount` hook (`libs/hooks`). Facebook
sign-in is planned later (#36); Instagram is dropped (personal accounts have no login API, and
Instagram never supplies an email); Google and X are not built. Nothing in this repo talks to
Facebook's or Instagram's OAuth endpoints today.

`libs/identity` is the gateway's side, and it answers one question, **who is this**. The token check lives in `libs/gateway-auth`; `libs/identity` uses it:

- `clerkAuth` (`libs/gateway-auth/src/clerkAuth.ts`) verifies the caller's Clerk session token against
  the issuer's published keys (`CLERK_ISSUER`); a wrong or missing issuer is a 401.
- `profileRouter` serves `GET/PUT /me/profile` (the sender name) through the AWS data function,
  as the signed-in caller. With `DATA_FUNCTION_URL` unset the routes answer 503.
- Invitations: `POST /invites` creates the invite and emails the link (via Resend, from
  `INVITE_FROM_EMAIL`, pointing at `WEB_URL`); if the email cannot be sent the invite is revoked and
  the caller gets a calm 503. The routes live in `libs/gateway-flows`.
- Sign-in errors use one generic message whether the email exists or not, so a failed attempt never
  confirms which one (the copy lives in `libs/hooks/src/accountCache.ts`).
- **The Convex `/sync/pull` and `/sync/push` routes were removed (#203).** They never worked in
  production (`requireUser` dev stub, `GG_DEV_AUTH`). Person details sync through the AWS data function (`flows`, #130). Nothing in the web send flow
  (`useSessions`, `useSendFlow`) writes into `libs/data-local`'s screen-keyed store, and the web app
  no longer registers any sync; see DATA.md.
- **Family sharing (decided at G1, 2026-10-11; not built yet).** An owner adds members only by
  typing an email (C6). Still **no service-role key**: invites use our own single-use token, and a
  joiner redeems it through the data function under their own Clerk token. Members can't create a person (C11), enforced by the data function. Tickets: #116, #117, #121,
  #122, #128, #130.

**Accounts live in the data function's `profiles` items** (see "Accounts boundary" under Database). The Convex
backend, with its `identities`, `profiles`, `sessions` and `counters` tables, was removed (#37,
#203). Everything else in this repo reaches a user only by their opaque `userId`.

**What sign-in is not, and cannot become:** it does not, and cannot, give this app a friends list
or a way to message someone's contacts. Facebook's `user_friends` permission only ever returns
friends who *also* use this app and have separately granted it, never a person's real friend list,
and neither Facebook nor Instagram has an API for a personal account to DM another personal
account. Sign-in is identity only; reaching a person's contacts is still the device/manual/Share-sheet
path described under "Contacts" and "The send flow". The two never merge.

---

### Shared keys and caps

`libs/shared/src/flowDetails.ts` is the one list of what may sync for a person. `SYNCED_KEYS` is the
six facts (`libs/shared/src/flowFacts.ts`) plus the detail keys (`FLOW_DETAIL_KEYS`), with
`FLOW_DETAIL_MAX_LENGTH` caps. The gateway and the data function both validate keys and lengths
(C8) from this list. Adding a key is a privacy decision: it needs a change to DS-7 and DATA.md in the
same PR. See `docs/adr/0001-person-details-sync.md`.

### Database

DynamoDB, behind the AWS data function, is the only server database. Convex and Supabase were removed
(#203, #326). See `DATA.md` for the data architecture (the screen-keyed local session document and
the shared-people design).

Contact data is never sent to the gateway or the data function. Contact *ids* never appear in shared person
sync (C3). Message content is never stored on a server and never logged (C2 still applies in the flag-off build), and there is no send history —
it is composed client-side and handed to the device's own Messages app at send time (see "The send flow").

**Accounts boundary.** App state tied to an account (the profile: sender name and contact source; the
email lives in Clerk) is stored in DynamoDB by the data function, and a user reaches only their own
profile, with no delete path (C9). Contacts, drafts and message content stay on the device and reach no
server (C2 was dropped 2026-10-30 for planning text on the device; C3, C4); only person details sync. Shared people details live in the same table
(`flows` plus memberships, #116, #130); see DATA.md "Shared people".

---

### Environment variables

```
apps/gateway  PORT, CORS_ORIGINS, ANTHROPIC_API_KEY,
              CLERK_ISSUER, CLERK_AUTHORIZED_PARTIES (public wrangler [vars])
              INVITE_FROM_EMAIL, WEB_URL (wrangler [vars]), RESEND_API_KEY (Worker secret, set by
              deploy.yml from the GitHub secret; skipped when empty, and a key already on the
              Worker stays; to remove it: `wrangler secret delete RESEND_API_KEY --config
              apps/gateway/wrangler.toml`; with no key, POST /invites answers 503)
              DATA_FUNCTION_URL (wrangler var; deploy.yml sets it from the repo variable of the
              same name, empty = /me/* answers 503), DATA_FUNCTION_REGION (wrangler var, us-east-2;
              no code default), DATA_FUNCTION_ACCESS_KEY_ID and DATA_FUNCTION_SECRET_ACCESS_KEY
              (Worker secrets, set by deploy.yml from the GitHub secrets; both skipped when
              either is empty; rotate every 90 days: docs/aws-data-function.md)
              GOOGLE_PLACES_SERVER_KEY (Worker secret, set by deploy.yml from the GitHub
              secret; skipped when empty, and a key already on the Worker stays; to remove it:
              `wrangler secret delete GOOGLE_PLACES_SERVER_KEY --config apps/gateway/wrangler.toml`;
              a server key restricted to Places API (New), separate from the web browser key;
              with no key, POST /places/suggest and POST /places/details answer 503)
apps/web      VITE_API_URL, VITE_FEATURE_AUTH ("true" enables sign-up/sign-in; default off),
              VITE_CLERK_PUBLISHABLE_KEY (read only when the flag is on)
              VITE_FEATURE_SHARING ("true" enables sharing; default off)
              VITE_FEATURE_OBITUARY_DRAFTING ("true" enables AI obituary drafting; default off)
              VITE_FEATURE_CMS ("true" enables the web editor, WEB-1 to WEB-8; default off; on in production)
apps/mobile   EXPO_PUBLIC_API_URL
```

Production repo variables (public, not secrets): `CLERK_ISSUER`, `CLERK_PUBLISHABLE_KEY`, `FEATURE_AUTH`, `FEATURE_SHARING`
(off until the PO sets it to `true`), `DATA_FUNCTION_URL`. The gateway's Worker secrets are `RESEND_API_KEY`,
`DATA_FUNCTION_ACCESS_KEY_ID`, `DATA_FUNCTION_SECRET_ACCESS_KEY`, `CLERK_WEBHOOK_SECRET`,
`DATA_FUNCTION_SERVICE_SECRET` and `GOOGLE_PLACES_SERVER_KEY` (from the repo secrets of the same names).
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
- No backend SMS-sending path (no Twilio, no `libs/sms`, no server-side send route) and no bulk text. The share sheet and email compose are allowed for service and obituary only as the user's own action — see rule 3
- No shared types defined in apps
- No contact data reaches the gateway — on-device storage only (see "Contacts"), and never more than the 6 named `Contact` fields
- No raw provider payload (photo, provider ID, labels, etc.) kept past the picker/import screen — normalize down to the 7 `Contact` fields immediately
- No message content stored on a server, in logs, or as a send history; nothing to view or restore once sent (the user's own Messages app is the only record). Planning text written in the web editor is stored on the device; nothing is sent from web (C2 dropped 2026-10-30)
- No send path on web (C1): the web editor plans; the phone sends
- No exclamation points in user-facing copy
- No `npm` or `yarn` — pnpm only
- No gateway routes without request body/query validation
- No cross-imports between `libs/identity`, `libs/gateway-messages`, `libs/gateway-flows`, and `libs/gateway-places` (only `libs/gateway-auth` is shared)
- No contact ids in flow sync (C3), and no invitee picked from contacts: the owner types the email (C6)
- No service-role key anywhere (see "Identity")
- No friends-list or peer-to-peer DM API calls to Facebook or Instagram — see "Identity"; neither platform allows either for a personal contact, regardless of sign-in

---

### When you're unsure

This app exists because losing someone is hard enough without also managing logistics. If a decision makes the app faster or simpler for a grieving user, it's probably right. If it adds friction or complexity for the sake of technical elegance, reconsider it.
