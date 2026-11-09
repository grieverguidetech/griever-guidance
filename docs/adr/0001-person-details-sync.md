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
- **Payload size.** A test builds the largest possible write: every detail text at its cap and
  the facts at theirs, all in 3-byte characters ('一', the worst case per character). The JSON body
  is 83,492 bytes, under the 128 KB limit. Control characters (except tab, newline, carriage
  return) are refused, so they cannot add escape overhead.
- **Typed numbers in free text.** Notes, career and survivors are free text and may hold a phone
  number the family typed. This is accepted. The app never reads contacts into them.
- **Lowering a cap needs a migration.** The data function refuses to decode a stored value above its cap, so lowering a cap later needs a data migration first.

## Consequences

The data function and gateway (#517, #518), the sync engine (#519) and both apps (#520 to #522)
build on `libs/shared/src/flowDetails.ts`. Adding a synced key needs a change to this ADR's list,
REQUIREMENTS DS-7 and DATA.md in the same PR.

## Addendum, 2026-11-09: obituary fields (#772, parent #764)

The product owner approved this at gate G1 on 2026-11-09. The obituary retool replaces the free
text "career", "survivors" and "note" inputs with structured fields. They sync under DS-7 so a
person planned on the web is complete on the phone.

**Keys.** 26 new optional text keys are added to `FLOW_DETAIL_TEXT_KEYS`: `obituaryGivenName`, `obituaryMiddleName`, `obituarySurname`, `obituaryAge`, `obituaryState`, `obituaryDeathPlace`, `obituaryFuneralHome`, `obituaryChurch`, `obituaryCemeteryLocation`, `obituaryBirthPlace`, `obituaryMotherName`, `obituaryFatherName`, `obituaryHighSchool`, `obituaryGradYear`, `obituaryDegree`, `obituaryCollege`, `obituaryJobTitle`, `obituaryCompany`, `obituaryJobYears`, `obituaryHobbies`, `obituaryAwards`, `obituaryOrganizations`, `obituaryPronoun`, `obituarySurvivorList`, `obituaryPrecededList`, `obituaryMemorial`.
That makes 50 text keys and 56 detail keys. No existing key is removed or renamed (`obituaryCareer`,
`obituarySurvivors` and `obituaryNote` stay as fallbacks). The caps are in `FLOW_DETAIL_MAX_LENGTH`.

**Rules.** `obituaryPronoun` is `he`, `she`, `they` or null. The two list keys hold JSON rows of
`{ name, city, relation }` (at most 40 rows) and are checked with `parsePeople`; a list that is too
long or does not parse is sent as null, never cut mid-JSON. The 26 new keys refuse a lone surrogate; the 24 old keys do not, because one old stored value
would make the data function throw when it lists flows. Every key strips lone surrogates on save.

**Third-party names reach the server.** Parents' names, survivors with their cities, and people who
died before now reach the data function, as `obituarySurvivors` already did. The reason is the
same: the family must not retype them on the phone. They are not contact data (no numbers, no ids),
and they are shared only with the owner's members. The product owner accepted this.

**Payload.** The worst case with every new key at its cap, plus the largest valid lists, in 3-byte characters, is
118,388 bytes (it was 83,492), under the 131,072-byte (128 KB) limit. Each list is one row whose name fills its cap in 3-byte characters. The payload test in
`libs/shared/src/flowDetails.spec.ts` computes it.

**Deploy order.** The data function refuses unknown keys, and it is deployed by hand
(`docs/aws-data-function.md`). The owner redeploys it from the #772 branch BEFORE the PR merges.
Merging first breaks sync for every new person. Clients ignore unknown keys on read, so old phones
keep working.
