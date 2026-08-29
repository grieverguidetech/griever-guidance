# Handoff: Griever Guidance — SMS notification wizard

## Overview
Griever Guidance helps someone who has just lost a loved one send funeral and service
details to their contacts over SMS. The user is in acute grief — sleep-deprived,
overwhelmed, on a phone. Every decision below is optimized for speed, clarity and
reliability over cleverness.

This handoff covers a landing/session entry, then two wizard flows — **fifteen phone screens** total:

- **Landing + session** (3 screens): choose a person or view sent messages; the person's details are captured once.
- **Flow A — Share the service** (6 screens): date, time and place sent to the people who need it.
- **Flow B — Announce the passing** (6 screens): the first message, usually sent within hours.

Both flows start from the same template picker, and both read from the session.

## The session model — read this first

The single most important structural idea: **the app asks for the person's details once, at the
start, and never again.** The landing screen creates a *session* keyed to one deceased person; the
session holds their name, the date they passed, the sender's name and (optionally) an obituary
link. Every message flow reads from it.

Consequences the implementation must honor:

- The service form no longer asks for a name. The announcement form has **no required fields at
  all** — it shows a read-only recap of the session with an Edit affordance, plus one optional note.
- A session is **durable**. It survives app close, and is restored on relaunch. The landing screen
  detects an in-progress session and offers to continue it *above* the other options.
- Multiple sessions are possible (a user may lose more than one person, or return a year later).
  The landing screen's "Someone else I've lost" starts a new one; sent history spans all of them.
- A session is not a login. No account is required to start one; it can live locally until the
  user has reason to sync.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing
intended look and behavior, **not production code to copy directly**. The task is to
**recreate these designs in the existing codebase** (`ptums/griever-guidance` — an Nx
monorepo with `apps/web` (React + Vite) and `apps/mobile` (React Native/Expo), sharing
`libs/`), using its established patterns, routing, state and component libraries.

The repo already has screen files that correspond one-to-one with most of these mocks
(see **Screen map** below) — treat this as a redesign/extension of those screens, not a
greenfield build.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii and copy are final and come from the
bound *Broadsheet* design system. Recreate pixel-accurately, but express the tokens through
the codebase's own theming layer rather than hard-coding hex values in components.

Two caveats:
- The mocks are static. Selected/checked states, the flowers toggle, and the sending progress
  are shown in one representative state each.
- Device chrome (status bar, home indicator) is mock furniture — the OS provides it.

---

## Design language — Broadsheet

Newsprint set for the screen. Near-black serif on paper white, process cyan as the single
interactive accent, magenta as a rare second spot color. **No dividers, no boxed layout** —
hierarchy comes from the serif scale and whitespace. Cards are used only for genuinely
discrete items (a contact, a message template, a sent record), never as layout containers.

Typeface for *everything*, including UI chrome: **Source Serif 4** (headings 600, body 400,
true italic for the quiet reassurance lines). Do not introduce a sans-serif.

### Design tokens

**Color**
| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | #f3f2f2 | Page/screen ground |
| `--color-surface` | #eae9e9 | Card fill |
| `--color-text` | #201e1d | Body and headings |
| `--color-accent` | #0088b0 | Primary buttons, selection, focus |
| `--color-accent-2` | #d6006c | Rare second spot (announcement tag) |

Accent ramp: 100 #e9f8ff · 200 #cbeeff · 300 #99e0ff · 400 #62c5ee · 500 #38a6cf ·
600 #1186ac · 700 #006786 · 800 #004961 · 900 #0a303e
Accent-2 ramp: 100 #fff1f4 · 200 #ffdee6 · 300 #ffc0d0 · 400 #ff90b1 · 500 #ff458e ·
600 #d82071 · 700 #aa0b56 · 800 #790e3d · 900 #4b1528
Neutral ramp: 100 #f8f4f4 · 200 #eae7e7 · 300 #d7d3d3 · 400 #bab6b6 · 500 #9b9797 ·
600 #7d7979 · 700 #605d5d · 800 #444141 · 900 #2d2b2b

