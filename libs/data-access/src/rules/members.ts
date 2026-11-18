import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { MembersView } from '@griever/shared';
import type { Caller } from '../caller.js';
import type { Clock } from '../clock.js';
import { decodeInvite, isOpen, toPendingInvite } from '../items/inviteItems.js';
import { decodeMember, decodeMemberOf } from '../items/memberItems.js';
import { encodeProfile, getProfile, type Profile } from '../items/profileItem.js';
import { INVITE_PREFIX, MEMBER_PREFIX, memberKey, memberOfKey, profileKey } from '../keys.js';
import { getLive, queryLive } from '../read.js';
import { runAction, type RunOptions, type TransactItem } from '../transact.js';
import { Refusal, type FlowResult } from './flows.js';

const byCreatedAt = (a: { createdAt: string }, b: { createdAt: string }) => a.createdAt.localeCompare(b.createdAt);

/**
 * What the Helpers screen shows. A member sees their owner. Anyone else sees the owner view: their
 * members in join order (with the email each accepted with) and their open, unexpired invites in
 * creation order. A stranger gets empty lists. No invite carries its token hash.
 */
export async function listMembers(
  doc: DynamoDBDocumentClient,
  table: string,
  caller: Caller,
  clock: Clock,
): Promise<MembersView> {
  const memberOf = await getLive(doc, table, memberOfKey(caller.userId), clock);
  if (memberOf) {
    const { ownerId } = decodeMemberOf(memberOf);
    const owner = await getProfile(doc, table, ownerId, clock);
    return { role: 'member', owner: { id: ownerId, name: owner?.senderName ?? null } };
  }
  const memberItems = (await queryLive(doc, table, caller.userId, clock, MEMBER_PREFIX)).map(decodeMember);
  const members = [];
  for (const member of memberItems.sort(byCreatedAt)) {
    const profile = await getProfile(doc, table, member.memberId, clock);
    members.push({ id: member.memberId, name: profile?.senderName ?? null, email: member.email });
  }
  const now = clock.now().getTime();
  const invites = (await queryLive(doc, table, caller.userId, clock, INVITE_PREFIX))
    .map(decodeInvite)
    .filter((invite) => isOpen(invite) && Date.parse(invite.expiresAt) > now)
    .sort(byCreatedAt)
    .map(toPendingInvite);
  return { role: 'owner', members, invites };
}

/**
 * Bumps the owner's profile version with no condition, for writes that change membership or invites
 * (profileItem.ts: version). A missing profile is created as owner.
 */
export function bumpOwnerVersion(table: string, ownerId: string, now: string): TransactItem {
  return {
    Update: {
      TableName: table,
      Key: profileKey(ownerId),
      UpdateExpression:
        'SET #version = if_not_exists(#version, :zero) + :one, updatedAt = :now, accountType = if_not_exists(accountType, :owner), userId = :id, entity = :entity, createdAt = if_not_exists(createdAt, :now)',
      ExpressionAttributeNames: { '#version': 'version' },
      ExpressionAttributeValues: {
        ':zero': 0,
        ':one': 1,
        ':now': now,
        ':owner': 'owner',
        ':id': ownerId,
        ':entity': 'PROFILE',
      },
    },
  };
}

// Positions in the removeMember transaction.
const REMOVE_MEMBER = 0;
const REMOVE_MEMBER_OF = 1;

/**
 * Removes one of the caller's members. One transaction deletes both membership items and sets the
 * member's profile back to owner with a version bump. Another owner's
 * member, the caller themself, and an unknown id all answer not_found.
 */
