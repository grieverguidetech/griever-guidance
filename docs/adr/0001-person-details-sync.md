# 0001: Person details sync between devices

Status: accepted by the product owner, 2026-10-30. Ticket: #516 (shared keys and docs). Part of #385.

## Context

The web is a planning desk and the phone sends (REQUIREMENTS §1). A family that plans on the web
must not retype on the phone. Until now only six facts synced (DS-6). The planning fields lived on
the device that typed them.

## Decision

1. The person's detail fields sync through the same record and the same people as the six facts
   (DS-7). The list is `FLOW_DETAIL_KEYS` in `libs/shared/src/flowDetails.ts`: 24 text fields,
   `burialPrivate` and five section statuses. `SYNCED_KEYS` is the facts plus these.
2. Wire keys are flat. `sectionStatus` becomes five keys (`personStatus` and so on).
3. Each key has a length cap (`FLOW_DETAIL_MAX_LENGTH`). The client, the gateway and the data
   function all check keys and lengths (C8). Unknown and forbidden keys are refused, not dropped.
4. Null rule. For the four message keys, wire null means the local value is `undefined` (the message
   follows the details) and `''` stays `''`. For every other text key a blank value is null.
5. Merge is last saved wins per field, in server order, with no client timestamps. A field with a
   pending local edit keeps the local value until it is sent (`mergeSyncedFields`).
6. Never synced: drafts, `messageOverride`, `recipientsNotified`, `selectedContactIds`,
   `hearsFirstIds`, any contact data (C3, C4), `senderName`, `momentCompletedAt`,
   `remindersScheduled`, `account.checklistTicks` and the checklist.

## Trade-offs accepted

- **Silent truncation above the caps.** The save step cuts text to the cap and the person is not told.
  Caps are well above normal use (an obituary may be 10,000 characters). A cut is better than a
  failed save for someone in grief. The server refuses a longer value that bypasses the client.
- **Survivors' names are on the server.** `obituarySurvivors` is free text that names living
  relatives. It is stored in the person's record with the other fields. It is not contact data
  (no numbers, no ids) and it is shared only with the owner's members. The product owner accepted this.
- **No checklist yet.** Phase ticks and "Doesn't apply" marks stay on the device (B9). They can sync
  in a later ticket without changing this decision.
- **Last saved wins per field.** Two people who edit the same field at once: one edit is lost. Edits
  to different fields never collide. A real merge or timestamps would cost more than the
  risk of a small family editing the same sentence together.
- **Payload size.** The largest possible write is well under 128 KB (a test computes it).

## Consequences

The data function and gateway (#517, #518), the sync engine (#519) and both apps (#520 to #522)
build on `libs/shared/src/flowDetails.ts`. Adding a synced key needs a change to this ADR's list,
REQUIREMENTS DS-7 and DATA.md in the same PR.
