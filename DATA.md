# Data architecture — Griever Guidance

Companion to `README.md`. The README describes what the twenty screens *are*; this document
describes where their data lives, what shape it has, and how it gets to a server and back.

**Posture: offline-first, local-authoritative.** The device is the source of truth for the session
the user is working in. The server is a backup and a hand-off mechanism between that user's own
devices and, for person details, the owner's members — never a gatekeeper. Nothing in the flow may block on a network round-trip. This follows
directly from the product's central promise, printed on three screens: *"Everything is saved as you
go. You can stop and come back."*

**Settled with the product owner (Sep 2026).** Account before session, always — sign-up needs a
connection, everything after it works offline. Contacts never leave the device, and a device without
them does not restore a session. Deleted sessions soft-delete and hard-purge at 90 days. Previous
sessions are openable by swapping in. C3's checklist ticks persist, silently, per *account*.

---

## 1. Storage layers on the device

Three stores, each with one job. Do not spread the same data across two of them.

| Store | Holds | Why |
| --- | --- | --- |
| `localStorage` | Pointers and tiny scalars only: `gg.userId`, `gg.activeSessionId`, `gg.syncCursor`, `gg.authProvider`, `gg.lastSyncAt` | Synchronous read at boot. The app must know *which* session to hydrate before the first paint, without awaiting IndexedDB. |
| **IndexedDB** (`gg` database) | `sessions` (the active session document), `contacts`, `outbox`, `sendJobs`, `attachments` | Structured, large, transactional. The session document is a nested object; localStorage would mean re-serializing the whole thing on every keystroke. |
| IndexedDB, account-scoped | `account` store: `checklistTicks` (C3), contact tiers | Outlives any one session — see §2 and §3 |
| **Device capabilities** | Contacts picker, notification scheduling (reminders), share sheet, SMS handoff | Native/OS-owned. Never mirrored to the server. See §6. |

### IndexedDB object stores

```
gg (version 1)
├── sessions       keyPath: sessionId        index: byUpdatedAt, byStatus
├── contacts       keyPath: contactId        index: byTier, bySource
├── outbox         keyPath: opId (autoInc)   index: byCreatedAt          ← §5
├── sendJobs       keyPath: jobId            index: bySessionId
├── account        keyPath: key                                          ← checklistTicks, senderName
└── meta           keyPath: key                                          ← schema version, cursor mirror
```

Writes are debounced **250 ms** and committed on `visibilitychange`, `pagehide` and `freeze`.
A keystroke must never await a write; a backgrounded tab must never lose one.

---

## 2. The session schema

One session = one person the user has lost. It is a **screen-keyed document**: each screen in the
experience is a key, and everything that screen owns — its progress and the values entered on it —
lives under that key.

```js
{
  schemaVersion: 1,
  sessionId:  "ses_01J8…",        // ULID, generated on device
  userId:     "usr_01J8…",        // the only link to the account (§3)
  createdAt:  1780000000000,
  updatedAt:  1780000000000,      // max(screen.updatedAt) — the local high-water mark
  lastOpenedAt: 1780000000000,
  status:     "in_progress",      // 'in_progress' | 'sent' | 'archived'

  screens: {
    // key = the screen id used in README.md
    L3: { status: "complete", updatedAt: …, values: {
            personName: "Margaret Hayes", dateOfPassing: "2026-05-29", senderName: "Anna" } },

    D5: { status: "complete", updatedAt: …, values: {
            hearsFirstIds: ["ctc_…", "ctc_…"] } },

    C1: { status: "active",   updatedAt: …, values: {
            moments: [ { key: "announce", status: "done",  completedAt: …, recipientCount: 8 },
                       { key: "service",  status: "next"  },
                       { key: "obituary", status: "later" },
                       { key: "thanks",   status: "later" } ] } },

    C2: { status: "complete", updatedAt: …, values: {
            momentKey: "service", arrangementsMade: false, remindAt: … } },

    C3: { status: "seen",     updatedAt: … },   // status only — the ticks are account-level, not
                                                // session-level. See §2.1.

    C4: { status: "pending",  updatedAt: …, values: {
            obituaryUrl: null, obituaryPublisher: null } },

    A2: { status: "pending",  updatedAt: …, values: {
            serviceDate: null, serviceTime: null,
            servicePlace: { placeId: null, name: null, formattedAddress: null },
            serviceNotes: null } },

    A3: { status: "pending",  updatedAt: …, values: { selectedContactIds: [] } },

    A4: { status: "pending",  updatedAt: …, values: {
            includeFlowers: false, floristId: null, customFlorist: null,
            flowerDeliveryTarget: "service" } },

    B1: { status: "pending",  updatedAt: …, values: { personalNote: null } },
    B2: { status: "pending",  updatedAt: …, values: { serviceDetailsKnown: false } },
    B3: { status: "pending",  updatedAt: …, values: { selectedContactIds: [] } },
    B4: { status: "pending",  updatedAt: …, values: { messageOverride: null, tone: "default" } },
    B5: { status: "pending",  updatedAt: …, values: { sendJobId: null } },

    C5: { status: "pending",  updatedAt: …, values: {
            selectedContactIds: [], excludedContactIds: [] } }
  },

  cursorScreen: "A2"              // what Continue resumes to (L2's one surviving idea)
}
```

