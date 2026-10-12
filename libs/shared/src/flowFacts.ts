// What may leave the device for a person, and nothing more (C2, C3). Every object that goes to the
// gateway is built here from the whitelist, never by spreading a session. Drafts, edited wording
// (`messageOverride`), recipients, contact ids and `senderName` are deliberately not facts.
import { isUuid } from './members.js';
import { normalizeUrl } from './templates.js';

export interface FlowFacts {
  personName: string;
  dateOfPassing: string | null;
  serviceDate: string | null;
  obituaryUrl: string | null;
  obituaryPublisher: string | null;
  serviceReady: boolean;
}

export type FlowFactKey = keyof FlowFacts;

/** The whitelist. Adding a key here is a privacy decision: it needs a REQUIREMENTS/DATA.md change. */
export const FLOW_FACT_KEYS = [
  'personName',
  'dateOfPassing',
  'serviceDate',
  'obituaryUrl',
  'obituaryPublisher',
  'serviceReady',
] as const satisfies readonly FlowFactKey[];

/** Mirrors the `flows` column checks in the database. Dates are free-form text. */
export const FLOW_FACT_MAX_LENGTH = {
  personName: 200,
  dateOfPassing: 100,
  serviceDate: 100,
  obituaryUrl: 2048,
  obituaryPublisher: 200,
} as const;

export type FlowRole = 'owner' | 'member';

export interface FlowRecord {
  id: string;
  ownerId: string;
  role: FlowRole;
  facts: FlowFacts;
  /** ISO 8601 timestamp of the last write the server accepted. */
  updatedAt: string;
  updatedBy: string | null;
}

/** Anything that might carry facts, such as a Session. Extra keys are allowed and never copied. */
export type FlowFactsSource = Partial<{
  [K in FlowFactKey]: FlowFacts[K] | undefined;
}>;

