import {
  FLOW_DETAIL_KEYS,
  FLOW_DETAIL_MAX_LENGTH,
  FLOW_DETAIL_TEXT_KEYS,
  FLOW_MESSAGE_KEYS,
  SYNCED_KEYS,
} from '@griever/shared';
import {
  decodeFlow,
  emptyDetails,
  encodeFlow,
  parseFlowInput,
  type FlowItem,
} from './flowItem.js';

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
  details: emptyDetails(),
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  updatedBy: 'user_owner1',
};

// Written out on purpose: dropping a key from the shared list must also fail here.
const DETAIL_KEY_NAMES = [
  'birthDate',
  'serviceType',
  'serviceTime',
  'servicePlace',
  'serviceAddress',
  'serviceNotes',
  'serviceMessage',
  'announcementMessage',
  'obituaryText',
  'obituaryCity',
  'obituaryCareer',
  'obituarySurvivors',
  'obituaryNote',
  'thanksMessage',
  'visitationDate',
  'visitationTime',
  'visitationPlace',
  'serviceOfficiant',
  'burialDate',
  'burialTime',
  'burialPlace',
  'receptionDate',
  'receptionTime',
  'receptionPlace',
  'obituaryGivenName',
  'obituaryMiddleName',
  'obituarySurname',
  'obituaryAge',
  'obituaryState',
  'obituaryDeathPlace',
  'obituaryFuneralHome',
  'obituaryChurch',
  'obituaryCemeteryLocation',
  'obituaryBirthPlace',
  'obituaryMotherName',
  'obituaryFatherName',
  'obituaryHighSchool',
  'obituaryGradYear',
  'obituaryDegree',
  'obituaryCollege',
  'obituaryJobTitle',
  'obituaryCompany',
  'obituaryJobYears',
  'obituaryHobbies',
  'obituaryAwards',
  'obituaryOrganizations',
  'obituaryPronoun',
  'obituarySurvivorList',
  'obituaryPrecededList',
  'obituaryMemorial',
  'burialPrivate',
  'personStatus',
  'announcementStatus',
  'serviceStatus',
  'obituaryStatus',
  'thanksStatus',
];

// A value each key accepts: the pronoun and the two lists have their own rules.
function detailTestValue(key: string): string {
  if (key === 'obituaryPronoun') {
    return 'she';
  }
  if (key === 'obituarySurvivorList' || key === 'obituaryPrecededList') {
    return JSON.stringify([{ name: 'Ann', city: 'Tulsa', relation: 'spouse' }]);
  }
  return `sample ${key.slice(-6)}`;
}