export async function removeMember(
  doc: DynamoDBDocumentClient,
  table: string,
  caller: Caller,
  memberId: string,
  clock: Clock,
  options: RunOptions = {},
): Promise<FlowResult<null>> {
  // Removing yourself is never valid, and it would put two writes on one profile item in the Tx.
  if (memberId === caller.userId) {
    return { ok: false, code: 'not_found' };
  }
  let key;
  try {
    key = memberKey(caller.userId, memberId);
  } catch {
    return { ok: false, code: 'not_found' };
  }
  const result = await runAction(doc, async () => {
    const now = clock.now().toISOString();
    return {
      items: [
        {
          Delete: {
            TableName: table,
            Key: key,
            ConditionExpression: 'attribute_exists(pk)',
          },
        },
        {
          Delete: {
            TableName: table,
            Key: memberOfKey(memberId),
            // A MEMBER# item with no MEMBER_OF (left by a half-finished write) can still be removed.
            ConditionExpression: 'attribute_not_exists(pk) OR ownerId = :owner',
            ExpressionAttributeValues: { ':owner': caller.userId },
          },
        },
        {
          Update: {
            TableName: table,
            Key: profileKey(memberId),
            UpdateExpression:
              'SET accountType = :owner, #version = if_not_exists(#version, :zero) + :one, updatedAt = :now, userId = :id, entity = :entity, createdAt = if_not_exists(createdAt, :now)',
            ExpressionAttributeNames: { '#version': 'version' },
            ExpressionAttributeValues: {
              ':owner': 'owner',
              ':zero': 0,
              ':one': 1,
              ':now': now,
              ':id': memberId,
              ':entity': 'PROFILE',
            },
          },
        },
        bumpOwnerVersion(table, caller.userId, now),
      ],
      value: null,
    };
  }, options);
  if (result.status === 'ok') {
    return { ok: true, value: null };
  }
  if (result.status === 'busy') {
    return { ok: false, code: 'busy' };
  }
  if (result.failedIndex === REMOVE_MEMBER || result.failedIndex === REMOVE_MEMBER_OF) {
    return { ok: false, code: 'not_found' };
  }
  throw new Error(`removeMember: unexpected failed condition at ${result.failedIndex}.`);
}

// Positions in the leaveFamily transaction.
const LEAVE_MEMBER_OF = 0;
const LEAVE_PROFILE = 2;

/**
 * The caller stops being a member and becomes an owner with no members. One transaction deletes both
 * membership items, sets their profile to owner with a version bump (conditional on the version
 * read, so a stale read runs the action again), and bumps the former owner's version. An owner or a
 * non-member gets not_found with nothing written. The former owner's other members and flows are
 * not touched.
 */
export async function leaveFamily(
  doc: DynamoDBDocumentClient,
  table: string,
  caller: Caller,
  clock: Clock,
  options: RunOptions = {},
): Promise<FlowResult<null>> {
  try {
    const result = await runAction(
      doc,
      async () => {
        const now = clock.now().toISOString();
        const memberOf = await getLive(doc, table, memberOfKey(caller.userId), clock);
        if (!memberOf) {
          throw new Refusal('not_found');
        }
        const { ownerId } = decodeMemberOf(memberOf);
        const profile = await getProfile(doc, table, caller.userId, clock);
        const items: TransactItem[] = [
          {
            Delete: {
              TableName: table,
              Key: memberOfKey(caller.userId),
              ConditionExpression: 'ownerId = :owner',
              ExpressionAttributeValues: { ':owner': ownerId },
            },
          },
          // No condition: a MEMBER_OF with no MEMBER# (left by a half-finished write) can still be left.
          { Delete: { TableName: table, Key: memberKey(ownerId, caller.userId) } },
          ownerProfileOnLeave(table, caller.userId, profile, now),
          bumpOwnerVersion(table, ownerId, now),
        ];
        return { items, value: null, retryOn: [LEAVE_MEMBER_OF, LEAVE_PROFILE] };
      },
      options,
    );
    if (result.status === 'ok') {
      return { ok: true, value: null };
    }
    if (result.status === 'busy') {
      return { ok: false, code: 'busy' };
    }
    throw new Error(`leaveFamily: unexpected failed condition at ${result.failedIndex}.`);
  } catch (error) {
    if (error instanceof Refusal) {
      return { ok: false, code: error.code };
    }
    throw error;
  }
}

/** Sets the leaver to owner if nobody changed their profile since the read. With no profile, creates one as owner. */
function ownerProfileOnLeave(table: string, userId: string, profile: Profile | undefined, now: string): TransactItem {
  if (!profile) {
    return {
      Put: {
        TableName: table,
        Item: encodeProfile({ userId, accountType: 'owner', version: 1, createdAt: now, updatedAt: now }),
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    };
  }
  return {
    Update: {
      TableName: table,
      Key: profileKey(userId),
      UpdateExpression: 'SET accountType = :owner, #version = #version + :one, updatedAt = :now',
      ConditionExpression: '#version = :seen',
      ExpressionAttributeNames: { '#version': 'version' },
      ExpressionAttributeValues: { ':owner': 'owner', ':one': 1, ':now': now, ':seen': profile.version },
    },
  };
}
