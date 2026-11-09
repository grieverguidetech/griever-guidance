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
  CONTROL_CHARS,
  stripControl,
} from './flowFacts.js';
import { isUserId, isUuid } from './members.js';
import {
  PRECEDED_RELATIONS,
  SURVIVOR_RELATIONS,
  parsePeople,
} from './obituaryPeople.js';
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
  'obituaryGivenName',
  'obituaryMiddleName',
  'obituarySurname',
  'obituaryAge',
  'obituaryState',
  'obituaryDeathPlace',
  'obituaryFuneralHome',
  'obituaryChurch',
  'obituaryCemeteryLocation',
  'obituaryBirthPlace',
  'obituaryMotherName',
  'obituaryFatherName',
  'obituaryHighSchool',
  'obituaryGradYear',
  'obituaryDegree',
  'obituaryCollege',
  'obituaryJobTitle',
  'obituaryCompany',
  'obituaryJobYears',
  'obituaryHobbies',
  'obituaryAwards',
  'obituaryOrganizations',
  'obituaryPronoun',
  'obituarySurvivorList',
  'obituaryPrecededList',
  'obituaryMemorial',
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
  obituaryGivenName: 100,
  obituaryMiddleName: 200,
  obituarySurname: 100,
  obituaryAge: 20,
  obituaryState: 100,
  obituaryDeathPlace: 200,
  obituaryFuneralHome: 200,
  obituaryChurch: 200,
  obituaryCemeteryLocation: 200,
  obituaryBirthPlace: 200,
  obituaryMotherName: 200,
  obituaryFatherName: 200,
  obituaryHighSchool: 200,
  obituaryGradYear: 20,
  obituaryDegree: 200,
  obituaryCollege: 200,
  obituaryJobTitle: 200,
  obituaryCompany: 200,
  obituaryJobYears: 50,
  obituaryHobbies: 500,
  obituaryAwards: 500,
  obituaryOrganizations: 500,
  obituaryPronoun: 10,
  obituarySurvivorList: 3000,
  obituaryPrecededList: 2000,
  obituaryMemorial: 2000,
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


const PRONOUNS: readonly string[] = ['he', 'she', 'they'];

/** A high surrogate with no low one after it, or a low one with no high one before it. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const stripLoneSurrogates = (value: string): string =>
  value.replace(new RegExp(LONE_SURROGATE.source, 'g'), '');

/** The two list keys hold JSON, so they are never cut: they are kept whole or not at all. */
const LIST_RELATIONS = {
  obituarySurvivorList: SURVIVOR_RELATIONS,
  obituaryPrecededList: PRECEDED_RELATIONS,
} as const;

const isListKey = (key: FlowDetailTextKey): key is keyof typeof LIST_RELATIONS =>
  Object.hasOwn(LIST_RELATIONS, key);

/** True when the text is a list `parsePeople` accepts for this key ('' is an empty list). */
function validList(key: keyof typeof LIST_RELATIONS, text: string): boolean {
  return parsePeople(text, LIST_RELATIONS[key] as readonly string[]) !== null;
}

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
  const clean = (text: string) => stripLoneSurrogates(stripControl(text));
  if (isMessageKey(key)) {
    return value === undefined ? null : cut(clean(value), max);
  }
  if (isListKey(key)) {
    // Never cut mid-JSON: a list that is too long or does not parse is sent as null.
    const text = clean(value ?? '').trim();
    return text !== '' && text.length <= max && validList(key, text) ? text : null;
  }
  const text = cut(clean(value ?? '').trim(), max).trimEnd() || null;
  if (key === 'obituaryPronoun') {
    return text !== null && PRONOUNS.includes(text) ? text : null;
  }
  return text;
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
  const textKey = key as FlowDetailTextKey;
  const max = FLOW_DETAIL_MAX_LENGTH[textKey];
  if (
    typeof value !== 'string' ||
    value.length > max ||
    CONTROL_CHARS.test(value) ||
    LONE_SURROGATE.test(value)
  ) {
    return false;
  }
  if (textKey === 'obituaryPronoun') {
    return PRONOUNS.includes(value);
  }
  return isListKey(textKey) ? validList(textKey, value) : true;
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
 * sent", never as cleared. Invalid facts reject the record (null). Invalid details drop only `details`.
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
  if (typeof ownerId !== 'string' || !isUserId(ownerId)) {
    return null;
  }
  if (role !== 'owner' && role !== 'member') {
    return null;
  }
  if (typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt))) {
    return null;
  }
  if (updatedBy !== null && (typeof updatedBy !== 'string' || !isUserId(updatedBy))) {
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
  // Bad details drop only the details. The facts are valid, so the record stays usable.
  const parsedDetails = isPlainObject(details) ? parseFlowDetails(pickFlowDetails(details)) : null;
  return parsedDetails ? { ...record, details: parsedDetails } : record;
}

/** Copies only the whitelisted detail keys that are own properties with a value. Never a spread. */
export function pickFlowDetails(source: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of FLOW_DETAIL_KEYS) {
    if (!Object.hasOwn(source, key)) {
      continue;
    }
    const value = (source as Record<string, unknown>)[key];
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * `serviceStatus` (section progress) and `serviceReady` (the Gate answer) are separate facts that
 * sync as stored. They are protected as a pair: while either has a pending edit, both stay local.
 */
export function withServicePair(keys: Iterable<SyncedKey>): Set<SyncedKey> {
  const out = new Set<SyncedKey>(keys);
  if (out.has('serviceStatus') || out.has('serviceReady')) {
    out.add('serviceStatus');
    out.add('serviceReady');
  }
  return out;
}
