import { randomUUID } from 'node:crypto';
import { FLOW_DETAIL_MAX_LENGTH, FLOW_DETAIL_TEXT_KEYS } from '@griever/shared';
import { DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { fixedClock } from '../clock.js';
import { emptyDetails, encodeFlow, type FlowItem } from '../items/flowItem.js';
import { encodeProfile, getProfile } from '../items/profileItem.js';
import { flowGuardKey, flowKey, memberOfKey, profileKey } from '../keys.js';
import { getLive } from '../read.js';
import {
  createTables,
  doc,
  dropTables,
  rawPut,
  table,
  up,
} from '../testing/localTable.js';
import { createFlow, listFlows, updateFlow } from './flows.js';

const clock = fixedClock('2026-10-24T00:00:00.000Z');
const OWNER = 'user_owner1';
const MEMBER = 'user_member1';
const STRANGER = 'user_stranger1';
const FLOW_ID = '22222222-2222-4222-8222-222222222222';

const caller = (userId: string) => ({
  userId,
  email: 'someone@example.test',
  emailVerified: true,
});

const flow = (ownerId: string, id: string): FlowItem => ({
  id,
  ownerId,
  facts: {
    personName: 'Grandma',
    dateOfPassing: null,
    serviceDate: null,
    obituaryUrl: null,
    obituaryPublisher: null,
    serviceReady: false,
  },
  details: emptyDetails(),
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  updatedBy: ownerId,
});

describe.runIf(up)('listFlows on DynamoDB Local', () => {
  beforeAll(async () => {
    await createTables();
    await rawPut(encodeFlow(flow(OWNER, FLOW_ID)));
    await rawPut({
      ...memberOfKey(MEMBER),
      entity: 'MEMBER_OF',
      ownerId: OWNER,
    });
  });
  afterAll(dropTables);

  it('gives the owner their own people as owner', async () => {
    const records = await listFlows(doc, table, caller(OWNER), clock);
    expect(records.map((r) => [r.id, r.role])).toEqual([[FLOW_ID, 'owner']]);
  });

  it("gives a member the owner's people as member", async () => {
    const records = await listFlows(doc, table, caller(MEMBER), clock);
    expect(records.map((r) => [r.id, r.role])).toEqual([[FLOW_ID, 'member']]);
  });

  it('gives a stranger nothing', async () => {
    expect(await listFlows(doc, table, caller(STRANGER), clock)).toEqual([]);
  });
});

const facts = flow(OWNER, FLOW_ID).facts;
const at = '2026-10-01T00:00:00.000Z';
const profile = (
  userId: string,
  accountType: 'owner' | 'member',
  version = 1,
) =>
  encodeProfile({ userId, accountType, version, createdAt: at, updatedAt: at });

async function expectNothingWritten(userId: string, id: string) {
  expect(await getLive(doc, table, flowKey(userId, id), clock)).toBeUndefined();
  expect(await getLive(doc, table, flowGuardKey(id), clock)).toBeUndefined();
}

describe.runIf(up)('createFlow on DynamoDB Local', () => {
  beforeAll(createTables);
  afterAll(dropTables);

  it('lets an owner create a person and bumps the profile version', async () => {
    await rawPut(profile('user_c_owner', 'owner', 3));
    const id = randomUUID();
    const result = await createFlow(
      doc,
      table,
      caller('user_c_owner'),
      id,
      facts,
      clock,
    );
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ id, role: 'owner' }),
    });
    expect((await getProfile(doc, table, 'user_c_owner', clock))?.version).toBe(
      4,
    );
  });

  it('creates the profile as owner when there is none', async () => {
    const result = await createFlow(
      doc,
      table,
      caller('user_c_new'),
      randomUUID(),
      facts,
      clock,
    );
    expect(result.ok).toBe(true);
    const created = await getProfile(doc, table, 'user_c_new', clock);
    expect(created).toMatchObject({ accountType: 'owner', version: 1 });
  });

  it('refuses a member and writes nothing (C11)', async () => {
    await rawPut(profile('user_c_member', 'member'));
    await rawPut({
      ...memberOfKey('user_c_member'),
      entity: 'MEMBER_OF',
      ownerId: OWNER,
    });
    const id = randomUUID();
    const result = await createFlow(
      doc,
      table,
      caller('user_c_member'),
      id,
      facts,
      clock,
    );
    expect(result).toEqual({ ok: false, code: 'forbidden' });
    await expectNothingWritten('user_c_member', id);
  });

  it('refuses a user with only a MEMBER_OF item (C11)', async () => {
    await rawPut({
      ...memberOfKey('user_c_memberof'),
      entity: 'MEMBER_OF',
      ownerId: OWNER,
    });
    const id = randomUUID();
    const result = await createFlow(
      doc,
      table,
      caller('user_c_memberof'),
      id,
      facts,
      clock,
    );
    expect(result).toEqual({ ok: false, code: 'forbidden' });
    await expectNothingWritten('user_c_memberof', id);
  });

  it("refuses a user with only accountType 'member' (C11)", async () => {
    await rawPut(profile('user_c_typeonly', 'member'));
    const id = randomUUID();
    const result = await createFlow(
      doc,
      table,
      caller('user_c_typeonly'),
      id,
      facts,
      clock,
    );
    expect(result).toEqual({ ok: false, code: 'forbidden' });
    await expectNothingWritten('user_c_typeonly', id);
  });

  it('gives conflict when another owner already has the id', async () => {
    const id = randomUUID();
    expect(
      (await createFlow(doc, table, caller('user_c_first'), id, facts, clock))
        .ok,
    ).toBe(true);
    const result = await createFlow(
      doc,
      table,
      caller('user_c_second'),
      id,
      facts,
      clock,
    );
    expect(result).toEqual({ ok: false, code: 'conflict' });
    expect(
      await getLive(doc, table, flowKey('user_c_second', id), clock),
    ).toBeUndefined();
  });

  it('gives invalid for bad facts or a bad id', async () => {
    const tooLong = { ...facts, personName: 'x'.repeat(201) };
    expect(
      await createFlow(doc, table, caller(OWNER), randomUUID(), tooLong, clock),
    ).toEqual({ ok: false, code: 'invalid' });
    expect(
      await createFlow(doc, table, caller(OWNER), 'not-a-uuid', facts, clock),
    ).toEqual({ ok: false, code: 'invalid' });
  });

  it('reads again and succeeds when the profile version moves mid-write', async () => {
    await rawPut(profile('user_c_race', 'owner', 5));
    const attempts: number[] = [];
    const result = await createFlow(
      doc,
      table,
      caller('user_c_race'),
      randomUUID(),
      facts,
      clock,
      {
        beforeCommit: async (attempt) => {
          attempts.push(attempt);
          if (attempt === 1) {
            await doc.send(
              new UpdateCommand({
                TableName: table,
                Key: profileKey('user_c_race'),
                UpdateExpression: 'SET #version = #version + :one',
                ExpressionAttributeNames: { '#version': 'version' },
                ExpressionAttributeValues: { ':one': 1 },
              }),
            );
          }
        },
        sleep: async () => undefined,
      },
    );
    expect(result.ok).toBe(true);
    // Two attempts: the first failed on the version check. One attempt would mean the check is gone.
    expect(attempts).toEqual([1, 2]);
    expect((await getProfile(doc, table, 'user_c_race', clock))?.version).toBe(
      7,
    );
  });
});

