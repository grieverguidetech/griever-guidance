import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { isValidBirthDate, isValidFullName } from '@griever/shared';
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

const PROFILE_KEYS = new Set(['senderName', 'contactSource', 'fullName', 'birthDate']);

export type ProfileResult =
  | { ok: true; value: Profile }
  | { ok: false; code: 'invalid' };

/**
 * Checks what a user sent to change their profile. Only senderName, contactSource, fullName and birthDate are allowed.
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
  const { senderName, contactSource, fullName, birthDate } = record;
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
    if (fullName !== null && !isValidFullName(fullName)) {
      return null;
    }
    fields.fullName = fullName;
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
 * Creates or updates the caller's own profile. It changes only senderName, contactSource, fullName and birthDate.
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
  const profile = await saveProfileFields(
    doc,
    table,
    caller.userId,
    fields,
    clock,
  );
  return { ok: true, value: profile };
}