/** Copies only the whitelisted keys that are present on the source. Never a spread. */
export function pickFlowFacts(source: FlowFactsSource): Partial<FlowFacts> {
  const out: Record<string, unknown> = {};
  for (const key of FLOW_FACT_KEYS) {
    const value = source[key];
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<FlowFacts>;
}

// Postgres text can't hold NUL, so it is removed before anything is sent.
const stripNul = (value: string): string => value.replaceAll('\u0000', '');

/** Trims and cuts to the database limit, never splitting a surrogate pair. */
function clampText(value: string, max: number): string {
  const trimmed = stripNul(value).trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return (last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut).trimEnd();
}

/** Blank or whitespace-only becomes null, so "not set" has one spelling on the wire. */
function optionalText(
  value: string | null | undefined,
  max: number,
): string | null {
  return clampText(value ?? '', max) || null;
}

/**
 * Typed text becomes a link the database accepts: a bare "legacy.com/x" gets https://. Anything
 * that still isn't an http(s) link, or is too long to cut safely, becomes null instead of failing
 * the whole write.
 */
function optionalUrl(value: string | null | undefined): string | null {
  const url = normalizeUrl(stripNul(value ?? ''));
  if (url.length > FLOW_FACT_MAX_LENGTH.obituaryUrl) return null;
  return isHttpUrl(url) ? url : null;
}

/**
 * The full, valid set of facts for a session (always passes `parseFlowFacts`). Text is trimmed and
 * cut to the database limits; blank optional values and unusable links become null.
 */
export function toFlowFacts(source: FlowFactsSource): FlowFacts {
  return {
    personName: clampText(
      source.personName ?? '',
      FLOW_FACT_MAX_LENGTH.personName,
    ),
    dateOfPassing: optionalText(
      source.dateOfPassing,
      FLOW_FACT_MAX_LENGTH.dateOfPassing,
    ),
    serviceDate: optionalText(
      source.serviceDate,
      FLOW_FACT_MAX_LENGTH.serviceDate,
    ),
    obituaryUrl: optionalUrl(source.obituaryUrl),
    obituaryPublisher: optionalText(
      source.obituaryPublisher,
      FLOW_FACT_MAX_LENGTH.obituaryPublisher,
    ),
    serviceReady: source.serviceReady ?? false,
  };
}

/**
 * The reverse for Session fields, which are strings that screens call `.trim()` on: null becomes ''.
 * `obituaryPublisher` and `serviceDate` are optional on a Session, so '' is fine there too.
 */
export function flowFactsToSessionFields(facts: FlowFacts): {
  personName: string;
  dateOfPassing: string;
  serviceDate: string;
  obituaryUrl: string;
  obituaryPublisher: string;
  serviceReady: boolean;
} {
  return {
    personName: facts.personName,
    dateOfPassing: facts.dateOfPassing ?? '',
    serviceDate: facts.serviceDate ?? '',
    obituaryUrl: facts.obituaryUrl ?? '',
    obituaryPublisher: facts.obituaryPublisher ?? '',
    serviceReady: facts.serviceReady,
  };
}

/** Only the whitelisted keys whose value changed from `before` to `after`. */
export function diffFlowFacts(
  before: FlowFactsSource,
  after: FlowFactsSource,
): Partial<FlowFacts> {
  const b = toFlowFacts(before);
  const a = toFlowFacts(after);
  const out: Record<string, unknown> = {};
  for (const key of FLOW_FACT_KEYS) {
    if (a[key] !== b[key]) out[key] = a[key];
  }
  return out as Partial<FlowFacts>;
}

/**
 * Per field, the last write to reach the server wins, except a field with a pending local edit,
 * which keeps the local value until that edit is sent. A field missing from `remote` keeps local.
 * Pure: returns a new object.
 */
export function mergeFlowFacts(
  local: FlowFacts,
  remote: Partial<FlowFacts>,
  pendingFields: Iterable<FlowFactKey>,
): FlowFacts {
  const pending = new Set<FlowFactKey>(pendingFields);
  const merged: Record<string, unknown> = {};
  for (const key of FLOW_FACT_KEYS) {
    const remoteValue = remote[key];
    merged[key] =
      pending.has(key) || remoteValue === undefined ? local[key] : remoteValue;
  }
  return merged as unknown as FlowFacts;
}

/**
 * Several queued edits become one patch holding the latest value per field (later wins). An edit
 * that goes A to B and back to A still sends A: the server may have changed meanwhile, so the
 * device's value is sent on purpose.
 */
export function coalesceFlowPatches(
  patches: readonly FlowFactsSource[],
): Partial<FlowFacts> {
  const out: Record<string, unknown> = {};
  for (const patch of patches) Object.assign(out, pickFlowFacts(patch));
  return out as Partial<FlowFacts>;
}

// NUL is refused by Postgres text columns, so it is refused here first.
const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max && !value.includes('\u0000');

const isNullableText = (value: unknown, max: number): boolean =>
  value === null || isText(value, max);

// Stricter than the database check: http or https only, no whitespace (so no javascript: or data:).
const HTTP_URL = /^https?:\/\/\S+$/i;
const isHttpUrl = (value: string): boolean => HTTP_URL.test(value);

function validField(key: FlowFactKey, value: unknown): boolean {
  switch (key) {
    case 'personName':
      return isText(value, FLOW_FACT_MAX_LENGTH.personName);
    case 'serviceReady':
      return typeof value === 'boolean';
    case 'obituaryUrl':
      return (
        value === null ||
        (isNullableText(value, FLOW_FACT_MAX_LENGTH.obituaryUrl) &&
          isHttpUrl(value as string))
      );
    default:
      return isNullableText(value, FLOW_FACT_MAX_LENGTH[key]);
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validates a partial set of facts (C8). Unknown keys are rejected rather than dropped, so a client
 * sending a draft or contact id gets an error and not a silent success. Null when invalid.
 */
export function parseFlowPatch(input: unknown): Partial<FlowFacts> | null {
  if (!isPlainObject(input)) return null;
  const allowed = new Set<string>(FLOW_FACT_KEYS);
  if (Object.keys(input).some((key) => !allowed.has(key))) return null;
  const out: Record<string, unknown> = {};
  for (const key of FLOW_FACT_KEYS) {
    if (!(key in input)) continue;
    if (!validField(key, input[key])) return null;
    out[key] = input[key];
  }
  return out as Partial<FlowFacts>;
}

/** Validates a complete set of facts: every key present, nothing extra. Null when invalid. */
export function parseFlowFacts(input: unknown): FlowFacts | null {
  const patch = parseFlowPatch(input);
  if (!patch) return null;
  return FLOW_FACT_KEYS.every((key) => key in patch)
    ? (patch as FlowFacts)
    : null;
}

/** Validates a record from the server: uuid ids, a known role, valid facts (extra keys dropped). Null when invalid. */
export function parseFlowRecord(input: unknown): FlowRecord | null {
  if (!isPlainObject(input)) return null;
  const { id, ownerId, role, facts, updatedAt, updatedBy } = input;
  if (typeof id !== 'string' || !isUuid(id)) return null;
  if (typeof ownerId !== 'string' || !isUuid(ownerId)) return null;
  if (role !== 'owner' && role !== 'member') return null;
  if (typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt)))
    return null;
  if (
    updatedBy !== null &&
    (typeof updatedBy !== 'string' || !isUuid(updatedBy))
  )
    return null;
  // Keys the client doesn't know are ignored (a newer server may add some); known ones are checked.
  const parsed = parseFlowFacts(
    isPlainObject(facts) ? pickFlowFacts(facts as FlowFactsSource) : null,
  );
  if (!parsed) return null;
  return { id, ownerId, role, facts: parsed, updatedAt, updatedBy };
}