describe('flow codec', () => {
  it('has the 56 detail keys', () => {
    expect(DETAIL_KEY_NAMES).toHaveLength(56);
    expect([...FLOW_DETAIL_KEYS].sort()).toEqual([...DETAIL_KEY_NAMES].sort());
  });

  it('writes exactly the attributes in design 1.2', () => {
    expect(Object.keys(encodeFlow(flow)).sort()).toEqual(
      [
        ...DETAIL_KEY_NAMES,
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
    const messageKeys = new Set<string>(FLOW_MESSAGE_KEYS);
    for (const name of Object.keys(encodeFlow(flow))) {
      if (messageKeys.has(name)) {
        continue;
      }
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

  it('writes every synced key as a flat attribute', () => {
    const item = encodeFlow(flow);
    for (const key of SYNCED_KEYS) {
      expect(Object.hasOwn(item, key)).toBe(true);
    }
  });

  it('carries each detail key on its own (removing one from encode fails here)', () => {
    for (const key of FLOW_DETAIL_KEYS) {
      const value =
        key === 'burialPrivate'
          ? true
          : key.endsWith('Status')
            ? 'ready'
            : detailTestValue(key);
      const item = { ...flow, details: { ...emptyDetails(), [key]: value } };
      const encoded = encodeFlow(item);
      expect(encoded[key]).toBe(value);
      expect(decodeFlow(encoded).details[key]).toBe(value);
    }
  });

  it('reads a missing detail key as null (burialPrivate false)', () => {
    const old = encodeFlow(flow);
    for (const key of FLOW_DETAIL_KEYS) {
      delete old[key];
    }
    const decoded = decodeFlow(old);
    expect(decoded.details).toEqual(emptyDetails());
    expect(decoded.details.serviceTime).toBeNull();
    expect(decoded.details.personStatus).toBeNull();
    expect(decoded.details.burialPrivate).toBe(false);
  });

  it('decodes a stored item that has none of the 26 obituary keys (all null)', () => {
    const old = encodeFlow(flow);
    for (const key of FLOW_DETAIL_TEXT_KEYS) {
      if (key.startsWith('obituary') && !['obituaryText', 'obituaryCity', 'obituaryCareer', 'obituarySurvivors', 'obituaryNote'].includes(key)) {
        delete old[key];
      }
    }
    const decoded = decodeFlow(old);
    expect(decoded.details.obituaryGivenName).toBeNull();
    expect(decoded.details.obituarySurvivorList).toBeNull();
    expect(decoded.details.obituaryPronoun).toBeNull();
  });

  it('still decodes an old item whose old key holds a lone surrogate', () => {
    const stored = encodeFlow(flow);
    stored['serviceNotes'] = 'a\ud83db';
    expect(decodeFlow(stored).details.serviceNotes).toBe('a\ud83db');
  });

  it('round-trips a new obituary item, and refuses a bad pronoun or list', () => {
    const item = {
      ...flow,
      details: { ...emptyDetails(), obituaryGivenName: 'Margaret', obituaryPronoun: 'she', obituaryPrecededList: detailTestValue('obituaryPrecededList') },
    };
    expect(decodeFlow(encodeFlow(item))).toEqual(item);
    for (const bad of [{ obituaryPronoun: 'it' }, { obituarySurvivorList: 'junk' }, { obituaryGivenName: 'a\ud83db' }]) {
      expect(() => encodeFlow({ ...flow, details: { ...emptyDetails(), ...bad } })).toThrow('Flow details are invalid.');
    }
  });

  it('round-trips a full set of details, including an empty message', () => {
    const full = {
      ...flow,
      details: {
        ...emptyDetails(),
        serviceTime: '2pm',
        serviceMessage: '',
        obituaryText: 'x'.repeat(FLOW_DETAIL_MAX_LENGTH.obituaryText),
        burialPrivate: true,
        serviceStatus: 'in_progress' as const,
      },
    };
    expect(decodeFlow(encodeFlow(full))).toEqual(full);
  });

  it('refuses invalid details on encode', () => {
    expect(() =>
      encodeFlow({
        ...flow,
        details: { ...emptyDetails(), serviceTime: 'x'.repeat(101) },
      }),
    ).toThrow('Flow details are invalid.');
    expect(() =>
      encodeFlow({
        ...flow,
        details: { ...emptyDetails(), draft: 'x' } as FlowItem['details'],
      }),
    ).toThrow('Flow details are invalid.');
  });

  it('writes a max-size item with every text at its cap', () => {
    const details = emptyDetails() as unknown as Record<string, unknown>;
    for (const key of FLOW_DETAIL_TEXT_KEYS) {
      details[key] = '一'.repeat(FLOW_DETAIL_MAX_LENGTH[key]);
    }
    details.obituaryPronoun = 'they';
    details.obituarySurvivorList = detailTestValue('obituarySurvivorList');
    details.obituaryPrecededList = detailTestValue('obituaryPrecededList');
    const big = { ...flow, details: details as FlowItem['details'] };
    expect(decodeFlow(encodeFlow(big))).toEqual(big);
  });
});

describe('parseFlowInput', () => {
  it('accepts an input with only old keys and one with new keys', () => {
    expect(parseFlowInput({ serviceTime: '2pm', obituaryNote: 'x' })).toEqual({
      facts: {},
      details: { serviceTime: '2pm', obituaryNote: 'x' },
    });
    expect(parseFlowInput({ obituaryGivenName: 'Margaret', obituaryPronoun: 'she' })).toEqual({
      facts: {},
      details: { obituaryGivenName: 'Margaret', obituaryPronoun: 'she' },
    });
    expect(parseFlowInput({ obituaryPronoun: 'it' })).toBeNull();
  });

  it('accepts details alone, facts alone, and both', () => {
    expect(parseFlowInput({ serviceTime: '2pm' })).toEqual({
      facts: {},
      details: { serviceTime: '2pm' },
    });
    expect(parseFlowInput({ serviceReady: true })).toEqual({
      facts: { serviceReady: true },
      details: {},
    });
    expect(parseFlowInput({ serviceReady: true, burialPrivate: true })).toEqual(
      { facts: { serviceReady: true }, details: { burialPrivate: true } },
    );
  });

  it('refuses unknown, forbidden, too-long and non-object input', () => {
    for (const bad of [
      { ownerId: 'x' },
      { messageOverride: 'x' },
      { selectedContactIds: [] },
      { serviceTime: 'x'.repeat(101) },
      { serviceTime: 5 },
      { personStatus: 'done' },
      'x',
      null,
      [],
    ]) {
      expect(parseFlowInput(bad)).toBeNull();
    }
  });
});
