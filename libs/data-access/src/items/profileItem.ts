import {
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { AccountContactSource } from '@griever/shared';
import type { Clock } from '../clock.js';
import { profileKey } from '../keys.js';
import { getLive, type Item } from '../read.js';

export interface Profile {
  userId: string;
  senderName?: string;
  contactSource?: AccountContactSource;
  /** Private: never logged, never shown to members (members.ts reads senderName only). */
  fullName?: string;
  birthDate?: string;
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
    fullName: profile.fullName,
    birthDate: profile.birthDate,
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
    birthDate,
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
  if (typeof fullName === 'string') {
    profile.fullName = fullName;
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
  fullName?: string | null;
  birthDate?: string | null;
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
  if (fields.fullName !== undefined) {
    sets.push('fullName = :fullName');
    values[':fullName'] = fields.fullName;
  }
  if (fields.birthDate !== undefined) {
    sets.push('birthDate = :birthDate');
    values[':birthDate'] = fields.birthDate;
  }
  const { Attributes } = await doc.send(
    new UpdateCommand({
      TableName: table,
      Key: profileKey(userId),
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }),
  );
  return decodeProfile(Attributes as Item);
}
