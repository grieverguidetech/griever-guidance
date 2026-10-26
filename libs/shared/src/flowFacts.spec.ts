import {
  FLOW_FACT_KEYS,
  FLOW_FACT_MAX_LENGTH,
  isValidObituaryLink,
  coalesceFlowPatches,
  diffFlowFacts,
  flowFactsToSessionFields,
  mergeFlowFacts,
  parseFlowFacts,
  parseFlowPatch,
  parseFlowRecord,
  pickFlowFacts,
  toFlowFacts,
  type FlowFactKey,
  type FlowFacts,
} from './index.js';

const ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER = '223e4567-e89b-12d3-a456-426614174000';

const facts: FlowFacts = {
  personName: 'Margaret Hale',
  dateOfPassing: 'May 29, 2026',
  serviceDate: null,
  obituaryUrl: 'https://example.com/m',
  obituaryPublisher: null,
  serviceReady: false,
};

// A Session-shaped object carrying everything that must never leave the device.
const sessionLike = {
  id: ID,
  createdAt: '2026-05-30T00:00:00Z',
  personName: 'Margaret Hale',
  dateOfPassing: 'May 29, 2026',
  serviceDate: 'June 3, 2026',
  obituaryUrl: 'https://example.com/m',
  obituaryPublisher: 'The Register',
  serviceReady: true,
  senderName: 'Anna',
  drafts: {
    announce: { messageOverride: 'my own words', selectedContactIds: ['c1'] },
  },
  messageOverride: 'my own words',
  selectedContactIds: ['c1', 'c2'],
  contactIds: ['c1'],
  recipientsNotified: { announce: ['c1'] },
  momentCompletedAt: {},
  fields: { x: 'y' },
};

// Type-level guard: if a forbidden key is ever added to FlowFacts this stops compiling.
type Forbidden =
  | 'drafts'
  | 'messageOverride'
  | 'selectedContactIds'
  | 'contactIds'
  | 'recipientsNotified'
  | 'senderName'
  | 'fields';
const noForbiddenKeyInType: Extract<keyof FlowFacts, Forbidden> extends never
  ? true
  : false = true;

describe('C2/C3 whitelist', () => {
  it('lists exactly the six synced fields', () => {
    expect([...FLOW_FACT_KEYS].sort()).toEqual(
      [
        'dateOfPassing',
        'obituaryPublisher',
        'obituaryUrl',
        'personName',
        'serviceDate',
        'serviceReady',
      ].sort(),
    );
    expect(noForbiddenKeyInType).toBe(true);
  });

  it('toFlowFacts, pickFlowFacts, diffFlowFacts and coalesce only ever emit whitelisted keys', () => {
    const allowed = new Set<string>(FLOW_FACT_KEYS);
    const outputs = [
      toFlowFacts(sessionLike),
      pickFlowFacts(sessionLike),
      diffFlowFacts({}, sessionLike),
      coalesceFlowPatches([sessionLike, sessionLike]),
      mergeFlowFacts(toFlowFacts(sessionLike), sessionLike, []),
    ];
    for (const out of outputs) {
      for (const key of Object.keys(out)) expect(allowed.has(key)).toBe(true);
    }
    const json = JSON.stringify(outputs);
    for (const secret of ['my own words', 'c1', 'c2', 'Anna']) {
      expect(json).not.toContain(secret);
    }
  });
});

describe('toFlowFacts and pickFlowFacts', () => {
  it('fills missing optional values with null and serviceReady with false', () => {
    expect(toFlowFacts({ personName: 'A' })).toEqual({
      personName: 'A',
      dateOfPassing: null,
      serviceDate: null,
      obituaryUrl: null,
      obituaryPublisher: null,
      serviceReady: false,
    });
  });

  it('pick keeps only present whitelisted keys', () => {
    expect(pickFlowFacts({ personName: 'A', serviceDate: undefined })).toEqual({
      personName: 'A',
    });
  });
});

