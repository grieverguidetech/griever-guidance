import {
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { checkAddress, splitFullName, type AccountContactSource, type Address } from '@griever/shared';
import type { Clock } from '../clock.js';
import { profileKey } from '../keys.js';
import { getLive, type Item } from '../read.js';

export interface Profile {
  userId: string;
  senderName?: string;
  contactSource?: AccountContactSource;
  /** firstName, lastName, birthDate and address are private: never logged, never shown to members (members.ts reads senderName only). */
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  address?: Address;
  accountType: 'owner' | 'member';
  /** Bumped by every write that changes role, membership, invites or owned people. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * The exact attributes of a profile item (design §1.2). No contact, draft or message data (C2, C3).
 * Listed one by one, never spread, so a new attribute needs a deliberate change here and in the test.
 */
export function encodeProfile(profile: Profile): Item {
  return {
    ...profileKey(profile.userId),
    entity: 'PROFILE',
    userId: profile.userId,
    senderName: profile.senderName,
    contactSource: profile.contactSource,
    firstName: profile.firstName,
    lastName: profile.lastName,
    birthDate: profile.birthDate,
    address: profile.address,
    accountType: profile.accountType,
    version: profile.version,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function decodeProfile(item: Item): Profile {
  const {
    userId,
    accountType,
    version,
    createdAt,
    updatedAt,
    senderName,
    contactSource,
    fullName,
    firstName,
    lastName,
    birthDate,
    address,
  } = item;
  if (
    typeof userId !== 'string' ||
    (accountType !== 'owner' && accountType !== 'member') ||
    typeof version !== 'number' ||
    typeof createdAt !== 'string' ||
    typeof updatedAt !== 'string'
  ) {
    throw new Error('Profile item is broken.');
  }
  const profile: Profile = {
    userId,
    accountType,
    version,
    createdAt,
    updatedAt,
  };
  if (typeof senderName === 'string') profile.senderName = senderName;
  if (typeof firstName === 'string' || typeof lastName === 'string') {
    if (typeof firstName === 'string') {
      profile.firstName = firstName;
    }
    if (typeof lastName === 'string') {
      profile.lastName = lastName;
    }
  } else if (typeof fullName === 'string') {
    // Saved before first and last name existed: split once on read; the next save writes the two fields.
    const split = splitFullName(fullName);
    if (split.firstName) {
      profile.firstName = split.firstName;
    }
    if (split.lastName) {
      profile.lastName = split.lastName;
    }
  }
  const checked = checkAddress(address);
  if (checked.ok && checked.address) {
    profile.address = checked.address;
  }
  if (typeof birthDate === 'string') {
    profile.birthDate = birthDate;
  }
  if (contactSource === 'import' || contactSource === 'manual')
    profile.contactSource = contactSource;
  return profile;
}

export async function getProfile(
  doc: DynamoDBDocumentClient,
  table: string,
  userId: string,
  clock: Clock,
): Promise<Profile | undefined> {
  const item = await getLive(doc, table, profileKey(userId), clock);
  return item ? decodeProfile(item) : undefined;
}

export interface ProfileFields {
  senderName?: string | null;
  contactSource?: AccountContactSource | null;
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  address?: Address | null;
}
/**
 * Creates or updates the profile (access pattern 2). It sets only the given fields and the
 * timestamps. `accountType`, `version` and `createdAt` are set once with `if_not_exists`;
 * this call never changes them afterwards and does not bump the version.
 */
export async function saveProfileFields(
  doc: DynamoDBDocumentClient,
  table: string,
  userId: string,
  fields: ProfileFields,
  clock: Clock,
): Promise<Profile> {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {
    ':now': clock.now().toISOString(),
    ':owner': 'owner',
    ':zero': 0,
    ':id': userId,
    ':entity': 'PROFILE',
  };
  const sets = [
    'updatedAt = :now',
    'createdAt = if_not_exists(createdAt, :now)',
    'accountType = if_not_exists(accountType, :owner)',
    '#version = if_not_exists(#version, :zero)',
    'userId = :id',
    'entity = :entity',
  ];
  names['#version'] = 'version';
  if (fields.senderName !== undefined) {
    sets.push('senderName = :senderName');
    values[':senderName'] = fields.senderName;
  }
  if (fields.contactSource !== undefined) {
    sets.push('contactSource = :contactSource');
    values[':contactSource'] = fields.contactSource;
  }
  if (fields.firstName !== undefined) {
    sets.push('firstName = :firstName');
    values[':firstName'] = fields.firstName;
  }
  if (fields.lastName !== undefined) {
    sets.push('lastName = :lastName');
    values[':lastName'] = fields.lastName;
  }
  if (fields.birthDate !== undefined) {
    sets.push('birthDate = :birthDate');
    values[':birthDate'] = fields.birthDate;
  }
  if (fields.address !== undefined) {
    sets.push('address = :address');
    values[':address'] = fields.address;
  }
  // Once first or last name is written, the old single-string name is dropped so it cannot come back.
  const removes = fields.firstName !== undefined || fields.lastName !== undefined ? ' REMOVE fullName' : '';
  const { Attributes } = await doc.send(
    new UpdateCommand({
      TableName: table,
      Key: profileKey(userId),
      UpdateExpression: `SET ${sets.join(', ')}${removes}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }),
  );
  return decodeProfile(Attributes as Item);
}
