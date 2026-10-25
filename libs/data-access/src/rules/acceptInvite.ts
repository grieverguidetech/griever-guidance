import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { parseInviteEmail } from '@griever/shared';
import type { Caller } from '../caller.js';
import type { Clock } from '../clock.js';
import { decodeInvite, isOpen, type InviteItem } from '../items/inviteItems.js';
import { encodeMember, encodeMemberOf } from '../items/memberItems.js';
import {
  encodeProfile,
  getProfile,
  type Profile,
} from '../items/profileItem.js';
import {
  FLOW_PREFIX,
  INVITE_PREFIX,
  MEMBER_PREFIX,
  inviteKey,
  memberOfKey,
  profileKey,
  refGsi,
  tokenKey,
} from '../keys.js';
import { getLive, queryLive } from '../read.js';
import { runAction, type RunOptions, type TransactItem } from '../transact.js';
import { Refusal, type FlowResult } from './flows.js';

const TOKEN_HASH = /^[0-9a-f]{64}$/;

/** One Tx may hold 100 items. Six are fixed (positions 0 to 5); the rest retire the joiner's own live invites. */
const FIXED_ITEMS = 6;
const MAX_OWN_OPEN_INVITES = 100 - FIXED_ITEMS;

// Positions in the acceptInvite transaction. A failed condition reports its position.
const ACCEPT_MEMBER = 1;

/**
 * Accepts an invite as the caller. The link works once, only for the invited email, and only while
 * the owner is a plain owner (C6). One transaction does everything:
 *   0 MEMBER_OF for the caller (must not exist)    1 MEMBER# for the owner, with the accepted email
 *   2 the invite, marked accepted (must still be open and unexpired)
 *   3 the caller's profile, set to member (version check, or a new profile)
 *   4 the owner's profile, version bump (must still be an owner)
 *   5 the owner has no MEMBER_OF          6.. the caller's own live open invites, revoked
 * These conditions take the place of the row locks in Supabase accept_invite. Any failed condition
 * means the reads were stale, so the whole action runs again: the new reads then give the right
 * answer. A caller who owns people, has members or is already a member gets invite_conflict, but
 * only after the token checks pass. Every token failure gives the same `unusable` result.
 */
