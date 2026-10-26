import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { fixedClock } from '../clock.js';
import { encodeFlow } from '../items/flowItem.js';
import { encodeInvite, encodeToken } from '../items/inviteItems.js';
import { encodeMember, encodeMemberOf } from '../items/memberItems.js';
import { encodeProfile } from '../items/profileItem.js';
import { flowGuardKey } from '../keys.js';
import {
  createTables,
  doc,
  dropTables,
  rawPut,
  required,
  table,
  up,
} from '../testing/localTable.js';
import { deleteUser } from './deleteUser.js';

const clock = fixedClock('2026-10-24T12:00:00.000Z');
const NOW = clock.now().toISOString();
const facts = {
  personName: 'Pat',
  dateOfPassing: '2026-10-01',
  serviceDate: null,
  obituaryUrl: null,
  obituaryPublisher: null,
  serviceReady: false,
};

async function scan(): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  let start: Record<string, unknown> | undefined;
  do {
    const page = await doc.send(
      new ScanCommand({ TableName: table, ExclusiveStartKey: start }),
    );
    out.push(...(page.Items ?? []));
    start = page.LastEvaluatedKey;
  } while (start);
  return out;
}
const keyOf = (item: Record<string, unknown>) => `${item['pk']}|${item['sk']}`;
const profile = (userId: string, accountType: 'owner' | 'member' = 'owner') =>
  rawPut(
    encodeProfile({
      userId,
      accountType,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );

describe('deleteUser on DynamoDB Local in CI', () => {
  it.runIf(required)('has DynamoDB Local', () => {
    expect(up).toBe(true);
  });
});

describe.runIf(up)('deleteUser on DynamoDB Local', () => {
  const GONE = 'user_del_gone';
  const OWNER = 'user_del_owner'; // GONE is a member of OWNER
  const HELPER = 'user_del_helper'; // HELPER is a member of GONE
  const OTHER = 'user_del_other'; // unrelated
  const goneFlow = randomUUID();
  const ownerFlow = randomUUID();
  const otherFlow = randomUUID();
  const goneTokenHash = 'a'.repeat(64);
  const acceptedHash = 'c'.repeat(64);
  const otherHash = 'd'.repeat(64);
  const acceptedInvite = randomUUID();
  let untouched: string[];

  beforeAll(async () => {
    await createTables();
    for (const id of [GONE, OWNER, HELPER, OTHER]) {
      await profile(id, id === GONE || id === HELPER ? 'member' : 'owner');
    }
    await profile(GONE, 'owner');
    // GONE owns a flow, an open invite and has HELPER as a member.
    await rawPut(
      encodeFlow({
        id: goneFlow,
        ownerId: GONE,
        facts,
        createdAt: NOW,
        updatedAt: NOW,
        updatedBy: GONE,
      }),
    );
    await rawPut(flowGuard(goneFlow, GONE));
    const inviteId = randomUUID();
    await rawPut(
      encodeInvite({
        id: inviteId,
        ownerId: GONE,
        email: 'x@example.test',
        tokenHash: goneTokenHash,
        createdAt: NOW,
        expiresAt: NOW,
      }),
    );
    await rawPut(encodeToken(goneTokenHash, GONE, inviteId));
    await rawPut(
      encodeMember({
        ownerId: GONE,
        memberId: HELPER,
        email: 'h@example.test',
        createdAt: NOW,
      }),
    );
    await rawPut(
      encodeMemberOf({ memberId: HELPER, ownerId: GONE, createdAt: NOW }),
    );
    // GONE is a member of OWNER; OWNER has a flow GONE last edited, and the invite GONE accepted.
    await rawPut(
      encodeMember({
        ownerId: OWNER,
        memberId: GONE,
        email: 'g@example.test',
        createdAt: NOW,
      }),
    );
    await rawPut(
      encodeMemberOf({ memberId: GONE, ownerId: OWNER, createdAt: NOW }),
    );
    await rawPut(
      encodeFlow({
        id: ownerFlow,
        ownerId: OWNER,
        facts,
        createdAt: NOW,
        updatedAt: NOW,
        updatedBy: GONE,
      }),
    );
    await rawPut(flowGuard(ownerFlow, OWNER));
    await rawPut(
      encodeInvite({
        id: acceptedInvite,
        ownerId: OWNER,
        email: 'g@example.test',
        tokenHash: acceptedHash,
        createdAt: NOW,
        expiresAt: NOW,
        acceptedAt: NOW,
        acceptedBy: GONE,
      }),
    );
    // OTHER is unrelated.
    await rawPut(
      encodeFlow({
        id: otherFlow,
        ownerId: OTHER,
        facts,
        createdAt: NOW,
        updatedAt: NOW,
        updatedBy: OTHER,
      }),
    );
    await rawPut(flowGuard(otherFlow, OTHER));
    await rawPut(encodeToken(otherHash, OTHER, randomUUID()));
    untouched = (await scan())
      .filter(
        (i) =>
          String(i['pk']).includes(OTHER) ||
          i['pk'] === flowGuardKey(otherFlow).pk ||
          String(i['pk']).includes(otherHash),
      )
      .map(keyOf)
      .sort();
  });
  afterAll(async () => {
    await dropTables();
  });

  it('removes every item of the user and none of another user', async () => {
    await deleteUser(doc, table, GONE, clock);
    const items = await scan();
    const keys = items.map(keyOf);

    expect(items.filter((i) => i['pk'] === `USER#${GONE}`)).toEqual([]);
    expect(keys).not.toContain(`${flowGuardKey(goneFlow).pk}|FLOW`);
    expect(keys).not.toContain(`TOKEN#${goneTokenHash}|TOKEN`);
    expect(items.some((i) => i['memberId'] === GONE)).toBe(false); // MEMBER# row under OWNER
    expect(items.some((i) => i['gsi1pk'] === `REF#${GONE}`)).toBe(false);
    expect(items.some((i) => i['acceptedBy'] === GONE)).toBe(false);

    // The owner's flow stays, with no editor. Their profile still exists.
    const ownerFlowItem = items.find(
      (i) => i['pk'] === `USER#${OWNER}` && i['sk'] === `FLOW#${ownerFlow}`,
    );
    expect(ownerFlowItem?.['updatedBy']).toBeNull();
    expect(
      items.some((i) => i['pk'] === `USER#${OWNER}` && i['sk'] === 'PROFILE'),
    ).toBe(true);

    // The helper is an owner again with no membership.
    expect(
      items.some(
        (i) => i['pk'] === `USER#${HELPER}` && i['sk'] === 'MEMBER_OF',
      ),
    ).toBe(false);
    expect(
      items.find(
        (i) => i['pk'] === `USER#${HELPER}` && i['sk'] === 'PROFILE',
      )?.['accountType'],
    ).toBe('owner');

    const after = items
      .filter(
        (i) =>
          String(i['pk']).includes(OTHER) ||
          i['pk'] === flowGuardKey(otherFlow).pk ||
          String(i['pk']).includes(otherHash),
      )
      .map(keyOf)
      .sort();
    expect(after).toEqual(untouched);
    expect(after.length).toBeGreaterThanOrEqual(4);
  });

  it('is safe to run again', async () => {
    const before = (await scan()).map(keyOf).sort();
    await expect(deleteUser(doc, table, GONE, clock)).resolves.toBeUndefined();
    expect((await scan()).map(keyOf).sort()).toEqual(before);
  });

  it('does nothing for a user with no data', async () => {
    await expect(
      deleteUser(doc, table, 'user_never_existed', clock),
    ).resolves.toBeUndefined();
  });
});

describe.runIf(up)('deleteUser with many items', () => {
  it('deletes about 1000 items (500 owned, plus guards) in one call', async () => {
    await createTables();
    const BIG = 'user_del_big';
    await profile(BIG);
    const ids = Array.from({ length: 250 }, () => randomUUID());
    for (let i = 0; i < ids.length; i += 25) {
      await Promise.all(
        ids.slice(i, i + 25).flatMap((id, n) => {
          const hash = (i + n).toString(16).padStart(64, '0');
          return [
            rawPut(encodeFlow({ id, ownerId: BIG, facts, createdAt: NOW, updatedAt: NOW, updatedBy: BIG })),
            rawPut(flowGuard(id, BIG)),
            rawPut(encodeInvite({ id, ownerId: BIG, email: 'b@example.test', tokenHash: hash, createdAt: NOW, expiresAt: NOW })),
            rawPut(encodeToken(hash, BIG, id)),
          ];
        }),
      );
    }
    const started = Date.now();
    await deleteUser(doc, table, BIG, clock);
    const ms = Date.now() - started;
    console.info(`deleteUser of 1001 items took ${ms} ms`);
    expect((await scan()).filter((i) => i['ownerId'] === BIG || i['pk'] === `USER#${BIG}`)).toEqual([]);
    expect(ms).toBeLessThan(8000);
    await dropTables();
  });
});

function flowGuard(flowId: string, ownerId: string) {
  return { ...flowGuardKey(flowId), entity: 'FLOW_GUARD', ownerId };
}