Accent-on-ground contrast is ~3:1 — fine for chrome and large text, **not** for paragraph
copy. Paragraph text in the accent must use `--color-accent-700` (#006786).

Secondary/muted text in the mocks is `color-mix(in srgb, var(--color-text) 60%, transparent)`
(≈ #201e1d at 60% over #f3f2f2 → roughly #6a6968); field hints use 50%, eyebrow labels 45%.
Prefer neutral-600/700 ramp steps if your platform lacks `color-mix`.

**Spacing** (1.25× density): 1 = 5px · 2 = 10px · 3 = 15px · 4 = 20px · 6 = 30px · 8 = 40px
**Radius**: sm 1px · md 2px · lg 4px — near-square corners are intentional.
**Shadow**: sm `0 1px 2px rgba(45,43,43,.14)` · md `0 3px 10px rgba(45,43,43,.16)` ·
lg `0 12px 32px rgba(45,43,43,.22)`

**Type roles used in the mocks**
| Role | Size / treatment |
| --- | --- |
| Screen title (`h3`) | Serif 600, ~22px |
| Card title | Serif 600, 14–16px |
| Body / message preview | 14px, line-height 1.6–1.7 |
| Secondary line | 13px, 60% text |
| Card meta (phone, date) | ~12px, muted |
| Eyebrow / group label | 10–11px, uppercase, letter-spacing 0.1em, 45% text |
| Reassurance line | 12–14px, *italic*, 50% text |

**Icons**: Phosphor, **duotone** weight. Used: `arrow-left`, `check-circle` (fill for
selected, duotone for status), `circle` (unselected), `circle-dashed` (sending),
`map-pin`, `pencil-simple`.

**Interaction states** (do not leave browser/platform defaults):
- Hover: accent tint from the ramp.
- Pressed: one step past base — `--color-accent-600`.
- Focus: `outline: 2px solid var(--color-accent); outline-offset: 2px`.
- Selected card/contact: `outline: 2px solid var(--color-accent); outline-offset: -2px` (an
  inset outline, so the card does not shift).
- Disabled: 45% opacity.

**Touch targets**: every tappable row/button is ≥44px tall. Do not shrink them.

---

## Screens / Views

Device canvas for all mocks: **402 × 874** (iPhone 16 logical size). Screen padding
`--space-4` (20px) on all sides; vertical rhythm between blocks `--space-4`, within a
group `--space-2`.

Every screen except the first and the confirmations opens with a ghost **Back** button
(`arrow-left` + "Back"), flush left, zero left padding.

### L1 — Landing, first visit
*Purpose*: two doors and nothing else. No dashboard, no feed, no marketing.

Top padding 56px (no Back — this is the root). Title `Griever Guidance` (`h2`), sub-line
"We'll help you tell people what they need to know, one message at a time."

Two tappable `card elev-sm` in a 10px stack:
- **Someone I've lost** — "Tell us their name once. We'll remember it for every message you send."
  → starts a session (L3).
- **Messages I've sent** — "A record of everything that's gone out." → goes straight to the history
  list (A6).

Closing italic 12px line, 50% text: "Nothing sends until you've read it first."

*Copy note*: the product never uses the word "deceased" in the interface. The possessive framing
("Someone I've lost") keeps the screen about the user's person, not a database record. Preserve
this in any new copy.

### L2 — Landing, returning with a session
*Purpose*: resume without making the user retrace their steps.

Title "Welcome back, <sender first name>." Sub-line "You have a message in progress. It's saved
just as you left it."

An **In progress** `card elev-md` with the inset accent outline, above the other options:
kicker "In progress", title = the person's name, body = "<Template> — <stage>, not yet sent."
(e.g. "Announcement — recipients chosen, not yet sent."), `.card-meta` "Last opened 2 hours ago",
then a full-width primary **Continue**.

Below it, the two standing options, demoted to plain `card elev-sm`:
- **Someone else I've lost** — "Start a new set of messages."
- **Messages I've sent** — "A record of everything that's gone out."

*Behavior*: **Continue** resumes at the exact step the draft was abandoned on — not at step 1.
Persist the current step index with the draft. If more than one session is in progress, show the
most recently opened as the card and list the rest under it in the same pattern.

### L3 — Session setup
*Purpose*: the only place the person's details are asked for.

Back button. Title "Who are we writing about?", sub-line "We'll carry this into every message, so
you only type it once."

1. **Their name** — required — "e.g. Margaret Hayes"
2. **Date they passed** — required — "e.g. May 29, 2026"
3. **Your name** *(optional)* — "So people know who wrote"
4. **Link to the obituary** *(optional)* — "Paste a link, if there is one", 12px hint below:
   "You can add this later — it'll be included in messages once you do."

Primary `Continue` → template picker. Centered italic 12px: "Everything is saved as you go. You
can stop and come back." — again, a literal promise: persist on every keystroke.

*Obituary link*: validate loosely (accept bare domains, prepend `https://`), never hard-fail. When
present, append it as the final line of every outgoing message.

### Shared: Step 1 — Template picker
*Purpose*: choose which kind of message to send. Entry point for both flows.

- Back button. Accent eyebrow **"For <name>"** (11px, uppercase, letter-spacing 0.1em,
  `--color-accent-700`) — the session is visible on every screen from here on.
- Title "What would you like to send?"; sub-line "Choose the kind of message. We already have her details."
- Three groups, each an uppercase eyebrow label above one tappable `card elev-sm`:
  - **Announcement** → "Announce the passing" / "A gentle note letting people know."
  - **Service details** → "Share the service" / "Date, time and place, in one message."
  - **Aftercare** → "Send a thank-you" / "For flowers, calls and support."
- Group gap `--space-6` (30px). Tapping a card advances immediately — no Continue button.

---

## Flow A — Share the service

### A2 — Details form
*Purpose*: collect the service logistics.

Accent "For <name>" eyebrow, title "Share the service", sub-line "Three things and you're done."
The name comes from the session and is **not** asked for again.

Fields, in order (all `.field` + `.input`):
1. **Service date** — "e.g. June 14, 2026"
2. **Time** — "e.g. 2:00 PM"
3. **Location** — **Google Maps Places typeahead** (see below)
4. **Notes** *(optional)* — textarea, 2 rows, "Reception to follow at the house"

Primary `Continue` button, full width, bottom.

**Location typeahead — implementation note.** The field is a Google Maps Places Autocomplete
input, not a free-text field. On input (debounce ~250ms) it shows a results panel directly
below the input (6px gap, `card elev-sm`, zero padding, rows of 10px/12px):

- Each row: duotone `map-pin` in `--color-accent-700`, then the place name (14px) over the
  full formatted address (`.card-meta`).
- The highlighted/first row has an `--color-accent-100` background.
- Footer line, 11px, 45% text: "Addresses from Google Maps — pick one and we'll send the full address."

Store the selected `place_id` plus the formatted address; **send the full formatted address**
in the SMS body so recipients can tap it into their own maps app. Falls back to free text if
the Places request fails — never block sending on the API.

### A3 — Contact selector
*Purpose*: pick recipients.

Title "Who should know?", sub-line "Select everyone who should get this." A flat list of
contact `card` rows: name (14px) over phone (`.card-meta`) on the left, selection icon on
the right (`ph-fill ph-check-circle` in accent when selected, `ph ph-circle` in
`--color-neutral-400` when not). Selected rows carry the inset accent outline.

Footer row: "N selected" (13px, muted) on the left, primary `Continue` on the right.

### A4 — Review + flowers
*Purpose*: read the message once before it goes; optionally add a florist.

- Title "Review your message", sub-line "This will go to N people."
- The composed message in a `card`, 14px / line-height 1.6.
- **"Include a way to send flowers" toggle** — label plus the sub-line "For people who can't
  be there in person." Custom switch on the right: 44×26 track, radius 13, 3px padding, 20px
  white knob; off = `--color-neutral-300`, on = `--color-accent`; knob animates via
  `justify-content` flip, 160ms ease.
- **When on**, reveal:
  - Eyebrow "Florists near <venue>" — the list is geo-derived from the Step-2 Places result
    (Places nearby search, type `florist`, ranked by distance from the venue).
  - Florist `card` rows in the same selected/unselected pattern as contacts; meta line shows
    distance and a delivery hint ("0.2 mi · delivers to the chapel").
  - Field "Or a florist you'd prefer" *(optional)* — "Name, phone or website".
  - Field "Deliver flowers to" — a `.seg` segmented control: **The service** (selected,
    accent fill, white text) / **The family's home**.
  - Italic 12px preview: "We'll add one line: "If you'd like to send flowers, Elm Street
    Flowers can deliver to the service.""
- Primary `Send messages`, full width.

*Behavior*: toggling appends exactly one sentence to the outgoing SMS. Keep the message under
one SMS segment where possible; if the florist line pushes it over, that is acceptable but
should be surfaced nowhere — never make the griever manage character counts.

### A5 — Sent confirmation
Centered column, 64px top padding. 56px circle in `--color-accent-100` with a 28px duotone
`check-circle` in `--color-accent-700`. Title "Your message has been sent." Sub-line
"N people will receive service details for <name>." Italic muted line "We're holding you in
our thoughts." Two ghost buttons: **Send another message**, **View sent messages**.

### A6 — Sent messages (history)
Title "Sent messages", sub-line "A record of notifications sent from this device."
Each record is a `card`: a `tag` at the top (`tag-accent` "Service details",
`tag-accent-2` "Announcement"), the deceased's name (15px card title), then
`.card-meta` "N people notified · <date>".

---

## Flow B — Announce the passing

Design principle: this message goes out within hours. Because the session already holds the name,
date and sender, **this flow has no required fields at all** — the user can go from landing to sent
without typing anything beyond session setup.

### B1 — Nothing required
Magenta "For <name>" eyebrow (`--color-accent-2-700` — the announcement is the one place the
second spot color appears). Title "Announce the passing", sub-line "We have everything we need.
This is only if you'd like to say more."

- A read-only **recap `card`**: kicker "From your details", body "Margaret Hayes · passed May 29,
  2026 · from Anna", and a left-flush ghost **Edit** button (`pencil-simple`) that returns to L3.
- One field: **Anything you'd like to add** *(optional)* — textarea, 3 rows, "She was peaceful, and
  we were with her."

Primary `Continue`, then a centered italic 12px line: "Everything is saved as you go. You can
stop and come back."

### B2 — Service details known?
Title "Do you know the service details?", sub-line "Most people don't yet. That's completely
fine." Two tappable `card elev-sm` options:
- **Not yet** *(default selected)* — "We'll say details are coming, and remind you to send them later."
- **Yes, I have them** — "Include the date, time and place in this message."

Choosing "Yes" routes into the Flow-A details form (A2) before continuing. Choosing "Not yet"
schedules the follow-up reminder and injects "Details of the service will follow once we have
them." into the message.

### B3 — Grouped contact selector
Same row pattern as A3, but **grouped** — "Close family" and "Friends & neighbours", each with
its own uppercase eyebrow and a right-aligned ghost **Select all** (12px). Sub-line: "Send to
close family now, everyone else when you're ready." Groups come from the contact's assigned
circle; ungrouped contacts fall into a third "Everyone else" section.

### B4 — Review
Title "Read it once before it goes", sub-line "This will go to N people as a text message."
The message `card` carries a `tag-accent-2` "Announcement" tag above the body. Below:
two half-width buttons — secondary **Edit wording** (`pencil-simple`) and ghost **Softer
tone** — then primary **Send to N people**, then a centered 12px muted line "You'll be able to
see who received it."

*Softer tone* re-renders the draft with gentler phrasing (same facts, warmer wording).

Sample composed body:
> With much love, we're letting you know that Margaret Hayes passed away on May 29, 2026. She
> was peaceful, and we were with her. Details of the service will follow once we have them. — Anna

### B5 — Sending (delivery progress)
Title "Sending your message…", sub-line "N of M delivered. You can close the app — it will
finish on its own." A 6px progress bar (`--color-neutral-200` track, `--color-accent` fill,
`--radius-sm`), then one row per recipient: name on the left, status on the right —
duotone `check-circle` in `--color-accent-700` "Delivered", or duotone `circle-dashed` in
muted text "Sending".

*This screen exists for trust.* Sends must be queued server-side and survive app termination;
per-recipient delivery receipts drive the rows. Failures get a retry affordance on this screen
rather than an error dialog.

### B6 — Sent, with one quiet next step
Same confirmation treatment as A5 — "Everyone has been told." / "N people now know about
<name>. Nothing else needs doing today." / italic "Rest if you can. We'll keep the list for
you." — followed by a single `card` (left-aligned, full width) with kicker "When you're
ready", title "Share the service details", body "We'll reuse this same list of people.", and a
full-width primary **Add service details**. Then a ghost **View sent messages**.

The card is the *only* onward action offered; do not add a dashboard, feed, or upsell here.

---

## Interactions & Behavior

- **Navigation**: linear wizard, one step per screen, always reversible via Back. No step
  skipping, no progress bar (it implies work remaining, which the grieving user does not need).
- **Validation**: inline, on blur, never blocking. Required fields are name + date only.
- **Persistence**: draft state saved on every change, restored on relaunch. Say so in copy.
- **Sending**: queue server-side; the app may be backgrounded or killed mid-send.
- **Delivery receipts**: per recipient, surfaced in B5 and in history.
- **Reminders**: if "Not yet" was chosen in B2, schedule a follow-up nudge to send the service
  details, reusing the same recipient list.
- **Animation**: minimal. Only the flowers toggle (160ms ease) and progress-bar fill. No
  celebratory or playful motion anywhere in this product.
- **Copy rules**: short sentences, plain words, second person, no exclamation marks, no emoji,
  no jargon. Never say "success", "awesome", or "done!" — the confirmations say what happened
  and then give the user permission to stop.

## State Management
**Session** (durable, survives app close, one per person, restored on relaunch):
- `sessionId`, `personName`, `dateOfPassing`, `senderName`, `obituaryUrl`
- `createdAt`, `lastOpenedAt` (drives L2's "Last opened 2 hours ago")
- `draft`: { template, step, ...flow state } — `step` is what **Continue** resumes to
- `status`: 'in_progress' | 'sent'

Per-flow wizard state (all under `session.draft`):
- `template`: 'announcement' | 'service' | 'thanks'
- `personalNote`
- `serviceDate`, `serviceTime`, `servicePlace` ({ placeId, name, formattedAddress }), `serviceNotes`
- `serviceDetailsKnown`: boolean (B2)
- `selectedContactIds`: string[]
- `includeFlowers`: boolean; `floristId` | `customFlorist`; `flowerDeliveryTarget`: 'service' | 'home'
- `composedMessage`: derived, regenerated whenever any input changes; user edits pin it
- `sendJob`: { id, perRecipientStatus: 'queued' | 'sending' | 'delivered' | 'failed' }

Data fetching: contacts (device or account), Google Places autocomplete + nearby florists,
send job creation and delivery-receipt polling/subscription.

## Assets
No bitmap assets. Icons are Phosphor duotone (`@phosphor-icons/web` in the mock; use the
native Phosphor package for React/React Native). Typeface is Source Serif 4 (Google Fonts,
weights 400/600 + italic 400) — the design system loads it; bundle it in the app.

## Screenshots
`screenshots/` holds a 2× PNG of every screen, named to match the sections above:

| File | Screen |
| --- | --- |
| L1-landing-first-visit.png | L1 — Landing, first visit |
| L2-landing-returning.png | L2 — Landing, returning with a session |
| L3-session-setup.png | L3 — Session setup |
| A1-template-picker.png | Step 1 — Template picker |
| A2-details-form.png | A2 — Details form, name dropped (Places typeahead open) |
| A3-contact-selector.png | A3 — Contact selector |
| A4-review-flowers.png | A4 — Review, flowers toggle on |
| A5-sent.png | A5 — Sent confirmation |
| A6-history.png | A6 — Sent messages |
| B1-announcement-form.png | B1 — Nothing required (session recap) |
| B2-service-details-known.png | B2 — Service details known? |
| B3-grouped-contacts.png | B3 — Grouped contact selector |
| B4-review.png | B4 — Review |
| B5-sending-progress.png | B5 — Sending progress |
| B6-sent-next-step.png | B6 — Sent, with one quiet next step |

Each is framed in a device bezel; the bezel and status bar are mock furniture, not part of the design.

## Files
| File | What it is |
| --- | --- |
| `Griever Guidance - Wizard.dc.html` | The design source — all 12 screens. Open in a browser. |
| `ios-frame.jsx` | Device bezel used to frame each screen. Mock furniture only. |
| `support.js` | Runtime for the design file. Not part of the design. |
| `design-system/styles.css` | Broadsheet tokens + component classes (`.btn`, `.card`, `.field`, `.input`, `.seg`, `.tag`). The authoritative source for every value above. |
| `design-system/readme.md` | Broadsheet usage guide. |
| `screenshots/` | 2× PNG of each screen (see above). |

## Screen map — mock → existing repo files
| Mock | Repo file |
| --- | --- |
| L1 / L2 — Landing | *new* |
| L3 — Session setup | *new* (absorbs name/date fields from `DetailsForm.tsx`) |
| Step 1 — Template picker | `apps/web/src/screens/TemplatePicker.tsx` |
| A2 — Details form (+ Places typeahead) | `apps/web/src/screens/DetailsForm.tsx` |
| A3 / B3 — Contact selector | `apps/web/src/screens/ContactSelector.tsx` |
| A4 / B4 — Review (+ flowers toggle) | `apps/web/src/screens/ConfirmScreen.tsx` |
| A5 / B6 — Sent confirmation | `apps/web/src/screens/SentScreen.tsx` |
| A6 — Sent messages history | `apps/web/src/screens/HistoryScreen.tsx` |
| B1 — Nothing required | *new* (nearest: `DetailsForm.tsx`) |
| B2 — Service details known? | *new* |
| B5 — Sending progress | *new* |

Mobile equivalents live under `apps/mobile/src/`; shared logic belongs in `libs/`.