**Rules that keep this shape honest:**

1. **A value is owned by exactly one screen.** The person's name lives in `screens.L3.values` and
   nowhere else. Every other screen reads it through a selector (`selectPerson(session)`). No
   copying — the README's whole session model collapses if two screens can disagree about a name.
2. **`composedMessage` is never stored.** It is derived from L3 + A2/B1/B2 + the flowers toggle on
   every render. The one exception is a user edit (B4 "Edit wording"), which pins the text into
   `screens.B4.values.messageOverride` and stops derivation (Convex design only; never synced in shared sync, §5).
3. **`screen.status`** is one of `pending` · `active` · `complete` · `seen` · `skipped`. It is what
   C1's path view and the C2 gate read; it is never inferred by checking whether fields are empty.
4. **`screen.updatedAt` is per-screen.** This is the load-bearing reason for the screen-keyed shape:
   it makes multi-device merges field-group-level rather than document-level (§5.4). A user who
   fills A2 on their phone and B1 on a tablet loses nothing.
5. **Adding a screen is additive.** Unknown keys are preserved verbatim through read/merge/write, so
   an old client never destroys a newer client's data. Bump `schemaVersion` only for renames or
   value-shape changes, and ship a forward migration keyed on it in `libs/session/migrations.ts`.
6. **Contacts are not in the session.** They are account-level and shared across sessions (see
   README's State Management); the session stores only contact *ids*.

### 2.0 In-progress message drafts: one per moment

The flow's working state is kept per moment, so starting one moment never overwrites another that
is half done ("Everything is saved on this phone as you go"):

```js
drafts: {                       // keyed by template category: announcement | service | obituary | aftercare
  announcement: { step, templateCategory, fields, selectedContactIds, messageOverride, … },
  service:      { … }
},
draftsUpdatedAt: { announcement: "2026-10-11T10:00:00.000Z", … }   // which one reopens
```

- Starting a moment resumes its own draft if it is in progress (never `sending` or `sent`; a draft
  on the picker resumes at the moment's first form), otherwise starts that moment fresh. Writing a
  draft touches only its own key.
- The app reopens the in-progress draft with the latest `draftsUpdatedAt`.
- C2: a draft at `sent` keeps only its moment and who was messaged; the typed fields, the edited
  wording and the place are dropped, per moment.
- A draft with no moment chosen yet is not kept (there is nothing in it to lose).
- Migration at load: the older single `draft` moves to `drafts[draft.templateCategory]` (dropped
  when no moment was chosen) and the `draft` key is removed. If an old `draft` sits next to
  existing `drafts` (a rollback, then an upgrade), `drafts` wins and the old `draft` is ignored.

### 2.0a Shared-person fields on the local session (`gg.sessions.v1`)

The local session list (`gg.sessions.v1`, written by `useSessions`) gains three fields. They are
additive: an older list loads, and the file keeps its key and shape.

```js
{ id: "s-…",                  // local key; never changes, never sent
  flowId: "3f2b…-4…",         // UUID v4 made on the device; the person's id on the server
  ownerId: null,              // account that owns the person; null = made here, not tied to an account
  role: "owner",              // 'owner' | 'member' (default 'owner')
  … }                         // everything else as before
```

- `flowId` comes from `crypto.randomUUID`, else a v4 built from `crypto.getRandomValues`, else from
  `Math.random` (Hermes may lack both). A session saved before this change gets one at load; it is
  saved straight away and is the same on every later load.
- Applying what the server returns (`applyRemoteFlows`) can change only the whitelisted fact fields
  (`personName`, `dateOfPassing`, `serviceDate`, `obituaryUrl`, `obituaryPublisher`, `serviceReady`)
  plus `ownerId` and `role`. A field with an unsent local edit keeps the local value. A flow not on
  the device becomes a `role: 'member'` session. A `member` session whose flow is no longer
  returned is removed (access was lost); an `owner` session is never removed. Drafts, contacts,
  `recipientsNotified`, reminders and `messageOverride` are never read from or written by it.

### 2.1 The C3 checklist lives on the account

The ticks persist — silently, as decided — but they belong to the **account**, not the session:
`users.checklistTicks: string[]` server-side, mirrored into the local `account` store. Someone
returning a year later for a second loss sees the paperwork they already gathered still ticked;
nobody re-ticks a military discharge record they found in 2026.

The copy's promise is absolute and is a build requirement, not a preference: **never notify, never
nag, never badge, never count.** A persisted tick may only ever be read back onto C3 itself. If any
future surface (C1's path, a reminder, a settings summary) wants to read `checklistTicks`, the
answer is no.

### Session lifecycle

- **One session is resident.** `gg.activeSessionId` names it; it is the only document in the local
  `sessions` store.
- **Previous sessions are not on the device.** They live server-side and are listed by a lightweight
  index query (id, person name, date, status, counts) — enough to render a picker without pulling
  documents.
- **Opening a previous session:** flush the resident session's outbox → confirm the server has it →
  pull the chosen document → write it as resident → delete the previous document locally. The
  order matters: never delete before the flush acknowledges. If the flush fails, refuse the swap
  and say so plainly ("We couldn't back up what you were working on. Try again when you have signal.")
- **Sent history spans all sessions** (A6) and is served from the server index, cached read-only.

### A device with no contacts does not restore a session

Because contacts never leave the device (§5), a session pulled onto a fresh install would render
recipient ids that resolve to no names — a screen that says "8 people" and can't say who. So:

**A session may only become resident on a device that can resolve its recipients.** On first launch
after sign-in, the cursor-0 pull populates the *session index* (names, dates, counts) but makes no
session resident. The user starts fresh: contacts first, then a session. Past sessions remain
listed, and a list row becomes openable once the local contact store covers its recipient ids
(matched by normalized E.164 number, so a re-import restores the link rather than duplicating it).

Screen copy for a non-openable row — plain, no apology-shaped error: "This one was written on
another phone. Bring your contacts across and you'll be able to open it."

This is a deliberate trade: the server backs up *what was written* so it isn't lost, and multi-device
is a restore story, not a live one.

---

## 3. Server tables (Convex)

Two tables, as specified. Both carry the sync envelope described in §4.

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const syncFields = {
  seq:        v.number(),           // server-assigned monotonic sequence — the sync cursor
  updatedAt:  v.number(),           // server clock, ms
  deletedAt:  v.union(v.number(), v.null()),   // soft delete; rows are never removed
  deviceId:   v.string(),           // which device last wrote (for diagnostics, not merge)
};

export default defineSchema({
  users: defineTable({
    userId:        v.string(),      // "usr_…" — the app-level id; the only link to sessions
    authProvider:  v.union(v.literal("google"), v.literal("facebook"),
                           v.literal("x"), v.literal("password")),
    providerSub:   v.string(),      // provider subject / hashed email for password accounts
    email:         v.union(v.string(), v.null()),
    emailVerified: v.boolean(),     // recorded, NEVER gates anything (README D2)
    senderName:    v.union(v.string(), v.null()),
    contactSource: v.union(v.literal("imported"), v.literal("manual")),
    checklistTicks: v.array(v.string()),   // C3 item keys — account-level, carries across sessions (§2.1)
    createdAt:     v.number(),
    ...syncFields,
  }).index("by_userId", ["userId"])
    .index("by_provider", ["authProvider", "providerSub"])
    .index("by_seq", ["seq"]),

  sessions: defineTable({
    sessionId:     v.string(),      // ULID from the device — the client owns id generation
    userId:        v.string(),      // the unique-ID binding; no other user data is denormalized here
    schemaVersion: v.number(),
    status:        v.union(v.literal("in_progress"), v.literal("sent"), v.literal("archived")),
    // the screen-keyed document, stored whole. v.any() is deliberate: the server does not
    // interpret screen contents, so screens can be added client-side without a server deploy.
    screens:       v.any(),
    cursorScreen:  v.union(v.string(), v.null()),
    // denormalized for the previous-sessions picker, so listing never reads `screens`
    personName:    v.union(v.string(), v.null()),
    dateOfPassing: v.union(v.string(), v.null()),
    lastOpenedAt:  v.number(),
    createdAt:     v.number(),
    ...syncFields,
  }).index("by_sessionId", ["sessionId"])
    .index("by_user", ["userId", "lastOpenedAt"])
    .index("by_user_seq", ["userId", "seq"]),   // ← the pull query's index
});
```

**Minimal user record, by design.** No name-of-the-deceased, no contacts, no message bodies on the
`users` row. Sessions are bound to the account by `userId` and nothing else — so a user can be
deleted by nulling their `users` row without orphan cleanup, and a session document is meaningless
without it.

**The server never parses `screens`.** Only `personName` / `dateOfPassing` / `status` are lifted out
for listing, written by the client on push. This is what lets the design team add screen keys
without a backend change.

---

## 4. Cursor-based synchronization

Single user, multiple devices, no collaboration. That lets us use a **high-water-mark cursor** and
skip conflict resolution machinery entirely.

### 4.1 The sequence

A single per-user counter in a `counters` scratch document, incremented inside the same Convex
mutation transaction as the row write. Every write to `users` or `sessions` gets the next `seq` for
that user. `seq` is therefore total-ordered per user, gapless, and never reused.

Do **not** use timestamps as the cursor. Two writes in the same millisecond, or a device with a
skewed clock, silently drop rows from a `>` comparison.

### 4.2 Pull

```ts
// convex/sync.ts
export const pull = query({
  args: { cursor: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, { cursor, limit = 100 }) => {
    const userId = await requireUser(ctx);
    const rows = await ctx.db.query("sessions")
      .withIndex("by_user_seq", q => q.eq("userId", userId).gt("seq", cursor))
      .order("asc").take(limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      sessions: page,                                   // includes soft-deleted rows
      cursor: page.length ? page[page.length - 1].seq : cursor,
      hasMore,
    };
  },
});
```

- Client stores the returned `cursor` in `localStorage` (`gg.syncCursor`) and passes it next time.
- **Loop until `hasMore` is false** before treating the cursor as current.
- `cursor: 0` = full resync. First launch on a new device, or after a local wipe.
- Soft-deleted rows come back in the page with `deletedAt` set; the client deletes locally on seeing
  them. This is the whole reason for soft deletes — a hard delete is invisible to a cursor pull.
- Convex's reactive queries mean `pull` can be *subscribed* rather than polled: while the app is
  open and online, a new `seq` on another device pushes the delta down live. Same query, no
  second code path.

### 4.3 Push

Every local mutation is appended to the `outbox` store before it is applied to local state:

```js
{ opId: 41, sessionId: "ses_…", type: "session.upsert",
  patch: { screens: { A2: { status: "complete", updatedAt: 1780…, values: {…} } } },
  baseUpdatedAt: 1780…, createdAt: 1780…, attempts: 0 }
```

`sync.push` takes an ordered batch, applies each op in one transaction, assigns a `seq` per row, and
returns `{ opId, seq, serverUpdatedAt }` acks. The client drops acked ops from the outbox and
advances the cursor to the highest returned `seq` (so its own writes don't come back down).

- Ops are **idempotent by `opId`** (recorded per user, last 1000) — a retry after a lost response
  cannot double-apply.
- The outbox is **coalescing**: consecutive `session.upsert` ops for the same session merge their
  patches before send, so 200 keystrokes become one op. Sending 200 ops for one form is the most
  common way this pattern gets slow.
- Ordering is preserved per session; ops for different sessions may be batched together.

### 4.4 Merge rule

**Per-screen last-writer-wins, resolved on `screen.updatedAt` (device clock, monotonically clamped).**

```
for each screenKey in union(local.screens, remote.screens):
    if only one side has it → take it
    else → take the side with the greater screen.updatedAt
document-level scalars (status, cursorScreen, lastOpenedAt) → take the greater session.updatedAt
```

That is the entire merge. It is safe here because the two writers are the same person, who is not
editing two devices simultaneously; the screen-keyed shape means the loser of a merge is one
screen's worth of values, not a document. Do not add vector clocks or CRDTs — they'd cost real
complexity to defend against a case that doesn't exist in this product.

Clamp device clocks: `updatedAt = max(now, lastKnownServerTime + 1)` using the `serverUpdatedAt`
returned on every ack. Prevents a phone with a wrong date from pinning a stale screen as newest.

### 4.5 When sync runs

| Trigger | Action |
| --- | --- |
| App boot, online | `push` outbox → `pull` loop → hydrate |
| `visibilitychange` → hidden, `pagehide`, `freeze` | flush outbox (`keepalive` fetch / Background Sync) |
| Idle 5 s after last edit | flush outbox |
| Every 60 s while foregrounded | flush + subscribe already live |
| Back online (`online` event) | flush + full pull loop |
| Before opening a previous session | flush, and **block the swap** if it fails |

Registering a **Background Sync** / `SyncManager` tag on backgrounding is what makes "before the app
is closed" actually reliable on mobile web; a `beforeunload` handler is not. Where unavailable, the
`pagehide` + `keepalive` flush is the fallback, and the outbox covers what's missed at next boot.

### 4.6 Sync is invisible

No sync spinner, no "saved ✓" toast, no cloud icon, no error dialog. The product already promises
saving; announcing it invites doubt. The **only** places sync surfaces in the UI:

- The previous-sessions picker, when the list can't be fetched: "We can't reach your other sessions
  right now. What you're working on is safe on this phone."
- The session-swap failure above.

A failed background flush retries with backoff (1s → 2s → 4s → … capped 5 min) and says nothing.

---

## 5. What is *not* synced

This section covers the original Convex session sync, which is dev-only and being retired (#140).
The family-sharing design below ("Shared people (Supabase)") overrides it where they differ:
shared person sync never carries contact ids or edited wording (C2, C3).

- **Contacts. Settled: they never leave the device.** Names and mobile numbers of a grieving
  family's circle are the most sensitive data in the app, and they are already on the phone
  (imported or typed). They stay in IndexedDB. In the dev-only Convex sync the server sees contact
  *ids* inside `screens.*.values.selectedContactIds` and nothing more — never a name, never a
  number. In shared person sync it sees not even the ids (C3). The cost is accepted, not worked
  around: a new device starts fresh (§2). Do not add a "just this once" path that ships a name to
  the server for a preview or a receipt.
- **Message bodies.** Derived, not stored (§2 rule 2). `messageOverride` (edited wording) is the
  user's own message text. It is kept only in the on-device draft until sent and never syncs (C2).
  The older Convex design would have synced it as `screens.B4.values.messageOverride`, but nothing
  writes it there today. #140 removes that path.
- **Send jobs / delivery receipts.** Server-owned already (README B5); they are read down by their
  own query, not through the session cursor.
- *(The C3 checklist ticks **are** synced, on the `users` row — see §2.1. They are the one thing
  that outlives a session.)*

### Shared people (Supabase)

**Decided design (family-sharing G1, 2026-10-11). Not built yet.** Built by #116 (memberships and
invites tables), #117 (invite functions), #130 (the `flows` table), #131 (gateway routes), #132, #133, #134 (client
sync), #135, #136 (turning it on). Supersedes the read-only snapshot idea in #39.

An owner can invite family members by email. Members work on the owner's people. The shared
record is a `flows` row in Supabase Postgres, one per person, with `flows.owner_id` =
`auth.users.id`. Row-level security lets the owner and the owner's members read and write it;
only an owner can create one (C11).

**What syncs** (exactly six person fields):

- person name
- date of passing
- service date
- obituary URL
- obituary publisher
- service ready

**What never syncs:**

- drafts
- edited wording (`messageOverride`)
- recipients, and who was told (who was messaged)
- contact ids (and contact data)
- sender name (it stays on the sender's own profile)

Rules:

- **Membership is per owner.** A member belongs to one owner's circle, added only by that owner
  typing an email (C6). Removing a member or revoking an invite happens in profile or settings only
  (C9).
- **Merge: last write per field wins**, but a field with a pending local edit on this device is
  kept until it has been pushed, so a pull never overwrites typing that has not left the phone.
- **Removing a member:** that member's copy of the owner's people disappears on their next sync. Once they belong to no circle, their account becomes an owner again,
  so they can start their own person (#117).
- Account actions (invite, join, remove) need a connection; the sync itself stays invisible and
  never blocks the app or a flow (C5, §4.6).

## 6. Local Convex with Docker

```bash
mkdir -p infra/convex && cd infra/convex
curl -O https://raw.githubusercontent.com/get-convex/convex-backend/main/self-hosted/docker/docker-compose.yml
docker compose up -d
docker compose exec backend ./generate_admin_key.sh    # → CONVEX_SELF_HOSTED_ADMIN_KEY
```

The backend comes up on `http://127.0.0.1:3210`, HTTP actions on `http://127.0.0.1:3211`, and the
dashboard on `http://localhost:6791`; state goes to a local SQLite database inside a Docker volume
by default, which is right for development. Swap in Postgres when this stops being local-only.

`apps/web/.env.local` (git-ignored — the admin key is full administrative access):

```
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=…
VITE_CONVEX_URL=http://127.0.0.1:3210
```

Deploy functions with `npx convex dev` against those env vars. Pin the image tag
(`ghcr.io/get-convex/convex-backend:<rev>`) rather than `latest` so a rebuild doesn't move the
backend under the team.

**Auth, local phase — settled: stub it.** A dev-only `x-gg-user` header, read by `requireUser`
behind `GG_DEV_AUTH=1`, is enough to build every screen against. Two conditions on the stub:

```ts
// convex/auth.ts — the single seam the real thing replaces
export async function requireUser(ctx): Promise<string> {
  if (process.env.GG_DEV_AUTH === "1") return devUserFromHeader(ctx);   // local only
  throw new Error("auth not configured");
}
```

1. **One seam.** Every query and mutation calls `requireUser` and nothing else touches identity, so
   swapping in the real provider is one file.
2. **It cannot ship.** The env flag is absent in every non-local config, and the build fails if
   `GG_DEV_AUTH` is set outside development. A stub that silently survives to staging is how
   single-user apps end up serving each other's sessions.

The real choice — provider OAuth client-side minting a short-lived JWT, vs. Convex Auth's manual
self-hosted setup — is deferred. It does not change the schema or the sync protocol, which is why
deferring it is safe. **D1's three social buttons are unbuildable until it lands**, so it blocks
Flow D, not the data layer.

**Sign-up needs a connection; nothing after it does.** D1/D2 are the only screens in the product
allowed to require network. If sign-up is attempted offline, D1 says so in its own voice — "We need
a moment of signal to set this up. Nothing you do after this needs it." — and retries on `online`.
There is no anonymous session and no claim step: `userId` exists before `sessionId` always, which
is what keeps the `sessions.userId` binding non-nullable.

**Mobile note:** `127.0.0.1` is the simulator's own loopback. Use the host LAN IP (or an `adb
reverse` tunnel) for a real device.

---

## 7. Retention and deletion

**Settled: soft-delete, then hard-purge at 90 days.**

- Deleting a session sets `deletedAt`, keeping the tombstone so the cursor pull can propagate the
  delete to the user's other devices (§4.2).
- A scheduled Convex cron (`crons.daily("purge", …)`) hard-deletes rows whose `deletedAt` is more
  than 90 days old. Without the purge, "delete" is a lie told in a UI.
- **"Delete everything"** in settings is the exception: it purges the user's `sessions` rows
  immediately, nulls the `users` row's personal fields, and clears every local store including the
  outbox. No 90-day window, no tombstones, no confirmation-email round-trip. Someone asking for
  this is asking for it now.
- Deletion is never offered inside a flow — only in settings, never on C1, and never as a swipe
  action on a session row. A mis-swipe here is unforgivable in a way it isn't in a mail app.

## 8. Still open

1. **Account deletion wording** — nulling the `users` row leaves sessions unreadable but present
   until purge. Confirm this satisfies the promise the privacy copy will make.
2. **Auth provider mechanism** — deferred by decision (§6); blocks D1's social buttons.
3. **Outbox durability across reinstall** — IndexedDB dies with the app, so unflushed edits are lost.
   Given the 250 ms debounce and the idle flush, exposure is seconds of typing. Acceptable?
4. **Contact re-match on re-import** — matching by normalized E.164 (§2) fails for a contact whose
   number changed between devices. Falls back to unresolved; confirm that's tolerable.
