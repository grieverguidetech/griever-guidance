// The detail fields of a person that sync between devices, next to the six facts in flowFacts.ts.
// Same rules: a whitelist, caps that mirror the server, and nothing built by spreading a session
// (C2, C3, C8). Drafts, edited wording, recipients, contact data, senderName, checklist ticks and
// reminders never appear here.
import {
  FLOW_FACT_KEYS,
  hasForbiddenSyncKey,
  isPlainObject,
  parseFlowFacts,
  pickFlowFacts,
  toFlowFacts,
  type FlowFacts,
  type FlowFactsSource,
  type FlowRecord,
} from './flowFacts.js';
import { isUuid } from './members.js';
import type { SectionKey, SectionStatus } from './sections.js';

export const FLOW_DETAIL_TEXT_KEYS = [
  'birthDate',
  'serviceType',
  'serviceTime',
  'servicePlace',
  'serviceAddress',
  'serviceNotes',
  'serviceMessage',
  'announcementMessage',
  'obituaryText',
  'obituaryCity',
  'obituaryCareer',
  'obituarySurvivors',
  'obituaryNote',
  'thanksMessage',
  'visitationDate',
  'visitationTime',
  'visitationPlace',
  'serviceOfficiant',
  'burialDate',
  'burialTime',
  'burialPlace',
  'receptionDate',
  'receptionTime',
  'receptionPlace',
] as const;

export type FlowDetailTextKey = (typeof FLOW_DETAIL_TEXT_KEYS)[number];

/** The four composed messages. On the wire null means "follows the details" (local undefined). */
export const FLOW_MESSAGE_KEYS = [
  'serviceMessage',
  'announcementMessage',
  'obituaryText',
  'thanksMessage',
] as const satisfies readonly FlowDetailTextKey[];

export type FlowMessageKey = (typeof FLOW_MESSAGE_KEYS)[number];

/** The flat wire spelling of `sectionStatus`. */
export const FLOW_STATUS_KEYS = [
  'personStatus',
  'announcementStatus',
  'serviceStatus',
  'obituaryStatus',
  'thanksStatus',
] as const;

export type FlowStatusKey = (typeof FLOW_STATUS_KEYS)[number];

export const FLOW_DETAIL_KEYS = [
  ...FLOW_DETAIL_TEXT_KEYS,
  'burialPrivate',
  ...FLOW_STATUS_KEYS,
] as const;

export type FlowDetailKey = (typeof FLOW_DETAIL_KEYS)[number];

/** Every key that may cross the wire for a person. */
export const SYNCED_KEYS = [...FLOW_FACT_KEYS, ...FLOW_DETAIL_KEYS] as const;

export type SyncedKey = (typeof SYNCED_KEYS)[number];

/** Wire status values: null is "Not started". */
export type FlowStatusValue = SectionStatus | null;

export type FlowDetails = {
  [K in FlowDetailTextKey]: string | null;
} & { burialPrivate: boolean } & {
  [K in FlowStatusKey]: FlowStatusValue;
};

export type SyncedFields = FlowFacts & FlowDetails;

/** Mirrors the server column checks. Longer text is cut on save, never rejected there (see ADR 0001). */
export const FLOW_DETAIL_MAX_LENGTH: Record<FlowDetailTextKey, number> = {
  birthDate: 100,
  serviceType: 200,
  serviceTime: 100,
  servicePlace: 200,
  serviceAddress: 500,
  serviceNotes: 2000,
  serviceMessage: 2000,
  announcementMessage: 2000,
  obituaryText: 10000,
  obituaryCity: 200,
  obituaryCareer: 2000,
  obituarySurvivors: 2000,
  obituaryNote: 2000,
  thanksMessage: 2000,
  visitationDate: 100,
  visitationTime: 100,
  visitationPlace: 200,
  serviceOfficiant: 200,
  burialDate: 100,
  burialTime: 100,
  burialPlace: 200,
  receptionDate: 100,
  receptionTime: 100,
  receptionPlace: 200,
};

const STATUS_BY_SECTION: Record<SectionKey, FlowStatusKey> = {
  person: 'personStatus',
  announcement: 'announcementStatus',
  service: 'serviceStatus',
  obituary: 'obituaryStatus',
  thanks: 'thanksStatus',
};

const SECTION_BY_STATUS = Object.fromEntries(
  Object.entries(STATUS_BY_SECTION).map(([section, key]) => [key, section]),
) as Record<FlowStatusKey, SectionKey>;

type StatusMap = Partial<Record<SectionKey, SectionStatus>>;

/** The status map as five flat keys. A missing entry is null ("Not started"). */
export function statusMapToFlat(
  map: StatusMap | undefined,
): Record<FlowStatusKey, FlowStatusValue> {
  const out = {} as Record<FlowStatusKey, FlowStatusValue>;
  for (const key of FLOW_STATUS_KEYS) {
    const value = map?.[SECTION_BY_STATUS[key]];
    out[key] = value === 'in_progress' || value === 'ready' ? value : null;
  }
  return out;
}