describe.runIf(up)('updateFlow on DynamoDB Local', () => {
  const U_OWNER = 'user_u_owner';
  const U_MEMBER = 'user_u_member';
  const seed = async () => {
    const id = randomUUID();
    await rawPut(encodeFlow(flow(U_OWNER, id)));
    return id;
  };
  const stored = async (id: string) =>
    getLive(doc, table, flowKey(U_OWNER, id), clock);

  beforeAll(async () => {
    await createTables();
    await rawPut({
      ...memberOfKey(U_MEMBER),
      entity: 'MEMBER_OF',
      ownerId: U_OWNER,
    });
  });
  afterAll(dropTables);

  it('lets the owner change facts and records who did it', async () => {
    const id = await seed();
    const result = await updateFlow(
      doc,
      table,
      caller(U_OWNER),
      id,
      { serviceReady: true },
      clock,
    );
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ id, role: 'owner', updatedBy: U_OWNER }),
    });
    expect(await stored(id)).toMatchObject({
      serviceReady: true,
      personName: 'Grandma',
      gsi1pk: `REF#${U_OWNER}`,
    });
  });

  it("lets a member change the owner's person", async () => {
    const id = await seed();
    const result = await updateFlow(
      doc,
      table,
      caller(U_MEMBER),
      id,
      { serviceDate: '3 Nov' },
      clock,
    );
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ role: 'member', updatedBy: U_MEMBER }),
    });
    expect(await stored(id)).toMatchObject({
      serviceDate: '3 Nov',
      updatedBy: U_MEMBER,
      gsi1pk: `REF#${U_MEMBER}`,
    });
  });

  it('gives not_found to a stranger and to an unknown id, and changes nothing', async () => {
    const id = await seed();
    const before = await stored(id);
    expect(
      await updateFlow(
        doc,
        table,
        caller('user_u_stranger'),
        id,
        { serviceReady: true },
        clock,
      ),
    ).toEqual({ ok: false, code: 'not_found' });
    expect(
      await updateFlow(
        doc,
        table,
        caller(U_OWNER),
        randomUUID(),
        { serviceReady: true },
        clock,
      ),
    ).toEqual({ ok: false, code: 'not_found' });
    expect(await stored(id)).toEqual(before);
  });

  it('gives not_found to a soft-deleted person', async () => {
    const id = randomUUID();
    await rawPut(
      encodeFlow({
        ...flow(U_OWNER, id),
        deletedAt: '2026-10-20T00:00:00.000Z',
      }),
    );
    expect(
      await updateFlow(
        doc,
        table,
        caller(U_OWNER),
        id,
        { serviceReady: true },
        clock,
      ),
    ).toEqual({ ok: false, code: 'not_found' });
  });

  it('gives not_found when the member is removed mid-write, and changes nothing', async () => {
    const id = await seed();
    const before = await stored(id);
    const result = await updateFlow(
      doc,
      table,
      caller(U_MEMBER),
      id,
      { serviceReady: true },
      clock,
      {
        beforeCommit: async () => {
          await doc.send(
            new DeleteCommand({ TableName: table, Key: memberOfKey(U_MEMBER) }),
          );
        },
      },
    );
    expect(result).toEqual({ ok: false, code: 'not_found' });
    expect(await stored(id)).toEqual(before);
    await rawPut({
      ...memberOfKey(U_MEMBER),
      entity: 'MEMBER_OF',
      ownerId: U_OWNER,
    });
  });

  it('refuses any key that is not a fact', async () => {
    const id = await seed();
    for (const patch of [
      { ownerId: 'user_x' },
      { id: randomUUID() },
      { createdAt: 'x' },
      { updatedAt: 'x' },
      { updatedBy: 'x' },
      { deletedAt: 'x' },
    ]) {
      expect(
        await updateFlow(doc, table, caller(U_OWNER), id, patch, clock),
      ).toEqual({ ok: false, code: 'invalid' });
    }
  });
});

