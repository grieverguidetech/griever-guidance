import {
  FLOW_DETAIL_KEYS,
  FLOW_DETAIL_MAX_LENGTH,
  FLOW_DETAIL_TEXT_KEYS,
  FLOW_FACT_KEYS,
  FLOW_MESSAGE_KEYS,
  FLOW_STATUS_KEYS,
  FORBIDDEN_SYNC_KEYS,
  SYNCED_KEYS,
  flatToStatusMap,
  flowDetailsToSessionFields,
  mergeSyncedFields,
  mergeSyncedFieldsWithChanges,
  parseFlowPatch,
  parseFlowDetails,
  parseFlowFacts,
  parseFlowRecord,
  pickFlowDetails,
  withServicePair,
  splitSyncedPatch,
  statusMapToFlat,
  toFlowDetails,
  toSyncedFields,
  type FlowDetailKey,
  type SyncedFields,
} from './index.js';

describe('keys', () => {
  it('has 24 text keys, burialPrivate and 5 status keys', () => {
    expect(FLOW_DETAIL_TEXT_KEYS).toHaveLength(24);
    expect(FLOW_STATUS_KEYS).toHaveLength(5);
    expect(FLOW_DETAIL_KEYS).toHaveLength(30);
    expect(SYNCED_KEYS).toEqual([...FLOW_FACT_KEYS, ...FLOW_DETAIL_KEYS]);
    expect(new Set(SYNCED_KEYS).size).toBe(SYNCED_KEYS.length);
  });

  it('has a cap for every text key, with the planned sizes', () => {
    expect(Object.keys(FLOW_DETAIL_MAX_LENGTH).sort()).toEqual(
      [...FLOW_DETAIL_TEXT_KEYS].sort(),
    );
    expect(FLOW_DETAIL_MAX_LENGTH.birthDate).toBe(100);
    expect(FLOW_DETAIL_MAX_LENGTH.serviceAddress).toBe(500);
    expect(FLOW_DETAIL_MAX_LENGTH.serviceNotes).toBe(2000);
    expect(FLOW_DETAIL_MAX_LENGTH.obituaryText).toBe(10000);
    for (const key of FLOW_MESSAGE_KEYS) {
      expect(FLOW_DETAIL_MAX_LENGTH[key]).toBe(
        key === 'obituaryText' ? 10000 : 2000,
      );
    }
  });
});

describe('parseFlowDetails', () => {
  it.each(FLOW_DETAIL_TEXT_KEYS)(
    '%s parses at its cap and fails above it',
    (key) => {
      const max = FLOW_DETAIL_MAX_LENGTH[key];
      expect(parseFlowDetails({ [key]: 'a'.repeat(max) })).toEqual({
        [key]: 'a'.repeat(max),
      });
      expect(parseFlowDetails({ [key]: 'a'.repeat(max + 1) })).toBeNull();
      expect(parseFlowDetails({ [key]: null })).toEqual({ [key]: null });
      expect(parseFlowDetails({ [key]: 'a\u0000b' })).toBeNull();
      expect(parseFlowDetails({ [key]: 5 })).toBeNull();
    },
  );

  it('checks burialPrivate and the status values', () => {
    expect(parseFlowDetails({ burialPrivate: true })).toEqual({
      burialPrivate: true,
    });
    expect(parseFlowDetails({ burialPrivate: null })).toBeNull();
    expect(parseFlowDetails({ burialPrivate: 'yes' })).toBeNull();
    for (const key of FLOW_STATUS_KEYS) {
      expect(parseFlowDetails({ [key]: 'ready' })).toEqual({ [key]: 'ready' });
      expect(parseFlowDetails({ [key]: 'in_progress' })).toEqual({
        [key]: 'in_progress',
      });
      expect(parseFlowDetails({ [key]: null })).toEqual({ [key]: null });
      expect(parseFlowDetails({ [key]: 'done' })).toBeNull();
    }
  });

  it.each(FORBIDDEN_SYNC_KEYS)('rejects the forbidden key %s', (key) => {
    expect(parseFlowDetails({ [key]: 'x' })).toBeNull();
    expect(parseFlowDetails({ [key]: {} })).toBeNull();
    expect(parseFlowDetails({ serviceTime: '10am', [key]: [] })).toBeNull();
  });

  it('lists the forbidden keys the ticket names', () => {
    for (const key of [
      'drafts',
      'messageOverride',
      'recipientsNotified',
      'selectedContactIds',
      'hearsFirstIds',
      'senderName',
      'momentCompletedAt',
      'remindersScheduled',
      'checklist',
    ]) {
      expect(FORBIDDEN_SYNC_KEYS).toContain(key);
    }
  });

  it('rejects unknown keys and non-objects', () => {
    expect(parseFlowDetails({ surprise: 'x' })).toBeNull();
    expect(parseFlowDetails(null)).toBeNull();
    expect(parseFlowDetails([])).toBeNull();
    expect(parseFlowDetails('x')).toBeNull();
    expect(parseFlowDetails({})).toEqual({});
  });

  it('a create with only the six facts still parses as facts and as empty details', () => {
    const six = {
      personName: 'Margaret Hale',
      dateOfPassing: null,
      serviceDate: null,
      obituaryUrl: null,
      obituaryPublisher: null,
      serviceReady: false,
    };
    const split = splitSyncedPatch(six);
    expect(parseFlowFacts(split?.facts)).toEqual(six);
    expect(parseFlowDetails(split?.details)).toEqual({});
  });

  it('splits a mixed patch and sends unknown keys to the details half', () => {
    const split = splitSyncedPatch({
      personName: 'A',
      serviceTime: '10',
      x: 1,
    });
    expect(split?.facts).toEqual({ personName: 'A' });
    expect(parseFlowDetails(split?.details)).toBeNull();
    expect(splitSyncedPatch(null)).toBeNull();
  });
});