/** The reverse. Null entries are left out, as a Session stores them. */
export function flatToStatusMap(
  flat: Partial<Record<FlowStatusKey, FlowStatusValue>>,
): StatusMap {
  const out: StatusMap = {};
  for (const key of FLOW_STATUS_KEYS) {
    const value = flat[key];
    if (value) {
      out[SECTION_BY_STATUS[key]] = value;
    }
  }
  return out;
}

/** What a Session (or any object with these optional fields) may contribute. Extra keys are never copied. */
export type SyncedSource = Partial<
  FlowFacts & {
    [K in FlowDetailTextKey]: string | undefined;
  } & { burialPrivate: boolean; sectionStatus: StatusMap }
>;

const isMessageKey = (key: FlowDetailTextKey): key is FlowMessageKey =>
  (FLOW_MESSAGE_KEYS as readonly string[]).includes(key);

// C0 control characters other than tab, newline and carriage return (this includes NUL).
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const stripControl = (value: string): string =>
  value.replace(new RegExp(CONTROL_CHARS.source, 'g'), '');

/** Cuts to `max` without splitting a surrogate pair. */
function cut(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  const part = value.slice(0, max);
  const last = part.charCodeAt(part.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? part.slice(0, -1) : part;
}

/**
 * Message keys: undefined becomes null, '' is kept (the family cleared it on purpose). Other text
 * keys: trimmed, blank becomes null. Both are cut at the cap.
 */
function toWireText(key: FlowDetailTextKey, value: string | undefined) {
  const max = FLOW_DETAIL_MAX_LENGTH[key];
  if (isMessageKey(key)) {
    return value === undefined ? null : cut(stripControl(value), max);
  }
  return cut(stripControl(value ?? '').trim(), max).trimEnd() || null;
}

/** Details for a session: the full, valid set (always passes `parseFlowDetails`). */
export function toFlowDetails(source: SyncedSource): FlowDetails {
  const out: Record<string, unknown> = {};
  for (const key of FLOW_DETAIL_TEXT_KEYS) {
    out[key] = toWireText(key, source[key]);
  }
  out.burialPrivate = source.burialPrivate === true;
  Object.assign(out, statusMapToFlat(source.sectionStatus));
  return out as FlowDetails;
}

/** Every synced field for a session, built from the whitelist (never a spread of the session). */
export function toSyncedFields(source: SyncedSource): SyncedFields {
  return { ...toFlowFacts(source), ...toFlowDetails(source) };
}

/** Session-shaped fields from the wire. Message null becomes undefined; other null becomes ''. */
export type SessionDetailFields = {
  [K in FlowDetailTextKey]?: string;
} & { burialPrivate: boolean; sectionStatus: StatusMap };

/**
 * Details only (not the six facts; use `flowFactsToSessionFields` for those). Status keys present
 * in `details` are merged into `currentStatus`, so a partial reply never wipes the other statuses.
 */
export function flowDetailsToSessionFields(
  details: Partial<FlowDetails>,
  currentStatus: StatusMap = {},
): Partial<SessionDetailFields> {
  const out: Record<string, unknown> = {};
  for (const key of FLOW_DETAIL_TEXT_KEYS) {
    const value = details[key];
    if (value === undefined) {
      continue;
    }
    if (value === null) {
      // A null message is an explicit undefined, so spreading it over a session clears the
      // local text and the session follows the details again.
      out[key] = isMessageKey(key) ? undefined : '';
      continue;
    }
    out[key] = value;
  }
  if (details.burialPrivate !== undefined) {
    out.burialPrivate = details.burialPrivate;
  }
  if (FLOW_STATUS_KEYS.some((key) => details[key] !== undefined)) {
    const next: StatusMap = { ...currentStatus };
    for (const key of FLOW_STATUS_KEYS) {
      const value = details[key];
      if (value === undefined) {
        continue;
      }
      const section = SECTION_BY_STATUS[key];
      if (value === null) {
        delete next[section];
      } else {
        next[section] = value;
      }
    }
    out.sectionStatus = next;
  }
  return out as Partial<SessionDetailFields>;
}

const isStatusValue = (value: unknown): boolean =>
  value === null || value === 'in_progress' || value === 'ready';

function validDetail(key: FlowDetailKey, value: unknown): boolean {
  if (key === 'burialPrivate') {
    return typeof value === 'boolean';
  }
  if ((FLOW_STATUS_KEYS as readonly string[]).includes(key)) {
    return isStatusValue(value);
  }
  if (value === null) {
    return true;
  }
  const max = FLOW_DETAIL_MAX_LENGTH[key as FlowDetailTextKey];
  return (
    typeof value === 'string' &&
    value.length <= max &&
    !CONTROL_CHARS.test(value)
  );
}

/**
 * Validates a partial set of details (C8). Unknown and forbidden keys are rejected, not dropped,
 * so a client sending a draft or a contact id gets an error. Null when invalid.
 */
export function parseFlowDetails(input: unknown): Partial<FlowDetails> | null {
  if (!isPlainObject(input) || hasForbiddenSyncKey(input)) {
    return null;
  }
  const allowed = new Set<string>(FLOW_DETAIL_KEYS);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    return null;
  }
  const out: Record<string, unknown> = {};
  for (const key of FLOW_DETAIL_KEYS) {
    if (!Object.hasOwn(input, key)) {
      continue;
    }
    if (!validDetail(key, input[key])) {
      return null;
    }
    out[key] = input[key];
  }
  return out as Partial<FlowDetails>;
}

