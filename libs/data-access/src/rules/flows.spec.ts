import { fixedClock } from '../clock.js';
import { encodeFlow, type FlowItem } from '../items/flowItem.js';
import { memberOfKey } from '../keys.js';
import {
  createTables,
  doc,
  dropTables,
  rawPut,
  table,
  up,
} from '../testing/localTable.js';
import { listFlows } from './flows.js';

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
