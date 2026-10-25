import { createHash, randomUUID } from 'node:crypto';
import { DeleteCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { fixedClock } from '../clock.js';
import { encodeFlow } from '../items/flowItem.js';
import {
  decodeInvite,
  encodeInvite,
  encodeToken,
  type InviteItem,
} from '../items/inviteItems.js';
import {
  decodeMember,
  encodeMember,
  encodeMemberOf,
} from '../items/memberItems.js';
import { encodeProfile, getProfile } from '../items/profileItem.js';
import { conflictDouble } from '../testing/conflictDouble.js';
import { inviteKey, memberKey, memberOfKey, refGsi } from '../keys.js';
import { getLive, queryLive } from '../read.js';
import {
  createTables,
  doc,
  dropTables,
  rawPut,
  table,
  up,
} from '../testing/localTable.js';
import { acceptInvite } from './acceptInvite.js';
import { createFlow } from './flows.js';
import { revokeInvite } from './invites.js';
import { removeMember } from './members.js';

const clock = fixedClock('2026-10-24T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) =>
  new Date(clock.now().getTime() + offsetMs).toISOString();
const noSleep = { sleep: async () => undefined };
const hash = () => createHash('sha256').update(randomUUID()).digest('hex');
const uid = (name: string) => `user_${name}_${randomUUID().slice(0, 8)}`;
const caller = (
  userId: string,
  email = `${userId}@example.test`,
  emailVerified = true,
) => ({
  userId,
  email,
  emailVerified,
});

const profile = (
  userId: string,
  accountType: 'owner' | 'member' = 'owner',
  version = 1,
) =>
  rawPut(
    encodeProfile({
      userId,
      accountType,
      version,
      createdAt: at(-99 * HOUR),
      updatedAt: at(-99 * HOUR),
    }),
  );

const FACTS = {
  personName: 'Grandma',
  dateOfPassing: null,
  serviceDate: null,
  obituaryUrl: null,
  obituaryPublisher: null,
  serviceReady: false,
};

const flowItem = (ownerId: string) => ({
  id: randomUUID(),
  ownerId,
  facts: FACTS,
  createdAt: at(-HOUR),
  updatedAt: at(-HOUR),
  updatedBy: ownerId,
});

/** An invite with its token guard, addressed to `to`. */
async function seedInvite(
  ownerId: string,
  to: string,
  overrides: Partial<InviteItem> = {},
) {
  const invite: InviteItem = {
    id: randomUUID(),
    ownerId,
    email: to.toLowerCase(),
    tokenHash: hash(),
    createdAt: at(-HOUR),
    expiresAt: at(24 * HOUR),
    ...overrides,
  };
  await rawPut(encodeInvite(invite));
  await rawPut(encodeToken(invite.tokenHash, ownerId, invite.id));
  return invite;
}

const readInvite = async (invite: InviteItem) =>
  decodeInvite(
    (await getLive(doc, table, inviteKey(invite.ownerId, invite.id), clock))!,
  );

const UNUSABLE = { ok: false, code: 'unusable' };

/** Everything stored under a user, to prove a refusal wrote nothing. */
async function snapshot(...ids: string[]) {
  const all = [];
  for (const id of ids) {
    all.push(await queryLive(doc, table, id, clock));
  }
  return JSON.stringify(all);
}

describe.runIf(up)('acceptInvite on DynamoDB Local', () => {
  beforeAll(createTables);
  afterAll(dropTables);

  describe('success', () => {
    it('makes the membership, marks the invite, retires own invites and bumps both profiles', async () => {
      const owner = uid('owner');
      const joiner = uid('joiner');
      await profile(owner, 'owner', 4);
      await profile(joiner, 'owner', 7);
      const invite = await seedInvite(owner, `${joiner}@Example.test`);
      const own = await seedInvite(joiner, 'friend@example.test');
      const accepted = await seedInvite(joiner, 'old@example.test', {
        acceptedAt: at(-HOUR),
        acceptedBy: 'someone',
      });

      const result = await acceptInvite(
        doc,
        table,
        caller(joiner, `${joiner}@EXAMPLE.test`),
        invite.tokenHash,
        clock,
      );

      expect(result).toEqual({ ok: true, value: { ownerId: owner } });
      const saved = await readInvite(invite);
      expect(saved.acceptedAt).toBe(clock.now().toISOString());
      expect(saved.acceptedBy).toBe(joiner);
      const raw = await getLive(doc, table, inviteKey(owner, invite.id), clock);
      expect(raw).toMatchObject(refGsi(joiner, 'INVITE', invite.id));
      expect(
        decodeMember(
          (await getLive(doc, table, memberKey(owner, joiner), clock))!,
        ).email,
      ).toBe(`${joiner}@example.test`);
      expect(
        await getLive(doc, table, memberOfKey(joiner), clock),
      ).toMatchObject({ ownerId: owner });
      expect((await readInvite(own)).revokedAt).toBe(clock.now().toISOString());
      expect((await readInvite(accepted)).revokedAt).toBeUndefined();
      expect(await getProfile(doc, table, joiner, clock)).toMatchObject({
        accountType: 'member',
        version: 8,
      });
      expect(await getProfile(doc, table, owner, clock)).toMatchObject({
        accountType: 'owner',
        version: 5,
      });
    });

    it('creates the profile as member when the joiner has none', async () => {
      const owner = uid('owner');
      const joiner = uid('joiner');
      await profile(owner);
      const invite = await seedInvite(owner, `${joiner}@example.test`);

      const result = await acceptInvite(
        doc,
        table,
        caller(joiner),
        invite.tokenHash,
        clock,
      );

      expect(result).toEqual({ ok: true, value: { ownerId: owner } });
      expect(await getProfile(doc, table, joiner, clock)).toMatchObject({
        accountType: 'member',
        version: 1,
      });
    });

    it('cannot be used a second time', async () => {
      const owner = uid('owner');
      const joiner = uid('joiner');
      await profile(owner);
      const invite = await seedInvite(owner, `${joiner}@example.test`);
      await acceptInvite(doc, table, caller(joiner), invite.tokenHash, clock);

      expect(
        await acceptInvite(doc, table, caller(joiner), invite.tokenHash, clock),
      ).toEqual(UNUSABLE);
    });
  });

  describe('unusable', () => {
    const owner = uid('uowner');
    const joiner = uid('ujoiner');
    const joinerEmail = `${joiner}@example.test`;
    const modes: Record<
      string,
      () => Promise<{ hash: string; who?: ReturnType<typeof caller> }>
    > = {
      'unknown token': async () => ({ hash: hash() }),
      'malformed token': async () => ({ hash: 'nope' }),
      'token without an invite': async () => {
        const h = hash();
        await rawPut(encodeToken(h, owner, randomUUID()));
        return { hash: h };
      },
      'another email': async () => ({
        hash: (await seedInvite(owner, 'other@example.test')).tokenHash,
      }),
      expired: async () => ({
        hash: (await seedInvite(owner, joinerEmail, { expiresAt: at(-1) }))
          .tokenHash,
      }),
      'already accepted': async () => ({
        hash: (
          await seedInvite(owner, joinerEmail, {
            acceptedAt: at(-HOUR),
            acceptedBy: 'x',
          })
        ).tokenHash,
      }),
      revoked: async () => ({
        hash: (await seedInvite(owner, joinerEmail, { revokedAt: at(-HOUR) }))
          .tokenHash,
      }),
      'own invite': async () => ({
        hash: (await seedInvite(joiner, joinerEmail)).tokenHash,
      }),
      'unverified email': async () => ({
        hash: (await seedInvite(owner, joinerEmail)).tokenHash,
        who: caller(joiner, joinerEmail, false),
      }),
      'owner is a member': async () => {
        const other = uid('memberowner');
        await profile(other, 'member');
        await rawPut(
          encodeMemberOf({
            memberId: other,
            ownerId: owner,
            createdAt: at(-HOUR),
          }),
        );
        return { hash: (await seedInvite(other, joinerEmail)).tokenHash };
      },
      'owner is not an owner': async () => {
        const other = uid('notowner');
        await profile(other, 'member');
        return { hash: (await seedInvite(other, joinerEmail)).tokenHash };
      },
      'owner has no profile': async () => ({
        hash: (await seedInvite(uid('noprofile'), joinerEmail)).tokenHash,
      }),
    };

    beforeAll(async () => {
      await profile(owner);
      await profile(joiner);
    });

    it.each(Object.keys(modes))(
      'answers the same result for: %s, and writes nothing',
      async (mode) => {
        const { hash: token, who } = await modes[mode]!();
        const before = await snapshot(owner, joiner);

        const result = await acceptInvite(
          doc,
          table,
          who ?? caller(joiner, joinerEmail),
          token,
          clock,
        );

        expect(result).toEqual(UNUSABLE);
        expect(JSON.stringify(result)).toBe(JSON.stringify(UNUSABLE));
        expect(await snapshot(owner, joiner)).toBe(before);
      },
    );
  });

  describe('invite_conflict', () => {
    const CONFLICT = { ok: false, code: 'invite_conflict' };
    const modes: Record<string, (joiner: string) => Promise<void>> = {
      'is already a member': async (joiner) => {
        await profile(joiner, 'member');
        await rawPut(
          encodeMemberOf({
            memberId: joiner,
            ownerId: uid('else'),
            createdAt: at(-HOUR),
          }),
        );
      },
      'has a member profile': async (joiner) => {
        await profile(joiner, 'member');
      },
      'has members': async (joiner) => {
        await profile(joiner);
        await rawPut(
          encodeMember({
            ownerId: joiner,
            memberId: uid('m'),
            email: 'm@example.test',
            createdAt: at(-HOUR),
          }),
        );
      },
      'owns a person': async (joiner) => {
        await profile(joiner);
        await rawPut(encodeFlow(flowItem(joiner)));
      },
      'owns a soft-deleted person': async (joiner) => {
        await profile(joiner);
        await rawPut(encodeFlow({ ...flowItem(joiner), deletedAt: at(-HOUR) }));
      },
    };

    it.each(Object.keys(modes))(
      'refuses a joiner who %s, and writes nothing',
      async (mode) => {
        const owner = uid('owner');
        const joiner = uid('joiner');
        await profile(owner);
        await modes[mode]!(joiner);
        const invite = await seedInvite(owner, `${joiner}@example.test`);
        const before = await snapshot(owner, joiner);

        expect(
          await acceptInvite(
            doc,
            table,
            caller(joiner),
            invite.tokenHash,
            clock,
          ),
        ).toEqual(CONFLICT);

        expect(await snapshot(owner, joiner)).toBe(before);
      },
    );

    it('does not count a person whose ttl has passed', async () => {
      const owner = uid('owner');
      const joiner = uid('joiner');
      await profile(owner);
      await profile(joiner);
      await rawPut({
        ...encodeFlow(flowItem(joiner)),
        ttl: Math.floor(clock.now().getTime() / 1000) - 10,
      });
      const invite = await seedInvite(owner, `${joiner}@example.test`);

      expect(
        await acceptInvite(doc, table, caller(joiner), invite.tokenHash, clock),
      ).toEqual({
        ok: true,
        value: { ownerId: owner },
      });
    });

    it('answers unusable, not a conflict, when the token also fails', async () => {
      const owner = uid('owner');
      const joiner = uid('joiner');
      await profile(owner);
      await profile(joiner, 'member');
      const invite = await seedInvite(owner, `${joiner}@example.test`, {
        revokedAt: at(-HOUR),
      });

      expect(
        await acceptInvite(doc, table, caller(joiner), invite.tokenHash, clock),
      ).toEqual(UNUSABLE);
    });
  });

  describe('races', () => {
    it('lets one of two joiners win on one invite', async () => {
      const owner = uid('owner');
      const a = uid('a');
      const b = uid('b');
      await profile(owner);
      const invite = await seedInvite(owner, `${a}@example.test`);
      // Same address for both callers, so only the single-use rule can separate them.
      const sameEmail = (id: string) => caller(id, `${a}@example.test`);
      let rival: unknown;

      const result = await acceptInvite(
        doc,
        table,
        sameEmail(a),
        invite.tokenHash,
        clock,
        {
          ...noSleep,
          beforeCommit: async (attempt) => {
            if (attempt === 1) {
              rival = await acceptInvite(
                doc,
                table,
                sameEmail(b),
                invite.tokenHash,
                clock,
              );
            }
          },
        },
      );

      expect(rival).toEqual({ ok: true, value: { ownerId: owner } });
      expect(result).toEqual(UNUSABLE);
      expect(await getLive(doc, table, memberOfKey(a), clock)).toBeUndefined();
      expect((await readInvite(invite)).acceptedBy).toBe(b);
    });

    it('lets one win when the joiner is also invited into by someone else', async () => {
      const x = uid('x');
      const y = uid('y');
      await profile(x);
      await profile(y);
      const xInvitesY = await seedInvite(x, `${y}@example.test`);
      const yInvitesX = await seedInvite(y, `${x}@example.test`);
      let rival: unknown;

      const result = await acceptInvite(
        doc,
        table,
        caller(y),
        xInvitesY.tokenHash,
        clock,
        {
          ...noSleep,
          beforeCommit: async (attempt) => {
            if (attempt === 1) {
              rival = await acceptInvite(
                doc,
                table,
                caller(x),
                yInvitesX.tokenHash,
                clock,
              );
            }
          },
        },
      );

      expect(rival).toEqual({ ok: true, value: { ownerId: y } });
      // x is now a member of y, so x's invite no longer works for y.
      expect(result).toEqual(UNUSABLE);
      expect(await getLive(doc, table, memberOfKey(y), clock)).toBeUndefined();
      expect(await getLive(doc, table, memberOfKey(x), clock)).toMatchObject({
        ownerId: y,
      });
    });

    it('lets one win when two owners invite the same joiner', async () => {
      const x = uid('x');
      const y = uid('y');
      const joiner = uid('joiner');
      await profile(x);
      await profile(y);
      await profile(joiner);
      const fromX = await seedInvite(x, `${joiner}@example.test`);
      const fromY = await seedInvite(y, `${joiner}@example.test`);
      let rival: unknown;

      const result = await acceptInvite(
        doc,
        table,
        caller(joiner),
        fromX.tokenHash,
        clock,
        {
          ...noSleep,
          beforeCommit: async (attempt) => {
            if (attempt === 1) {
              rival = await acceptInvite(
                doc,
                table,
                caller(joiner),
                fromY.tokenHash,
                clock,
              );
            }
          },
        },
      );

      expect(rival).toEqual({ ok: true, value: { ownerId: y } });
      expect(result).toEqual({ ok: false, code: 'invite_conflict' });
      expect(
        await getLive(doc, table, memberOfKey(joiner), clock),
      ).toMatchObject({ ownerId: y });
      expect(
        await getLive(doc, table, memberKey(x, joiner), clock),
      ).toBeUndefined();
    });

    it('createFlow during accept: the flow exists and accept says invite_conflict, never both', async () => {
      const owner = uid('owner');
      const joiner = uid('joiner');
      await profile(owner);
      await profile(joiner);
      const invite = await seedInvite(owner, `${joiner}@example.test`);
      const flowId = randomUUID();
      let created: unknown;

      const result = await acceptInvite(
        doc,
        table,
        caller(joiner),
        invite.tokenHash,
        clock,
        {
          ...noSleep,
          beforeCommit: async (attempt) => {
            if (attempt === 1) {
              created = await createFlow(
                doc,
                table,
                caller(joiner),
                flowId,
                FACTS,
                clock,
              );
            }
          },
        },
      );

      expect(created).toMatchObject({ ok: true });
      expect(result).toEqual({ ok: false, code: 'invite_conflict' });
      expect(
        await getLive(doc, table, memberOfKey(joiner), clock),
      ).toBeUndefined();
      expect(await getProfile(doc, table, joiner, clock)).toMatchObject({
        accountType: 'owner',
      });
    });

    it('accept before createFlow: the membership exists and createFlow says forbidden', async () => {
      const owner = uid('owner');
      const joiner = uid('joiner');
      await profile(owner);
      await profile(joiner);
      const invite = await seedInvite(owner, `${joiner}@example.test`);
      let accepted: unknown;

      const created = await createFlow(
        doc,
        table,
        caller(joiner),
        randomUUID(),
        FACTS,
        clock,
        {
          ...noSleep,
          beforeCommit: async (attempt) => {
            if (attempt === 1) {
              accepted = await acceptInvite(
                doc,
                table,
                caller(joiner),
                invite.tokenHash,
                clock,
              );
            }
          },
        },
      );

      expect(accepted).toEqual({ ok: true, value: { ownerId: owner } });
      expect(created).toEqual({ ok: false, code: 'forbidden' });
    });

    it('createFlow during accept for a joiner with no profile gives the same outcome', async () => {
      const owner = uid('owner');
      const joiner = uid('joiner');
      await profile(owner);
      const invite = await seedInvite(owner, `${joiner}@example.test`);

      const result = await acceptInvite(
        doc,
        table,
        caller(joiner),
        invite.tokenHash,
        clock,
        {
          ...noSleep,
          beforeCommit: async (attempt) => {
            if (attempt === 1) {
              await createFlow(
                doc,
                table,
                caller(joiner),
                randomUUID(),
                FACTS,
                clock,
              );
            }
          },
        },
      );

      expect(result).toEqual({ ok: false, code: 'invite_conflict' });
      expect(
        await getLive(doc, table, memberOfKey(joiner), clock),
      ).toBeUndefined();
    });

    it('the owner revokes the invite during accept: accept says unusable', async () => {
      const owner = uid('owner');
      const joiner = uid('joiner');
      await profile(owner);
      await profile(joiner);
      const invite = await seedInvite(owner, `${joiner}@example.test`);

      const result = await acceptInvite(
        doc,
        table,
        caller(joiner),
        invite.tokenHash,
        clock,
        {
          ...noSleep,
          beforeCommit: async (attempt) => {
            if (attempt === 1) {
              await revokeInvite(doc, table, caller(owner), invite.id, clock);
            }
          },
        },
      );

      expect(result).toEqual(UNUSABLE);
      expect(
        await getLive(doc, table, memberOfKey(joiner), clock),
      ).toBeUndefined();
    });

    it('the owner removes the new member right after accept: nothing is left half done', async () => {
      const owner = uid('owner');
      const joiner = uid('joiner');
      await profile(owner);
      await profile(joiner);
      const invite = await seedInvite(owner, `${joiner}@example.test`);
      await acceptInvite(doc, table, caller(joiner), invite.tokenHash, clock);

      expect(
        await removeMember(doc, table, caller(owner), joiner, clock),
      ).toEqual({ ok: true, value: null });

      expect(
        await getLive(doc, table, memberOfKey(joiner), clock),
      ).toBeUndefined();
      expect(
        await getLive(doc, table, memberKey(owner, joiner), clock),
      ).toBeUndefined();
      expect(await getProfile(doc, table, joiner, clock)).toMatchObject({
        accountType: 'owner',
      });
    });

    it('the owner becomes a member during accept: accept says unusable', async () => {
      const owner = uid('owner');
      const other = uid('other');
      const joiner = uid('joiner');
      await profile(owner);
      await profile(joiner);
      const invite = await seedInvite(owner, `${joiner}@example.test`);

      const result = await acceptInvite(
        doc,
        table,
        caller(joiner),
        invite.tokenHash,
        clock,
        {
          ...noSleep,
          beforeCommit: async (attempt) => {
            if (attempt === 1) {
              await rawPut(
                encodeMemberOf({
                  memberId: owner,
                  ownerId: other,
                  createdAt: at(-1),
                }),
              );
            }
          },
        },
      );

      expect(result).toEqual(UNUSABLE);
      await doc.send(
        new DeleteCommand({ TableName: table, Key: memberOfKey(owner) }),
      );
    });
  });

  describe('a busy table', () => {
    it('answers busy after three conflicts and writes nothing', async () => {
      const owner = uid('owner');
      const joiner = uid('joiner');
      await profile(owner);
      await profile(joiner);
      const invite = await seedInvite(owner, `${joiner}@example.test`);
      const before = await snapshot(owner, joiner);
      const double = conflictDouble(doc, 3);

      // Only writes go through the double; reads reach the table.
      const client = {
        send: (command: unknown) =>
          command instanceof TransactWriteCommand
            ? double.send(command)
            : doc.send(command as never),
      };

      const result = await acceptInvite(
        client as never,
        table,
        caller(joiner),
        invite.tokenHash,
        clock,
        noSleep,
      );

      expect(result).toEqual({ ok: false, code: 'busy' });
      expect(double.attempts).toBe(3);
      expect(await snapshot(owner, joiner)).toBe(before);
    });
  });
});