describe.runIf(up)('detail keys on DynamoDB Local', () => {
  const D_OWNER = 'user_d_owner';
  const D_MEMBER = 'user_d_member';
  const D_STRANGER = 'user_d_stranger';

  beforeAll(async () => {
    await createTables();
    await rawPut(profile(D_OWNER, 'owner'));
    await rawPut(profile(D_MEMBER, 'member'));
    await rawPut({
      ...memberOfKey(D_MEMBER),
      entity: 'MEMBER_OF',
      ownerId: D_OWNER,
    });
  });
  afterAll(dropTables);

  it('stores details on create, and the owner list returns them', async () => {
    const id = randomUUID();
    const result = await createFlow(
      doc,
      table,
      caller(D_OWNER),
      id,
      { ...facts, serviceTime: '2pm', burialPrivate: true, thanksMessage: '' },
      clock,
    );
    expect(result.ok).toBe(true);
    const [record] = await listFlows(doc, table, caller(D_OWNER), clock);
    expect(record?.details).toMatchObject({
      serviceTime: '2pm',
      burialPrivate: true,
      thanksMessage: '',
      servicePlace: null,
      personStatus: null,
    });
  });

  it("lets a member set serviceTime and the owner's list shows it", async () => {
    const id = randomUUID();
    await rawPut(encodeFlow(flow(D_OWNER, id)));
    const result = await updateFlow(
      doc,
      table,
      caller(D_MEMBER),
      id,
      { serviceTime: '10:30 am' },
      clock,
    );
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        role: 'member',
        details: expect.objectContaining({ serviceTime: '10:30 am' }),
      }),
    });
    const listed = await listFlows(doc, table, caller(D_OWNER), clock);
    expect(listed.find((r) => r.id === id)?.details.serviceTime).toBe(
      '10:30 am',
    );
  });

  it('updates with only detail keys and leaves the facts alone', async () => {
    const id = randomUUID();
    await rawPut(encodeFlow(flow(D_OWNER, id)));
    await updateFlow(
      doc,
      table,
      caller(D_OWNER),
      id,
      { servicePlace: 'Chapel', serviceStatus: 'ready' },
      clock,
    );
    const stored = await getLive(doc, table, flowKey(D_OWNER, id), clock);
    expect(stored).toMatchObject({
      servicePlace: 'Chapel',
      serviceStatus: 'ready',
      personName: 'Grandma',
    });
  });

  it('refuses a member create and writes nothing (C11)', async () => {
    const id = randomUUID();
    expect(
      await createFlow(
        doc,
        table,
        caller(D_MEMBER),
        id,
        { ...facts, serviceTime: '2pm' },
        clock,
      ),
    ).toEqual({ ok: false, code: 'forbidden' });
    await expectNothingWritten(D_OWNER, id);
    await expectNothingWritten(D_MEMBER, id);
  });

  it('gives a stranger no list and not_found on update', async () => {
    const id = randomUUID();
    await rawPut(encodeFlow(flow(D_OWNER, id)));
    expect(await listFlows(doc, table, caller(D_STRANGER), clock)).toEqual([]);
    expect(
      await updateFlow(
        doc,
        table,
        caller(D_STRANGER),
        id,
        { serviceTime: 'x' },
        clock,
      ),
    ).toEqual({ ok: false, code: 'not_found' });
    const stored = await getLive(doc, table, flowKey(D_OWNER, id), clock);
    expect(stored?.['serviceTime']).toBeNull();
  });

  it('refuses forbidden, unknown and too-long detail keys without writing', async () => {
    const id = randomUUID();
    await rawPut(encodeFlow(flow(D_OWNER, id)));
    for (const patch of [
      { messageOverride: 'x' },
      { selectedContactIds: [] },
      { notAKey: 'x' },
      { serviceTime: 'x'.repeat(101) },
      { serviceTime: 'ok', draft: 'x' },
    ]) {
      expect(
        await updateFlow(doc, table, caller(D_OWNER), id, patch, clock),
      ).toEqual({ ok: false, code: 'invalid' });
    }
    const stored = await getLive(doc, table, flowKey(D_OWNER, id), clock);
    expect(stored?.['serviceTime']).toBeNull();
    expect(
      await createFlow(
        doc,
        table,
        caller(D_OWNER),
        randomUUID(),
        { ...facts, recipientsNotified: [] },
        clock,
      ),
    ).toEqual({ ok: false, code: 'invalid' });
  });

  it('writes and reads back a max-size item', async () => {
    const id = randomUUID();
    const big: Record<string, string> = {};
    for (const key of FLOW_DETAIL_TEXT_KEYS) {
      big[key] = '一'.repeat(FLOW_DETAIL_MAX_LENGTH[key]);
    }
    expect(
      (await createFlow(doc, table, caller(D_OWNER), id, { ...facts, ...big }, clock))
        .ok,
    ).toBe(true);
    const listed = await listFlows(doc, table, caller(D_OWNER), clock);
    expect(listed.find((r) => r.id === id)?.details).toMatchObject(big);
  });

  it('leaves every other key alone when one key is patched', async () => {
    const id = randomUUID();
    await rawPut(
      encodeFlow({
        ...flow(D_OWNER, id),
        details: {
          ...emptyDetails(),
          serviceTime: '2pm',
          personStatus: 'ready',
          burialPrivate: true,
          serviceMessage: '',
        },
      }),
    );
    await updateFlow(doc, table, caller(D_MEMBER), id, { servicePlace: 'Chapel' }, clock);
    await updateFlow(doc, table, caller(D_OWNER), id, { obituaryCity: 'X' }, clock);
    const listed = await listFlows(doc, table, caller(D_OWNER), clock);
    const record = listed.find((r) => r.id === id);
    expect(record?.details).toEqual({
      ...emptyDetails(),
      serviceTime: '2pm',
      personStatus: 'ready',
      burialPrivate: true,
      serviceMessage: '',
      servicePlace: 'Chapel',
      obituaryCity: 'X',
    });
    expect(record?.facts).toEqual(facts);
  });
});