/**
 * Splits a patch into its fact keys and detail keys, so each half is checked by its own parser.
 * Unknown keys go to the details half, which rejects them.
 */
export function splitSyncedPatch(input: unknown): {
  facts: Record<string, unknown>;
  details: Record<string, unknown>;
} | null {
  if (!isPlainObject(input)) {
    return null;
  }
  // Null-prototype objects: an own "__proto__" key from JSON.parse stays a plain own key.
  const facts: Record<string, unknown> = Object.create(null);
  const details: Record<string, unknown> = Object.create(null);
  const factKeys = new Set<string>(FLOW_FACT_KEYS);
  for (const key of Object.keys(input)) {
    Object.defineProperty(factKeys.has(key) ? facts : details, key, {
      value: input[key],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return { facts, details };
}

/**
 * Per field, the last write to reach the server wins, except a field with a pending local edit,
 * which keeps the local value until that edit is sent. A field missing from `remote` keeps local.
 * Pure: returns a new object. Covers facts and details.
 */
export function mergeSyncedFields(
  local: SyncedFields,
  remote: Partial<SyncedFields>,
  pendingFields: Iterable<SyncedKey>,
): SyncedFields {
  return mergeSyncedFieldsWithChanges(local, remote, pendingFields).merged;
}

/**
 * Same merge, plus `changed`: only the keys whose value came from `remote` and differs from
 * `local`. Callers write `changed` to the session and nothing else, so normalised local values
 * are never written back over a pending edit.
 */
export function mergeSyncedFieldsWithChanges(
  local: SyncedFields,
  remote: Partial<SyncedFields>,
  pendingFields: Iterable<SyncedKey>,
): { merged: SyncedFields; changed: Partial<SyncedFields> } {
  const pending = new Set<SyncedKey>(pendingFields);
  const merged: Record<string, unknown> = {};
  const changed: Record<string, unknown> = {};
  for (const key of SYNCED_KEYS) {
    const remoteValue = remote[key as keyof SyncedFields];
    if (pending.has(key) || remoteValue === undefined) {
      merged[key] = local[key as keyof SyncedFields];
      continue;
    }
    merged[key] = remoteValue;
    if (remoteValue !== local[key as keyof SyncedFields]) {
      changed[key] = remoteValue;
    }
  }
  return {
    merged: merged as unknown as SyncedFields,
    changed: changed as Partial<SyncedFields>,
  };
}

/**
 * Validates a record from the server: uuid ids, a known role, valid facts (extra fact keys dropped)
 * and, when sent, a `details` object of valid detail keys. Missing detail keys count as "not
 * sent", never as cleared. Invalid facts or invalid details reject the record. Null when invalid.
 * Lives here, not in flowFacts.ts, so the two files do not import each other at load time.
 */
export function parseFlowRecord(input: unknown): FlowRecord | null {
  if (!isPlainObject(input)) {
    return null;
  }
  const { id, ownerId, role, facts, details, updatedAt, updatedBy } = input;
  if (typeof id !== 'string' || !isUuid(id)) {
    return null;
  }
  if (typeof ownerId !== 'string' || !isUuid(ownerId)) {
    return null;
  }
  if (role !== 'owner' && role !== 'member') {
    return null;
  }
  if (typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt))) {
    return null;
  }
  if (updatedBy !== null && (typeof updatedBy !== 'string' || !isUuid(updatedBy))) {
    return null;
  }
  // Keys the client doesn't know are ignored (a newer server may add some); known ones are checked.
  const parsed = parseFlowFacts(
    isPlainObject(facts) ? pickFlowFacts(facts as FlowFactsSource) : null,
  );
  if (!parsed) {
    return null;
  }
  const record: FlowRecord = { id, ownerId, role, facts: parsed, updatedAt, updatedBy };
  if (details === undefined) {
    return record;
  }
  const known = isPlainObject(details) ? pickDetailKeys(details) : null;
  const parsedDetails = known ? parseFlowDetails(known) : null;
  if (!parsedDetails) {
    return null;
  }
  return { ...record, details: parsedDetails as FlowDetails };
}

function pickDetailKeys(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of FLOW_DETAIL_KEYS) {
    if (Object.hasOwn(source, key)) {
      out[key] = source[key];
    }
  }
  return out;
}