describe('null and undefined rule', () => {
  it('message keys: undefined becomes null, empty text is kept', () => {
    expect(toFlowDetails({}).serviceMessage).toBeNull();
    expect(toFlowDetails({ serviceMessage: '' }).serviceMessage).toBe('');
    expect(toFlowDetails({ obituaryText: '  keep  ' }).obituaryText).toBe(
      '  keep  ',
    );
  });

  it('other text keys: blank becomes null, text is trimmed', () => {
    expect(toFlowDetails({ servicePlace: '   ' }).servicePlace).toBeNull();
    expect(toFlowDetails({ servicePlace: '' }).servicePlace).toBeNull();
    expect(toFlowDetails({ servicePlace: ' Church ' }).servicePlace).toBe(
      'Church',
    );
  });

  it('message null comes back as an explicit undefined, other null as empty', () => {
    const back = flowDetailsToSessionFields({
      serviceMessage: null,
      thanksMessage: '',
      servicePlace: null,
      serviceTime: '10am',
    });
    expect('serviceMessage' in back).toBe(true);
    expect(back.serviceMessage).toBeUndefined();
    expect(back.thanksMessage).toBe('');
    expect(back.servicePlace).toBe('');
    expect(back.serviceTime).toBe('10am');
    expect({ serviceMessage: 'old', ...back }.serviceMessage).toBeUndefined();
  });

  it('cuts above the cap and never splits a surrogate pair', () => {
    const long = toFlowDetails({ birthDate: 'a'.repeat(150) });
    expect(long.birthDate).toHaveLength(100);
    const emoji = toFlowDetails({ obituaryText: `${'a'.repeat(9999)}😀` });
    expect(emoji.obituaryText).toHaveLength(9999);
    expect(
      parseFlowDetails(toFlowDetails({ serviceNotes: 'x'.repeat(5000) })),
    ).not.toBeNull();
  });

  it('strips NUL', () => {
    expect(toFlowDetails({ serviceNotes: 'a\u0000b' }).serviceNotes).toBe('ab');
  });
});

describe('status map and flat keys', () => {
  it('round-trips', () => {
    const map = { person: 'ready', service: 'in_progress' } as const;
    const flat = statusMapToFlat(map);
    expect(flat).toEqual({
      personStatus: 'ready',
      announcementStatus: null,
      serviceStatus: 'in_progress',
      obituaryStatus: null,
      thanksStatus: null,
    });
    expect(flatToStatusMap(flat)).toEqual(map);
  });

  it('treats a missing map as all null and an empty flat as an empty map', () => {
    expect(Object.values(statusMapToFlat(undefined))).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(flatToStatusMap({})).toEqual({});
  });
});

describe('toSyncedFields and flowDetailsToSessionFields', () => {
  const session = {
    personName: 'Margaret Hale',
    dateOfPassing: 'May 29, 2026',
    serviceTime: '10:00 am',
    burialPrivate: true,
    sectionStatus: { person: 'ready' } as const,
    // Never sync:
    senderName: 'Anna',
    drafts: { announce: { messageOverride: 'secret words' } },
    selectedContactIds: ['c1'],
    messageOverride: 'secret words',
  };

  it('emits exactly the synced keys and no private data', () => {
    const out = toSyncedFields(session);
    expect(Object.keys(out).sort()).toEqual([...SYNCED_KEYS].sort());
    const json = JSON.stringify(out);
    for (const secret of ['Anna', 'secret words', 'c1']) {
      expect(json).not.toContain(secret);
    }
    expect(out.burialPrivate).toBe(true);
    expect(out.personStatus).toBe('ready');
    expect(out.serviceTime).toBe('10:00 am');
  });

  it('round-trips through the wire', () => {
    const back = flowDetailsToSessionFields(toSyncedFields(session));
    expect(back.serviceTime).toBe('10:00 am');
    expect(back.burialPrivate).toBe(true);
    expect(back.sectionStatus).toEqual({ person: 'ready' });
    expect(back.serviceMessage).toBeUndefined();
  });
});

