import { decodeFlow, encodeFlow, type FlowItem } from './flowItem.js';

const flow: FlowItem = {
  id: '11111111-1111-4111-8111-111111111111',
  ownerId: 'user_owner1',
  facts: {
    personName: 'Grandma',
    dateOfPassing: '1 Oct',
    serviceDate: null,
    obituaryUrl: 'https://example.test/grandma',
    obituaryPublisher: null,
    serviceReady: false,
  },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  updatedBy: 'user_owner1',
};

describe('flow codec', () => {
  it('writes exactly the attributes in design 1.2', () => {
    expect(Object.keys(encodeFlow(flow)).sort()).toEqual(
      [
        'pk',
        'sk',
        'entity',
        'id',
        'ownerId',
        'personName',
        'dateOfPassing',
        'serviceDate',
        'obituaryUrl',
        'obituaryPublisher',
        'serviceReady',
        'createdAt',
        'updatedAt',
        'updatedBy',
        'gsi1pk',
        'gsi1sk',
      ].sort(),
    );
  });

  it('never stores an attribute that looks like contact or message data', () => {
    for (const name of Object.keys(encodeFlow(flow))) {
      expect(name).not.toMatch(/contact|recipient|draft|message|wording|body/i);
    }
  });

  it('refuses extra keys slipped into facts', () => {
    const sneaky = {
      ...flow,
      facts: { ...flow.facts, contactId: 'abc' } as FlowItem['facts'],
    };
    expect(() => encodeFlow(sneaky)).toThrow('Flow facts are invalid.');
  });

  it('round-trips', () => {
    expect(decodeFlow(encodeFlow(flow))).toEqual(flow);
  });

  it('refuses a too-long name and a non-http URL', () => {
    expect(() =>
      encodeFlow({
        ...flow,
        facts: { ...flow.facts, personName: 'x'.repeat(201) },
      }),
    ).toThrow();
    expect(() =>
      encodeFlow({
        ...flow,
        facts: { ...flow.facts, obituaryUrl: 'javascript:alert(1)' },
      }),
    ).toThrow();
  });

  it('throws on a broken item', () => {
    expect(() => decodeFlow({ ...encodeFlow(flow), ownerId: 7 })).toThrow(
      'Flow item is broken.',
    );
  });
});