export async function acceptInvite(
  doc: DynamoDBDocumentClient,
  table: string,
  caller: Caller,
  tokenHash: string,
  clock: Clock,
  options: RunOptions = {},
): Promise<FlowResult<{ ownerId: string }>> {
  try {
    const result = await runAction(
      doc,
      async () => {
        const nowDate = clock.now();
        const now = nowDate.toISOString();
        const email = parseInviteEmail(caller.email);
        if (!email || !caller.emailVerified || !TOKEN_HASH.test(tokenHash)) {
          throw new Refusal('unusable');
        }
        const invite = await findInvite(doc, table, tokenHash, clock);
        if (
          !invite ||
          invite.email !== email ||
          !isOpen(invite) ||
          Date.parse(invite.expiresAt) <= nowDate.getTime() ||
          invite.ownerId === caller.userId
        ) {
          throw new Refusal('unusable');
        }
        const owner = await getProfile(doc, table, invite.ownerId, clock);
        const ownerMemberOf = await getLive(
          doc,
          table,
          memberOfKey(invite.ownerId),
          clock,
        );
        if (owner?.accountType !== 'owner' || ownerMemberOf) {
          throw new Refusal('unusable');
        }

        const profile = await getProfile(doc, table, caller.userId, clock);
        await refuseIfCallerIsTied(doc, table, caller.userId, profile, clock);
        // Expired invites already fail the expiry check, so only live ones are retired.
        const own = (
          await queryLive(doc, table, caller.userId, clock, INVITE_PREFIX)
        )
          .map(decodeInvite)
          .filter(
            (item) =>
              isOpen(item) && Date.parse(item.expiresAt) > nowDate.getTime(),
          );
        // createInvite caps live invites at 20, so this is a safety net, never a normal path.
        if (own.length > MAX_OWN_OPEN_INVITES) {
          throw new Refusal('invite_conflict');
        }

        const items: TransactItem[] = [
          {
            Put: {
              TableName: table,
              Item: encodeMemberOf({
                memberId: caller.userId,
                ownerId: invite.ownerId,
                createdAt: now,
              }),
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          {
            Put: {
              TableName: table,
              Item: encodeMember({
                ownerId: invite.ownerId,
                memberId: caller.userId,
                email,
                createdAt: now,
              }),
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          acceptedInviteUpdate(table, invite, caller.userId, now),
          memberProfileWrite(table, caller.userId, profile, now),
          ownerProfileBump(table, invite.ownerId, now),
          {
            ConditionCheck: {
              TableName: table,
              Key: memberOfKey(invite.ownerId),
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
          ...own.map(
            (item): TransactItem => ({
              Update: {
                TableName: table,
                Key: inviteKey(caller.userId, item.id),
                UpdateExpression: 'SET revokedAt = :now',
                ConditionExpression:
                  'attribute_exists(pk) AND attribute_not_exists(revokedAt) AND attribute_not_exists(acceptedAt)',
                ExpressionAttributeValues: { ':now': now },
              },
            }),
          ),
        ];
        // Every condition except the MEMBER# put is a stale-read check, so those positions re-run the
        // action. An orphan MEMBER# item (no MEMBER_OF) would fail the put forever and no read sees it.
        return {
          items,
          value: { ownerId: invite.ownerId },
          retryOn: items
            .map((_, index) => index)
            .filter((index) => index !== ACCEPT_MEMBER),
        };
      },
      options,
    );
    if (result.status === 'ok') {
      return { ok: true, value: result.value };
    }
    if (result.status === 'busy') {
      return { ok: false, code: 'busy' };
    }
    if (result.failedIndex === ACCEPT_MEMBER) {
      return { ok: false, code: 'unusable' };
    }
    throw new Error(
      `acceptInvite: unexpected failed condition at ${result.failedIndex}.`,
    );
  } catch (error) {
    if (error instanceof Refusal) {
      return { ok: false, code: error.code };
    }
    throw error;
  }
}

/** The invite behind a token, or undefined when the token or the invite is missing. */
async function findInvite(
  doc: DynamoDBDocumentClient,
  table: string,
  tokenHash: string,
  clock: Clock,
): Promise<InviteItem | undefined> {
  const token = await getLive(doc, table, tokenKey(tokenHash), clock);
  const { ownerId, inviteId } = token ?? {};
  if (typeof ownerId !== 'string' || typeof inviteId !== 'string') {
    return undefined;
  }
  const item = await getLive(doc, table, inviteKey(ownerId, inviteId), clock);
  const invite = item ? decodeInvite(item) : undefined;
  return invite?.tokenHash === tokenHash ? invite : undefined;
}

/**
 * The caller cannot join when they already belong to a circle, have members, or own people
 * (soft-deleted ones too, so joining never hides them). Reads only; the Tx conditions guard the race.
 */
async function refuseIfCallerIsTied(
  doc: DynamoDBDocumentClient,
  table: string,
  userId: string,
  profile: Profile | undefined,
  clock: Clock,
): Promise<void> {
  if (profile && profile.accountType !== 'owner') {
    throw new Refusal('invite_conflict');
  }
  if (await getLive(doc, table, memberOfKey(userId), clock)) {
    throw new Refusal('invite_conflict');
  }
  const members = await queryLive(doc, table, userId, clock, MEMBER_PREFIX);
  const flows = await queryLive(doc, table, userId, clock, FLOW_PREFIX);
  if (members.length > 0 || flows.length > 0) {
    throw new Refusal('invite_conflict');
  }
}

/** Marks the invite accepted, only if it is still open and not expired. */
function acceptedInviteUpdate(
  table: string,
  invite: InviteItem,
  userId: string,
  now: string,
): TransactItem {
  const ref = refGsi(userId, 'INVITE', invite.id);
  return {
    Update: {
      TableName: table,
      Key: inviteKey(invite.ownerId, invite.id),
      UpdateExpression:
        'SET acceptedAt = :now, acceptedBy = :by, #gsi1pk = :gsi1pk, #gsi1sk = :gsi1sk',
      ConditionExpression:
        'attribute_exists(pk) AND attribute_not_exists(revokedAt) AND attribute_not_exists(acceptedAt) AND expiresAt > :now',
      ExpressionAttributeNames: { '#gsi1pk': 'gsi1pk', '#gsi1sk': 'gsi1sk' },
      ExpressionAttributeValues: {
        ':now': now,
        ':by': userId,
        ':gsi1pk': ref.gsi1pk,
        ':gsi1sk': ref.gsi1sk,
      },
    },
  };
}

/**
 * Makes the joiner a member and bumps their version. The version check is what stops createFlow, an
 * invite into their account, or a second accept from slipping in between our reads and our write.
 * With no profile yet, it creates one as member.
 */
function memberProfileWrite(
  table: string,
  userId: string,
  profile: Profile | undefined,
  now: string,
): TransactItem {
  if (!profile) {
    return {
      Put: {
        TableName: table,
        Item: encodeProfile({
          userId,
          accountType: 'member',
          version: 1,
          createdAt: now,
          updatedAt: now,
        }),
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    };
  }
  return {
    Update: {
      TableName: table,
      Key: profileKey(userId),
      UpdateExpression:
        'SET accountType = :member, #version = #version + :one, updatedAt = :now',
      ConditionExpression: '#version = :seen AND accountType = :owner',
      ExpressionAttributeNames: { '#version': 'version' },
      ExpressionAttributeValues: {
        ':member': 'member',
        ':one': 1,
        ':now': now,
        ':seen': profile.version,
        ':owner': 'owner',
      },
    },
  };
}

/** Bumps the owner's version (a member joined). The owner must still be an owner. */
function ownerProfileBump(
  table: string,
  ownerId: string,
  now: string,
): TransactItem {
  return {
    Update: {
      TableName: table,
      Key: profileKey(ownerId),
      UpdateExpression: 'SET #version = #version + :one, updatedAt = :now',
      ConditionExpression: 'attribute_exists(pk) AND accountType = :owner',
      ExpressionAttributeNames: { '#version': 'version' },
      ExpressionAttributeValues: { ':one': 1, ':now': now, ':owner': 'owner' },
    },
  };
}
