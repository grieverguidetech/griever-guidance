import { randomUUID } from 'node:crypto';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { isUuid, parseInviteEmail, type PendingInvite } from '@griever/shared';
import type { Caller } from '../caller.js';
import type { Clock } from '../clock.js';
import { decodeInvite, encodeInvite, encodeToken, isOpen, toPendingInvite, type InviteItem } from '../items/inviteItems.js';
import { decodeMember } from '../items/memberItems.js';
import { getProfile } from '../items/profileItem.js';
import { INVITE_PREFIX, MEMBER_PREFIX, inviteKey, memberOfKey } from '../keys.js';
import { getLive, queryLive } from '../read.js';
import { runAction, type TransactItem, type RunOptions } from '../transact.js';
import { Refusal, profileWrite, type FlowResult } from './flows.js';

/** Same limits as create_invite in Supabase. */
export const INVITES_PER_DAY = 10;
export const MAX_OPEN_INVITES = 20;
export const INVITE_LIFETIME_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_HASH = /^[0-9a-f]{64}$/;

// Positions in the createInvite transaction. A failed condition reports its position.
const CREATE_PROFILE = 0;
const CREATE_TOKEN = 1;
const CREATE_INVITE = 2;
const CREATE_MEMBERSHIP = 3;
const CREATE_RETIRE_EXPIRED = 4;

/**
 * Invites an email address to help. The owner types the address; it is never picked from contacts (C3).
 * One transaction writes the token guard and the invite, checks the caller is not a member, retires an
 * expired invite to the same address, and bumps the owner's profile version. That version check is
 * what stops two calls from passing the rate limit together: the loser reads again and is refused.
 */
export async function createInvite(
  doc: DynamoDBDocumentClient,
  table: string,
  caller: Caller,
  email: string,
  tokenHash: string,
  clock: Clock,
  options: RunOptions = {},
): Promise<FlowResult<PendingInvite>> {
  const address = parseInviteEmail(email);
  if (!address || !TOKEN_HASH.test(tokenHash)) {
    return { ok: false, code: 'invalid' };
  }
  try {
    const result = await runAction(
      doc,
      async () => {
        const nowDate = clock.now();
        const now = nowDate.toISOString();
        const profile = await getProfile(doc, table, caller.userId, clock);
        const memberOf = await getLive(doc, table, memberOfKey(caller.userId), clock);
        if (profile?.accountType === 'member' || memberOf || !caller.emailVerified) {
          throw new Refusal('forbidden');
        }
        if (address === parseInviteEmail(caller.email)) {
          throw new Refusal('invalid');
        }
        const members = await queryLive(doc, table, caller.userId, clock, MEMBER_PREFIX);
        if (members.some((item) => decodeMember(item).email.toLowerCase() === address)) {
          throw new Refusal('already_member');
        }
        const invites = (await queryLive(doc, table, caller.userId, clock, INVITE_PREFIX)).map(decodeInvite);
        const live = (invite: InviteItem) => isOpen(invite) && Date.parse(invite.expiresAt) > nowDate.getTime();
        const expired = invites.find((invite) => invite.email === address && isOpen(invite) && !live(invite));
        const recent = invites.filter((invite) => Date.parse(invite.createdAt) > nowDate.getTime() - DAY_MS);
        if (recent.length >= INVITES_PER_DAY || invites.filter(live).length >= MAX_OPEN_INVITES) {
          throw new Refusal('rate_limited');
        }
        if (invites.some((invite) => invite.email === address && live(invite))) {
          throw new Refusal('already_invited');
        }
        const invite: InviteItem = {
          id: randomUUID(),
          ownerId: caller.userId,
          email: address,
          tokenHash,
          createdAt: now,
          expiresAt: new Date(nowDate.getTime() + INVITE_LIFETIME_DAYS * DAY_MS).toISOString(),
        };
        const items: TransactItem[] = [
          profileWrite(table, caller.userId, profile, now),
          { Put: { TableName: table, Item: encodeToken(tokenHash, caller.userId, invite.id), ConditionExpression: 'attribute_not_exists(pk)' } },
          { Put: { TableName: table, Item: encodeInvite(invite), ConditionExpression: 'attribute_not_exists(pk)' } },
          { ConditionCheck: { TableName: table, Key: memberOfKey(caller.userId), ConditionExpression: 'attribute_not_exists(pk)' } },
        ];
        const retryOn = [CREATE_PROFILE];
        if (expired) {
          items.push({
            Update: {
              TableName: table,
              Key: inviteKey(caller.userId, expired.id),
              UpdateExpression: 'SET revokedAt = :now',
              ConditionExpression: 'attribute_exists(pk) AND attribute_not_exists(revokedAt) AND attribute_not_exists(acceptedAt)',
              ExpressionAttributeValues: { ':now': now },
            },
          });
          retryOn.push(CREATE_RETIRE_EXPIRED);
        }
        return { items, value: toPendingInvite(invite), retryOn };
      },
      options,
    );
    if (result.status === 'ok') {
      return { ok: true, value: result.value };
    }
    if (result.status === 'busy') {
      return { ok: false, code: 'busy' };
    }
    if (result.failedIndex === CREATE_TOKEN || result.failedIndex === CREATE_INVITE) {
      return { ok: false, code: 'already_invited' };
    }
    if (result.failedIndex === CREATE_MEMBERSHIP) {
      return { ok: false, code: 'forbidden' };
    }
    throw new Error(`createInvite: unexpected failed condition at ${result.failedIndex}.`);
  } catch (error) {
    if (error instanceof Refusal) {
      return { ok: false, code: error.code };
    }
    throw error;
  }
}

/**
 * Revokes the caller's own open invite. Another owner's invite, an unknown id, and an invite already
 * revoked or accepted all answer not_found, so the answer shows nothing about other owners.
 */
export async function revokeInvite(
  doc: DynamoDBDocumentClient,
  table: string,
  caller: Caller,
  id: string,
  clock: Clock,
  options: RunOptions = {},
): Promise<FlowResult<null>> {
  if (!isUuid(id)) {
    return { ok: false, code: 'not_found' };
  }
  try {
    const result = await runAction(
      doc,
      async () => {
        const item = await getLive(doc, table, inviteKey(caller.userId, id), clock);
        if (!item || !isOpen(decodeInvite(item))) {
          throw new Refusal('not_found');
        }
        return {
          items: [
            {
              Update: {
                TableName: table,
                Key: inviteKey(caller.userId, id),
                UpdateExpression: 'SET revokedAt = :now',
                ConditionExpression: 'attribute_exists(pk) AND attribute_not_exists(revokedAt) AND attribute_not_exists(acceptedAt)',
                ExpressionAttributeValues: { ':now': clock.now().toISOString() },
              },
            },
          ],
          value: null,
        };
      },
      options,
    );
    if (result.status === 'ok') {
      return { ok: true, value: null };
    }
    if (result.status === 'busy') {
      return { ok: false, code: 'busy' };
    }
    return { ok: false, code: 'not_found' };
  } catch (error) {
    if (error instanceof Refusal) {
      return { ok: false, code: error.code };
    }
    throw error;
  }
}