describe('mergeSyncedFields', () => {
  const local = toSyncedFields({ personName: 'A', serviceTime: 'local' });
  const remote: Partial<SyncedFields> = {
    personName: 'B',
    serviceTime: 'remote',
    burialPrivate: true,
    personStatus: 'ready',
    serviceMessage: null,
  };

  it('takes remote values for detail keys', () => {
    const merged = mergeSyncedFields(local, remote, []);
    expect(merged.serviceTime).toBe('remote');
    expect(merged.burialPrivate).toBe(true);
    expect(merged.personStatus).toBe('ready');
    expect(merged.personName).toBe('B');
  });

  it('keeps local for pending keys and for keys the remote lacks', () => {
    const merged = mergeSyncedFields(local, remote, [
      'serviceTime',
      'personStatus',
    ]);
    expect(merged.serviceTime).toBe('local');
    expect(merged.personStatus).toBeNull();
    expect(merged.obituaryCity).toBeNull();
    expect(local.serviceTime).toBe('local');
  });
});

describe('payload size', () => {
  it('a computed maximum payload is under 128 KB', () => {
    const full: Record<string, unknown> = {
      personName: 'n'.repeat(200),
      dateOfPassing: 'd'.repeat(100),
      serviceDate: 'd'.repeat(100),
      obituaryUrl: `https://${'u'.repeat(2040)}`,
      obituaryPublisher: 'p'.repeat(200),
      serviceReady: true,
      burialPrivate: true,
    };
    for (const key of FLOW_DETAIL_TEXT_KEYS) {
      full[key] = '一'.repeat(FLOW_DETAIL_MAX_LENGTH[key]);
    }
    for (const key of FLOW_STATUS_KEYS) {
      full[key] = 'in_progress';
    }
    const split = splitSyncedPatch(full);
    expect(parseFlowFacts(split?.facts)).not.toBeNull();
    expect(parseFlowDetails(split?.details)).not.toBeNull();
    const bytes = new TextEncoder().encode(JSON.stringify(full)).length;
    expect(bytes).toBeLessThan(128 * 1024);
    // 3 bytes per CJK character: the true worst case, 83,492 bytes with the JSON overhead.
    expect(bytes).toBeGreaterThan(80 * 1024);
  });
});

// Type-level guard: a forbidden key can never become a detail key.
type ForbiddenDetail = Extract<
  FlowDetailKey,
  (typeof FORBIDDEN_SYNC_KEYS)[number]
>;
const noForbiddenDetail: [ForbiddenDetail] extends [never] ? true : false =
  true;
it('keeps forbidden keys out of the type', () => {
  expect(noForbiddenDetail).toBe(true);
});

