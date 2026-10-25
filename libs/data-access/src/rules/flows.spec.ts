import { randomUUID } from 'node:crypto';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { fixedClock } from '../clock.js';
import { encodeFlow, type FlowItem } from '../items/flowItem.js';
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
import { createFlow, listFlows } from './flows.js';

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
    const result = await createFlow(
      doc,
      table,
      caller('user_c_race'),
      randomUUID(),
      facts,
      clock,
      {
        beforeCommit: async (attempt) => {
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
    expect((await getProfile(doc, table, 'user_c_race', clock))?.version).toBe(
      7,
    );
  });
});