it('maps an empty obituary link to null', () => {
  expect(toFlowFacts({ obituaryUrl: '' }).obituaryUrl).toBeNull();
});

describe('diffFlowFacts', () => {
  it('returns only changed keys', () => {
    expect(
      diffFlowFacts(facts, {
        ...facts,
        serviceDate: 'June 3',
        serviceReady: true,
      }),
    ).toEqual({ serviceDate: 'June 3', serviceReady: true });
  });
  it('returns nothing when nothing changed', () => {
    expect(diffFlowFacts(facts, { ...facts })).toEqual({});
  });
  it('reports a cleared value as null', () => {
    expect(diffFlowFacts(facts, { ...facts, dateOfPassing: null })).toEqual({
      dateOfPassing: null,
    });
  });
  it('ignores changes to non-fact keys', () => {
    expect(
      diffFlowFacts(facts, { ...facts, ...{ senderName: 'Z', drafts: {} } }),
    ).toEqual({});
  });
});

describe('mergeFlowFacts', () => {
  const remote: FlowFacts = {
    personName: 'Margaret H. Hale',
    dateOfPassing: 'May 30, 2026',
    serviceDate: 'June 3, 2026',
    obituaryUrl: null,
    obituaryPublisher: 'The Register',
    serviceReady: true,
  };

  it('takes every remote value when nothing is pending', () => {
    expect(mergeFlowFacts(facts, remote, [])).toEqual(remote);
  });

  it('keeps pending local fields and takes the rest from remote', () => {
    const pending: FlowFactKey[] = ['personName', 'serviceReady'];
    expect(mergeFlowFacts(facts, remote, pending)).toEqual({
      ...remote,
      personName: facts.personName,
      serviceReady: facts.serviceReady,
    });
  });

  it('keeps all local values when every field is pending', () => {
    expect(mergeFlowFacts(facts, remote, new Set(FLOW_FACT_KEYS))).toEqual(
      facts,
    );
  });

  it('keeps local for a field the remote does not have', () => {
    const partial: Partial<FlowFacts> = { serviceDate: 'June 3' };
    expect(mergeFlowFacts(facts, partial, [])).toEqual({
      ...facts,
      serviceDate: 'June 3',
    });
  });

  it('takes a remote null (a cleared value) when not pending', () => {
    expect(
      mergeFlowFacts(facts, { dateOfPassing: null }, []).dateOfPassing,
    ).toBeNull();
  });

  it('does not mutate its inputs', () => {
    const local = { ...facts };
    const r = { ...remote };
    mergeFlowFacts(local, r, ['personName']);
    expect(local).toEqual(facts);
    expect(r).toEqual(remote);
  });
});

describe('coalesceFlowPatches', () => {
  it('keeps the latest value per field across edits', () => {
    expect(
      coalesceFlowPatches([
        { personName: 'A' },
        { serviceDate: 'June 3' },
        { personName: 'B' },
        { serviceDate: null },
      ]),
    ).toEqual({ personName: 'B', serviceDate: null });
  });
  it('returns an empty patch for no edits', () => {
    expect(coalesceFlowPatches([])).toEqual({});
  });
});

