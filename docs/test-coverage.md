# Test coverage map

Which tests prove which requirement. Source of truth for the requirements is `REQUIREMENTS.md`;
this file is a map, not a spec. Only tests that would fail if the behaviour broke are listed.
Written for issue #11 on 2026-10-11. Update it in the PR that adds or removes a test for a row.

Spec paths are relative to the repo root. `(new, #11)` marks tests added with this map.
E2E specs run in CI only and are listed but were not run for this map.

Summary: constraints 4 covered, 5 partial, 1 not covered. Requirement rows (Done or Partial
only) 10 covered, 9 partial, 6 not covered, out of 25.

## Constraints

| # | Status | Proof | Gap |
|---|---|---|---|
| C1 one recipient per `sms:` | Covered | `libs/hooks/src/smsLink.spec.ts` "addresses exactly one recipient"; `apps/web/src/screens/SendingScreen.spec.tsx` (new, #11) walks three people and checks each link carries only that person's number; `libs/hooks/src/useSendFlow.spec.ts` "makes only the first recipient active"; `apps/gateway/src/routes.spec.ts` (new, #11) fails if a new gateway route appears, so a backend SMS path cannot be added unnoticed; `apps/web-e2e/src/announce.spec.ts` "sends one person at a time, then finishes (C1)" | Mobile `SendingScreen` has no test |
| C2 message content never stored | Partial | `libs/hooks/src/useSendFlow.spec.ts` "never restores an in-progress send job from a draft (C2...)", "reports drafts without the send job"; `libs/shared/src/shareSnapshot.spec.ts` "never includes ... message bodies"; `apps/mobile/src/app/sessions.spec.tsx` "does not keep a finished send as a draft" | Nothing asserts the composed message text is absent from localStorage / AsyncStorage / IndexedDB after a send. Nothing checks logs |
| C3 contact data never reaches the gateway | Partial | `libs/shared/src/shareSnapshot.spec.ts` "never includes contacts, contact ids, phones, emails..."; `apps/web/src/screens/PathLanding.spec.tsx` "shares the checklist ... without contacts (C10, C3)"; `apps/gateway/src/routes.spec.ts` (new, #11) pins the route list | The `sync/push` route was removed (#203), so that gap is closed. Gateway routes are not checked for contact-shaped bodies |
| C4 only the narrow contact fields survive | Covered | `libs/contacts/src/narrowing.spec.ts` (new, #11) feeds a wide provider object (address, birthday, photo, notes, provider id) and checks none of it comes out of `runImport`; `apps/web/src/app/app.spec.tsx` "keeps contact names and numbers out of localStorage" | Documentation mismatch: `Contact` in `libs/shared/src/types.ts` has 7 fields (`createdAt` as well as the 6 in C4). `createdAt` is not personal data; C4 or the type should be updated by the architect. No test covers the mobile contact write path |
| C5 offline-first | Partial | `apps/web/src/app/savedAsYouGo.spec.tsx` "never waits on the network when Continue moves on"; `apps/web/src/app/app.auth.spec.tsx` "signs in without waiting on the name check"; `libs/hooks/src/useSupabaseIdentity.spec.ts` offline and cached-name cases; `apps/mobile/src/app/sessions.spec.tsx` "makes no network calls"; `apps/web-e2e/src/onboarding.spec.ts` "keeps working with the network cut off after load (C5)" | Web send flow with `fetch` rejected is not unit-tested; mobile flows other than sessions are not |
| C6 sign-in is identity only | NOT COVERED | Email sign-in is tested (see ID-3), but nothing fails if a friends list or DM path were added | A test needs a decision on what to assert, for example that the auth client requests no social scopes once Facebook (#36) lands. Raise with the architect then |
| C7 calm copy, no "!" | Covered | `libs/shared/src/copyTone.spec.ts` (new, #11): every exported template, in each tone and service variant, plus names, descriptions, labels and placeholders; `apps/web/src/copyTone.spec.ts` (new, #11): source scan of `apps/web/src` and `apps/mobile/src` for "!" in strings and JSX text; `libs/shared/src/shareSnapshot.spec.ts` "has no exclamation points (C7)" | The scan is a heuristic: copy assembled from pieces, is not seen. "No celebratory microcopy" beyond "!" is a human review item. |
| C8 gateway routes validate input | Covered | `apps/gateway/src/worker.spec.ts` (sync pull/push, obituary, profile PUT 400s); `apps/gateway/src/routes.spec.ts` (new, #11): the served route list must equal a known list, and each public-input route refuses an empty request (400) or a missing token (401) | The inventory proves a decision was recorded for each route, not that a new route's validation is good |
| C9 no delete inside a flow | Partial | `apps/mobile/src/app/sessions.spec.tsx` "offers no way to delete a person" | Web has no equivalent. Follow-up (lives in `apps/web/src/app/app.tsx`, in flight elsewhere): render the web flow and assert no delete/remove control or swipe action |
| C10 real planning order | Partial | `apps/web/src/screens/PathLanding.spec.tsx` (real checklist order); `apps/web-e2e/src/onboarding.spec.ts` "reaches one next thing" (obituary comes later, not first) | Nothing asserts setup never asks for an obituary link; mobile has no path landing |

## Requirement rows (status Done or Partial)

| ID | Result | Proof | Gap |
|---|---|---|---|
| ID-3 email auth | Covered | `libs/api-client/src/supabaseAuth.spec.ts`; `libs/hooks/src/useSupabaseIdentity.spec.ts`; `apps/web/src/screens/SignUp.spec.tsx`, `CreateAccount.spec.tsx`, `Profile.spec.tsx`; `apps/web/src/app/app.auth.spec.tsx`; `apps/mobile/src/screens/account.spec.tsx`, `apps/mobile/src/app/App.flagOn.spec.tsx`; `libs/identity/src/profileRouter.spec.ts` | "Passwords never reach the gateway" is not asserted |
| ID-7 account before session | Partial | `apps/web/src/app/app.auth.spec.tsx` (flag off goes straight to contacts; sign-in does not wait) | Mobile has no equivalent |
| CT-1 import from device | Partial | `libs/contacts/src/devicePickerSource.spec.ts`; `apps/mobile/src/lib/expoContactsSource.native.spec.ts`; `libs/contacts/src/importFlow.spec.ts` | Web `ImportContacts` screen has no test |
| CT-2 manual entry | Partial | `apps/web/src/screens/AddContactsManual.spec.tsx`; `apps/web/src/app/app.spec.tsx` (enable rule, bad number) | Mobile manual entry has no test |
| CT-3 normalize, dedupe, rank | Covered | `libs/contacts/src/normalize.spec.ts`; `libs/contacts/src/importFlow.spec.ts` | None |
| CT-4 on-device only | Partial | `apps/web/src/app/app.spec.tsx` "keeps contact names and numbers out of localStorage"; `libs/contacts/src/narrowing.spec.ts` (new, #11) | `libs/data-local` `contactStore` has no spec; mobile AsyncStorage path has none |
| CT-5 30-day clear | Covered | `apps/web/src/app/retention.spec.tsx`; `libs/hooks/src/useSessions.spec.ts` | None |
| CT-6 no contacts, no restored session | NOT COVERED | none | `libs/data-sync/src/lifecycle.spec.ts` "is openable once local contacts cover every referenced recipient id" covers the rule in the lib, but no screen test shows a device without contacts declining to restore. Follow-up |
| SE-1 details asked once | Covered (web) | `apps/web/src/app/app.spec.tsx` "walks contacts -> ... -> one next thing"; `libs/hooks/src/useSendFlow.spec.ts` "composes the message from the session" | Mobile still asks again per template (status says Partial) |
| SE-2 sessions survive relaunch | Covered | `apps/web/src/app/savedAsYouGo.spec.tsx` (reopen cases); `apps/web/src/app/app.spec.tsx` "sends a returning visitor straight back"; `apps/mobile/src/app/sessions.spec.tsx` "restores both people and the open one after a relaunch"; `apps/web-e2e/src/onboarding.spec.ts` reload | None |
| SE-3 multiple sessions | Partial | `apps/mobile/src/app/sessions.spec.tsx`; `apps/web/src/app/savedAsYouGo.spec.tsx` "reopens the most recently opened of two named sessions" | No web test starts "Someone else I've lost" and switches. `useSessions.ts` is covered only for retention. Follow-up (`useSessions.ts` is in flight elsewhere) |
| SE-4 guided path landing | Covered | `apps/web/src/screens/PathLanding.spec.tsx`; `apps/web-e2e/src/onboarding.spec.ts`, `a11y.spec.ts` | None |
| SE-5 checklist ticks persist | NOT COVERED | none | `libs/data-local/src/accountStore.ts` has no spec |
| SF-1 send flow driven by `useSendFlow` | Covered | `libs/hooks/src/useSendFlow.spec.ts`; `apps/web/src/app/app.spec.tsx`; `apps/web-e2e/src/announce.spec.ts` | Mobile flow has App-level specs only |
| SF-2 close family first | Partial | `apps/web/src/screens/WhoHearsFirst.spec.tsx`; `AddContactsManual.spec.tsx`; `apps/web-e2e/src/onboarding.spec.ts` | `WideningCircle` has no test |
| SF-3 one at a time, `sms:` link | Covered (web) | `libs/hooks/src/smsLink.spec.ts`; `apps/web/src/screens/SendingScreen.spec.tsx` (new, #11); `apps/web-e2e/src/announce.spec.ts` | Mobile `SendingScreen` has no test |
| SF-4 one "Next" tap, "Done" last | Covered (web) | `apps/web/src/screens/SendingScreen.spec.tsx` (new, #11) "names only the person it is on, and offers Done on the last one"; `libs/hooks/src/useSendFlow.spec.ts` "advances through sent and skipped"; `apps/web-e2e/src/announce.spec.ts` | Mobile has none |
| SF-5 share with clipboard fallback | Partial | `apps/web/src/screens/ShareDetailsButton.spec.tsx` (full matrix for the service-details share) | The Share / Copy message button inside `SendingScreen` is not tested |
| SF-6 AI obituary | Partial | `apps/gateway/src/worker.spec.ts` (draft from the facts given, 502, no key) | `ObituaryScreen` (flag off: disabled with "in beta"; flag on) and `ShareObituary` have no test. Follow-up |
| SF-7 announcement form, no required fields | Covered | `apps/web/src/app/savedAsYouGo.spec.tsx` "keeps the announcement note and reopens on that step"; `apps/web-e2e/src/announce.spec.ts` | None |
| DS-1 cursor sync via gateway | Removed (#203) | `libs/data-sync/src/cursorClient.spec.ts`, `merge.spec.ts`, `lifecycle.spec.ts` (unused client code); `apps/gateway/src/worker.spec.ts` "the removed /sync routes answer 404" | No backend exists |
| DS-3 sync invisible | NOT COVERED | none | Needs a screen test that no spinner or "saving" text appears while the outbox flushes |
| DS-4 soft-delete, 90-day purge | Removed (#203) | none | The Convex cron was removed |
| DS-5 delete everything | NOT COVERED | none | No settings UI yet; test with the feature |
| MK-1 marketing site | NOT COVERED | none | `apps/marketing` has no tests |

## Coverage report and threshold

There is no coverage report or threshold in CI yet (second acceptance item of #11). Recommended
as a separate ticket: add `@vitest/coverage-v8`, report only at first, then set a floor per
project from the measured baseline.

## Follow-ups, split by who can do them now

Not touching files other PRs are changing:

1. Mobile `SendingScreen`, `ConfirmScreen`, `ContactSelectorScreen` specs (SF-1, SF-3, SF-4, C1 on mobile). Jest, `@testing-library/react-native`.
2. `libs/data-local` specs for `contactStore`, `accountStore` (CT-4, SE-5).
3. Web `ImportContacts` spec (CT-1) and `WideningCircle` spec (SF-2).
4. Web `ObituaryScreen` (flag off and on) and `ShareObituary` specs (SF-6).
5. A C2 test: after a full send, scan localStorage and IndexedDB for the composed message.
6. A C3 test on the sync outbox payload (ids only).
7. Coverage report and threshold in CI.

Blocked until in-flight PRs land (`app.tsx`, `app.auth.spec.tsx`, `useSendFlow.ts`, `useSessions.ts`, mobile `App.tsx`):

8. Web C9: no delete or remove control in any flow.
9. SE-3: web "Someone else I've lost" switching test, and `useSessions` beyond retention.
10. CT-6: a device with no contacts does not restore a session (screen level).
11. C10: setup never asks for an obituary link.

## HUMAN TODO (code cannot prove these)

- A real iPhone and a real Android phone: "Open Messages" opens Messages with the right person and text, and the `&` vs `?` separator is honoured.
- VoiceOver and TalkBack passes over the send flow and the sign-up screens.
- A slow or lossy network, and airplane mode on a real phone, through a full send.
- The Contact Picker on Android Chrome and `expo-contacts` permission prompts on a device.
- Reading all copy aloud for tone: "no celebratory microcopy" is a judgement a scan cannot make.
