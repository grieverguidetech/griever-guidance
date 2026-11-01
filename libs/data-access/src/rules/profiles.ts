import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { checkAddress, isValidBirthDate, isValidFullName, isValidNamePart, normalizeFullName, normalizeNamePart, splitFullName } from '@griever/shared';
import type { Caller } from '../caller';
import type { Clock } from '../clock';
import {
  getProfile as readProfile,
  saveProfileFields,
  type Profile,
  type ProfileFields,
} from '../items/profileItem';

/** Longest sender name, in characters. */
export const SENDER_NAME_MAX_LENGTH = 100;

const PROFILE_KEYS = new Set(['senderName', 'contactSource', 'fullName', 'firstName', 'lastName', 'birthDate', 'address']);

export type ProfileResult =
  | { ok: true; value: Profile }
  | { ok: false; code: 'invalid' };

/**
 * Checks what a user sent to change their profile. Only senderName, contactSource, firstName, lastName, birthDate and address are allowed.
 * fullName is still accepted from older clients and is split into first and last name.
 * Sending firstName also sets senderName to it (messages are signed with the first name).
 * Any other key, such as accountType or version, makes the whole input invalid. Null clears a field.
 */
export function parseProfileFields(input: unknown): ProfileFields | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !PROFILE_KEYS.has(key))) {
    return null;
  }
  const fields: ProfileFields = {};
  const { senderName, contactSource, fullName, firstName, lastName, birthDate, address } = record;
  if (senderName !== undefined) {
    // [...text] counts characters like Postgres does, so one emoji counts as 1, not 2.
    if (
      senderName !== null &&
      (typeof senderName !== 'string' ||
        [...senderName].length > SENDER_NAME_MAX_LENGTH)
    ) {
      return null;
    }
    fields.senderName = senderName;
  }
  if (contactSource !== undefined) {
    if (
      contactSource !== null &&
      contactSource !== 'import' &&
      contactSource !== 'manual'
    ) {
      return null;
    }
    fields.contactSource = contactSource;
  }
  if (fullName !== undefined) {
    const cleaned = normalizeFullName(fullName);
    if (cleaned !== null && !isValidFullName(cleaned)) {
      return null;
    }
    // An old client: split the one string. firstName and lastName below win if they are sent too.
    const split = splitFullName(cleaned as string | null);
    if (
      (split.firstName !== null && !isValidNamePart(split.firstName)) ||
      (split.lastName !== null && !isValidNamePart(split.lastName))
    ) {
      return null;
    }
    fields.firstName = split.firstName;
    fields.lastName = split.lastName;
  }
  for (const [key, value] of [['firstName', firstName], ['lastName', lastName]] as const) {
    if (value === undefined) {
      continue;
    }
    const cleaned = normalizeNamePart(value);
    if (cleaned !== null && !isValidNamePart(cleaned)) {
      return null;
    }
    fields[key] = cleaned as string | null;
  }
  // Messages are signed with the first name. A blank first name never clears the signature.
  if (typeof fields.firstName === 'string' && firstName !== undefined) {
    fields.senderName = fields.firstName;
  }
  if (address !== undefined) {
    const checked = checkAddress(address);
    if (!checked.ok) {
      return null;
    }
    fields.address = checked.address;
  }
  if (birthDate !== undefined) {
    if (birthDate !== null && !isValidBirthDate(birthDate)) {
      return null;
    }
    fields.birthDate = birthDate;
  }
  return fields;
}

/** The caller's own profile, or null. There is no way to read someone else's. */
export async function getProfile(
  doc: DynamoDBDocumentClient,
  table: string,
  caller: Caller,
  clock: Clock,
): Promise<Profile | null> {
  return (await readProfile(doc, table, caller.userId, clock)) ?? null;
}

/**
 * Creates or updates the caller's own profile. It changes only senderName, contactSource, firstName, lastName, birthDate and address.
 * accountType, version, userId and createdAt are never taken from the input.
 */
export async function putProfile(
  doc: DynamoDBDocumentClient,
  table: string,
  caller: Caller,
  input: unknown,
  clock: Clock,
): Promise<ProfileResult> {
  const fields = parseProfileFields(input);
  if (!fields) {
    return { ok: false, code: 'invalid' };
  }
  // Saving only one name part: fill the other from what is stored (a legacy fullName is split on read),
  // so the old fullName can be dropped without losing the part that was not sent.
  if ((fields.firstName === undefined) !== (fields.lastName === undefined)) {
    const stored = await readProfile(doc, table, caller.userId, clock);
    if (fields.firstName === undefined) {
      fields.firstName = stored?.firstName ?? null;
    } else {
      fields.lastName = stored?.lastName ?? null;
    }
  }
  const profile = await saveProfileFields(
    doc,
    table,
    caller.userId,
    fields,
    clock,
  );
  return { ok: true, value: profile };
}