describe('validation (C8)', () => {
  it('accepts a full valid set of facts', () => {
    expect(parseFlowFacts(facts)).toEqual(facts);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a missing key', { ...facts, personName: undefined }],
    ['a wrong type', { ...facts, serviceReady: 'yes' }],
    ['a null name', { ...facts, personName: null }],
    ['a number date', { ...facts, serviceDate: 5 }],
    ['an unknown key', { ...facts, messageOverride: 'x' }],
    ['a draft key', { ...facts, drafts: {} }],
    ['a long name', { ...facts, personName: 'a'.repeat(201) }],
    ['a long date', { ...facts, dateOfPassing: 'a'.repeat(101) }],
    ['a javascript url', { ...facts, obituaryUrl: 'javascript:alert(1)' }],
    ['a data url', { ...facts, obituaryUrl: 'data:text/html,x' }],
    ['a relative url', { ...facts, obituaryUrl: '/obit' }],
    ['a long url', { ...facts, obituaryUrl: 'https://' + 'a'.repeat(2041) }],
    ['a long publisher', { ...facts, obituaryPublisher: 'a'.repeat(201) }],
  ])('rejects %s', (_label, input) => {
    expect(parseFlowFacts(input)).toBeNull();
  });

  it('accepts values exactly at each length limit', () => {
    const atLimit = {
      ...facts,
      personName: 'a'.repeat(FLOW_FACT_MAX_LENGTH.personName),
      dateOfPassing: 'a'.repeat(FLOW_FACT_MAX_LENGTH.dateOfPassing),
      serviceDate: 'a'.repeat(FLOW_FACT_MAX_LENGTH.serviceDate),
      obituaryUrl:
        'https://' + 'a'.repeat(FLOW_FACT_MAX_LENGTH.obituaryUrl - 8),
      obituaryPublisher: 'a'.repeat(FLOW_FACT_MAX_LENGTH.obituaryPublisher),
    };
    expect(parseFlowFacts(atLimit)).toEqual(atLimit);
  });

  it('accepts a partial patch but not one with an unknown key', () => {
    expect(parseFlowPatch({ serviceReady: true })).toEqual({
      serviceReady: true,
    });
    expect(parseFlowPatch({})).toEqual({});
    expect(
      parseFlowPatch({ serviceReady: true, contactIds: ['c1'] }),
    ).toBeNull();
    expect(parseFlowPatch({ personName: 3 })).toBeNull();
  });

  const record = {
    id: ID,
    ownerId: OTHER,
    role: 'member',
    facts,
    updatedAt: '2026-10-12T10:00:00Z',
    updatedBy: null,
  };

  it('accepts a valid record', () => {
    expect(parseFlowRecord(record)).toEqual(record);
  });

  it.each([
    ['a bad id', { ...record, id: 'not-a-uuid' }],
    ['a bad owner id', { ...record, ownerId: '1' }],
    ['a bad role', { ...record, role: 'admin' }],
    ['a bad updatedAt', { ...record, updatedAt: 'yesterday' }],
    ['a bad updatedBy', { ...record, updatedBy: 'x' }],
    ['bad facts', { ...record, facts: { ...facts, serviceReady: 1 } }],
    ['not an object', 'x'],
  ])('rejects a record with %s', (_label, input) => {
    expect(parseFlowRecord(input)).toBeNull();
  });
});