describe('hardening', () => {
  it('refuses a smuggled __proto__ key from JSON.parse', () => {
    const input = JSON.parse(
      '{"personName":"A","__proto__":{"serviceNotes":"smuggled","senderName":"Anna"}}',
    );
    const split = splitSyncedPatch(input);
    expect(parseFlowDetails(split?.details)).toBeNull();
    expect(parseFlowPatch(input)).toBeNull();
    expect(parseFlowDetails(input)).toBeNull();
  });

  it('does not read inherited keys', () => {
    const inherited = Object.create({ serviceNotes: 'inherited' });
    expect(parseFlowDetails(inherited)).toEqual({});
  });

  it('keeps other statuses when a partial status set arrives', () => {
    const back = flowDetailsToSessionFields(
      { serviceStatus: 'ready' },
      { person: 'ready' },
    );
    expect(back.sectionStatus).toEqual({ person: 'ready', service: 'ready' });
    expect(
      flowDetailsToSessionFields({ serviceStatus: null }, { service: 'ready' })
        .sectionStatus,
    ).toEqual({});
    expect('sectionStatus' in flowDetailsToSessionFields({})).toBe(false);
  });

  it('statusMapToFlat drops values that are not statuses', () => {
    expect(
      statusMapToFlat({ person: 'bogus' } as never).personStatus,
    ).toBeNull();
  });

  it('refuses C0 control characters except tab, newline and carriage return', () => {
    expect(parseFlowDetails({ serviceNotes: 'a\u0001b' })).toBeNull();
    expect(parseFlowDetails({ serviceNotes: 'a\u001fb' })).toBeNull();
    expect(parseFlowDetails({ serviceNotes: 'a\tb\nc\rd' })).not.toBeNull();
    expect(
      toFlowDetails({ serviceNotes: 'a\u0001b\u0000c' }).serviceNotes,
    ).toBe('abc');
    expect(toFlowDetails({ serviceMessage: 'x\u0007y' }).serviceMessage).toBe(
      'xy',
    );
  });

  it('trims trailing space left by a cut on non-message keys', () => {
    const value = toFlowDetails({
      birthDate: `${'a'.repeat(99)} bcd`,
    }).birthDate;
    expect(value).toBe('a'.repeat(99));
  });

  it('no synced key is forbidden', () => {
    for (const key of SYNCED_KEYS) {
      expect(FORBIDDEN_SYNC_KEYS).not.toContain(key);
    }
  });

  it.each(FORBIDDEN_SYNC_KEYS)('parseFlowPatch rejects %s', (key) => {
    expect(parseFlowPatch({ [key]: 'x' })).toBeNull();
  });

  it('lists the send-flow and contact fields', () => {
    for (const key of [
      'fields',
      'tone',
      'includeFlowers',
      'customFlorist',
      'flowerDeliveryTarget',
      'templateCategory',
      'templateOverrideId',
      'serviceDetailsKnown',
      'selectedContactIds',
      'phone',
      'phones',
      'email',
      'emails',
      'displayName',
    ]) {
      expect(FORBIDDEN_SYNC_KEYS).toContain(key);
    }
  });
});

describe('mergeSyncedFieldsWithChanges', () => {
  const local = toSyncedFields({
    personName: 'A',
    serviceTime: 'local',
    servicePlace: 'Hall',
  });

  it('returns only remote-taken keys that differ and are not pending', () => {
    const { merged, changed } = mergeSyncedFieldsWithChanges(
      local,
      {
        personName: 'A',
        serviceTime: 'remote',
        servicePlace: 'Church',
        burialPrivate: false,
      },
      ['servicePlace'],
    );
    expect(changed).toEqual({ serviceTime: 'remote' });
    expect(merged.servicePlace).toBe('Hall');
  });

  it('a remote null overwrites a non-pending local value', () => {
    const { merged, changed } = mergeSyncedFieldsWithChanges(
      local,
      { servicePlace: null },
      [],
    );
    expect(merged.servicePlace).toBeNull();
    expect(changed).toEqual({ servicePlace: null });
  });
});

describe('parseFlowRecord details handling', () => {
  const base = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    ownerId: 'user_2abcDEF123',
    role: 'owner',
    facts: {
      personName: 'Joan',
      dateOfPassing: null,
      serviceDate: null,
      obituaryUrl: null,
      obituaryPublisher: null,
      serviceReady: true,
    },
    updatedAt: '2026-10-12T10:00:00Z',
    updatedBy: null,
  };

  it('keeps a full details object, as the data function returns it', () => {
    const details = toFlowDetails({});
    expect(parseFlowRecord({ ...base, details })?.details).toEqual(details);
  });

  it('drops only the details when they fail validation, and keeps the facts', () => {
    const record = parseFlowRecord({ ...base, details: { serviceStatus: 'done' } });
    expect(record?.facts.personName).toBe('Joan');
    expect(record).not.toHaveProperty('details');
  });

  it('drops only the details when they are not an object', () => {
    const record = parseFlowRecord({ ...base, details: 'x' });
    expect(record?.facts.serviceReady).toBe(true);
    expect(record).not.toHaveProperty('details');
  });

  it('still rejects a record with bad facts', () => {
    expect(parseFlowRecord({ ...base, facts: { ...base.facts, personName: 5 }, details: {} })).toBeNull();
  });
});

describe('pickFlowDetails and withServicePair', () => {
  it('copies only own detail keys that have a value', () => {
    const source = Object.create({ serviceTime: 'inherited' }) as Record<string, unknown>;
    Object.assign(source, { servicePlace: 'St. Mark', serviceNotes: undefined, personName: 'x' });
    expect(pickFlowDetails(source)).toEqual({ servicePlace: 'St. Mark' });
  });

  it('widens either service key to both, and leaves other keys alone', () => {
    expect([...withServicePair(['serviceReady'])].sort()).toEqual(['serviceReady', 'serviceStatus']);
    expect([...withServicePair(['serviceStatus', 'personName'])].sort()).toEqual([
      'personName',
      'serviceReady',
      'serviceStatus',
    ]);
    expect([...withServicePair(['personName'])]).toEqual(['personName']);
  });
});