describe('toFlowFacts always produces what the database accepts', () => {
  it('turns a typed link into https, and an unusable one into null', () => {
    expect(toFlowFacts({ obituaryUrl: 'legacy.com/x' }).obituaryUrl).toBe(
      'https://legacy.com/x',
    );
    expect(toFlowFacts({ obituaryUrl: ' https://x.com/a ' }).obituaryUrl).toBe(
      'https://x.com/a',
    );
    expect(
      toFlowFacts({ obituaryUrl: 'two words.com' }).obituaryUrl,
    ).toBeNull();
    expect(
      toFlowFacts({ obituaryUrl: 'javascript:alert(1)' }).obituaryUrl,
    ).toBe('https://javascript:alert(1)');
    expect(toFlowFacts({ obituaryUrl: '   ' }).obituaryUrl).toBeNull();
    expect(
      toFlowFacts({ obituaryUrl: 'https://' + 'a'.repeat(2050) }).obituaryUrl,
    ).toBeNull();
  });

  it('passes parseFlowFacts for messy sessions', () => {
    const messy = [
      { obituaryUrl: 'legacy.com/x' },
      { obituaryUrl: ' https://x' },
      { obituaryUrl: 'ht' },
      { obituaryUrl: 'a b c' },
      { obituaryUrl: '\u0000' },
      { personName: '  \u0000Ann  ' },
      { personName: 'a'.repeat(500), dateOfPassing: 'b'.repeat(500) },
      { obituaryPublisher: '   ', serviceDate: '\n' },
      { personName: '\u{1F600}'.repeat(150) },
      {},
    ];
    for (const s of messy)
      expect(parseFlowFacts(toFlowFacts(s))).not.toBeNull();
  });

  it('trims and cuts every text fact to its limit', () => {
    const f = toFlowFacts({
      personName: '  ' + 'a'.repeat(250),
      dateOfPassing: 'b'.repeat(150),
      serviceDate: 'c'.repeat(150),
      obituaryPublisher: 'd'.repeat(250),
    });
    expect(f.personName).toBe('a'.repeat(200));
    expect(f.dateOfPassing).toBe('b'.repeat(100));
    expect(f.serviceDate).toBe('c'.repeat(100));
    expect(f.obituaryPublisher).toBe('d'.repeat(200));
  });

  it('does not split an emoji when cutting', () => {
    const f = toFlowFacts({ personName: 'a'.repeat(199) + '\u{1F600}' });
    expect(f.personName).toBe('a'.repeat(199));
  });

  it('maps blank optional fields to null, as a new Session has them', () => {
    const fresh = {
      personName: 'Ann',
      dateOfPassing: '',
      senderName: '',
      obituaryUrl: '',
      serviceReady: false,
      drafts: {},
      recipientsNotified: {},
    };
    expect(toFlowFacts(fresh)).toEqual({
      personName: 'Ann',
      dateOfPassing: null,
      serviceDate: null,
      obituaryUrl: null,
      obituaryPublisher: null,
      serviceReady: false,
    });
    expect(
      toFlowFacts({
        dateOfPassing: '  ',
        serviceDate: ' ',
        obituaryPublisher: '\t',
      }),
    ).toMatchObject({
      dateOfPassing: null,
      serviceDate: null,
      obituaryPublisher: null,
    });
  });

  it('flowFactsToSessionFields maps null back to empty strings', () => {
    const back = flowFactsToSessionFields(toFlowFacts({ personName: 'Ann' }));
    expect(back).toEqual({
      personName: 'Ann',
      dateOfPassing: '',
      serviceDate: '',
      obituaryUrl: '',
      obituaryPublisher: '',
      serviceReady: false,
    });
    expect(Object.keys(back).sort()).toEqual([...FLOW_FACT_KEYS].sort());
  });
});

describe('response and text edge cases', () => {
  it('rejects a NUL character in any text fact', () => {
    expect(parseFlowFacts({ ...facts, personName: 'A\u0000B' })).toBeNull();
    expect(parseFlowFacts({ ...facts, serviceDate: 'x\u0000' })).toBeNull();
    expect(parseFlowPatch({ obituaryPublisher: '\u0000' })).toBeNull();
  });

  it('parseFlowRecord keeps only whitelisted facts and drops extras', () => {
    const rec = {
      id: ID,
      ownerId: OTHER,
      role: 'owner',
      facts: { ...facts, serviceTime: '10am', drafts: {} },
      updatedAt: '2026-10-12T10:00:00Z',
      updatedBy: null,
    };
    const out = parseFlowRecord(rec);
    expect(out?.facts).toEqual(facts);
    expect(Object.keys(out?.facts ?? {}).sort()).toEqual(
      [...FLOW_FACT_KEYS].sort(),
    );
  });

  it('coalescing A to B to A still sends A', () => {
    expect(
      coalesceFlowPatches([
        { personName: 'A' },
        { personName: 'B' },
        { personName: 'A' },
      ]),
    ).toEqual({ personName: 'A' });
  });
});

describe('isValidObituaryLink', () => {
  it.each([
    ['example.com/obit', true],
    ['  https://legacy.com/x  ', true],
    ['HTTP://example.com/a', true],
    ['has space', false],
    ['ftp://x', false],
    ['legacy.com/x?u=https://y', true],
    ['', false],
    ['   ', false],
    ['a'.repeat(2048 - 'https://'.length), true],
    ['a'.repeat(2049 - 'https://'.length), false],
  ])('%j -> %s', (raw, expected) => {
    expect(isValidObituaryLink(raw)).toBe(expected);
  });
});
