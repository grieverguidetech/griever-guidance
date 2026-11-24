import {
  CHECKLIST_FLOW_KEYS,
  CHECKLIST_PHASES,
  checklistFlowKey,
  checklistToFlat,
  flatToChecklist,
  flowDetailsToSessionFields,
  mergeFlatIntoChecklist,
  parseFlowDetails,
  splitSyncedPatch,
  toFlowDetails,
  toSyncedFields,
  parseFlowFacts,
} from './index.js';

describe('checklist wire keys', () => {
  it('has one distinct key per phase item', () => {
    const ids = CHECKLIST_PHASES.flatMap((phase) => phase.itemIds);
    expect(CHECKLIST_FLOW_KEYS).toHaveLength(ids.length);
    expect(new Set(CHECKLIST_FLOW_KEYS).size).toBe(ids.length);
  });

  it('derives the key from the item id', () => {
    expect(checklistFlowKey('pronouncement')).toBe('checkPronouncement');
    expect(checklistFlowKey('burial-or-cremation')).toBe('checkBurialOrCremation');
    expect(checklistFlowKey('viewing-clothing-photo')).toBe('checkViewingClothingPhoto');
  });
});

describe('checklist mapping', () => {
  it('maps a checklist to flat keys, open items null', () => {
    const flat = checklistToFlat({ pronouncement: 'done', custody: 'not_applicable' });
    expect(flat.checkPronouncement).toBe('done');
    expect(flat.checkCustody).toBe('not_applicable');
    expect(flat.checkHeadstone).toBeNull();
    expect(Object.keys(flat)).toHaveLength(CHECKLIST_FLOW_KEYS.length);
  });

  it('round-trips both ways', () => {
    const checklist = { pronouncement: 'done', headstone: 'not_applicable' } as const;
    expect(flatToChecklist(checklistToFlat(checklist))).toEqual(checklist);
    const flat = checklistToFlat({ eulogy: 'done' });
    expect(checklistToFlat(flatToChecklist(flat))).toEqual(flat);
  });

  it('ignores unknown item ids and bad states', () => {
    const flat = checklistToFlat({
      nope: 'done',
      custody: 'maybe',
    } as unknown as Parameters<typeof checklistToFlat>[0]);
    expect(Object.values(flat).every((value) => value === null)).toBe(true);
  });

  it('merges only the keys sent: a value sets, null clears, a missing key keeps', () => {
    const next = mergeFlatIntoChecklist(
      { checkCustody: 'done', checkPronouncement: null },
      { pronouncement: 'done', headstone: 'done' },
    );
    expect(next).toEqual({ custody: 'done', headstone: 'done' });
  });

  it('toFlowDetails and toSyncedFields send all 37 check keys, open items as null (#1080)', () => {
    const source = { checklist: { 'guest-book': 'done', custody: 'not_applicable' } } as const;
    for (const out of [toFlowDetails(source), toSyncedFields(source)]) {
      const record = out as unknown as Record<string, unknown>;
      expect(Object.keys(out).filter((key) => key.startsWith('check')).sort()).toEqual(
        [...CHECKLIST_FLOW_KEYS].sort(),
      );
      expect(record.checkGuestBook).toBe('done');
      expect(record.checkCustody).toBe('not_applicable');
      expect(record.checkEulogy).toBeNull();
    }
  });

  it('a session with no checklist sends every check key as null', () => {
    const out = toFlowDetails({}) as unknown as Record<string, unknown>;
    for (const key of CHECKLIST_FLOW_KEYS) {
      expect(out[key]).toBeNull();
    }
  });

  it('flowDetailsToSessionFields maps the keys back into the checklist', () => {
    const fields = flowDetailsToSessionFields({ checkReception: 'not_applicable' }, {}, {
      'guest-book': 'done',
    });
    expect(fields.checklist).toEqual({ 'guest-book': 'done', reception: 'not_applicable' });
    expect(flowDetailsToSessionFields({ personStatus: 'ready' })).not.toHaveProperty('checklist');
  });

  it('an empty merged checklist is no field, but still clears when spread over a session', () => {
    const fields = flowDetailsToSessionFields({ checkCustody: null }, {}, { custody: 'done' });
    expect(fields.checklist).toBeUndefined();
    expect(fields).toHaveProperty('checklist');
    expect({ checklist: { custody: 'done' }, ...fields }.checklist).toBeUndefined();
    const allNull = flowDetailsToSessionFields({ checkCustody: null, checkEulogy: null });
    expect(allNull.checklist).toBeUndefined();
  });

  it('toSyncedFields never carries a checklist object or the Gather ticks', () => {
    const synced = toSyncedFields({ checklist: { custody: 'done' } }) as unknown as Record<
      string,
      unknown
    >;
    expect(Object.hasOwn(synced, 'checklist')).toBe(false);
    expect(Object.hasOwn(synced, 'checklistTicks')).toBe(false);
  });
});

describe('checklist keys on the wire', () => {
  it('accepts done, not_applicable and null', () => {
    for (const value of ['done', 'not_applicable', null]) {
      expect(parseFlowDetails({ checkCustody: value })).toEqual({ checkCustody: value });
    }
  });

  it('refuses any other value', () => {
    for (const value of ['open', 'Done', '', true, 1, undefined, {}, ['done']]) {
      expect(parseFlowDetails({ checkCustody: value })).toBeNull();
    }
  });

  it('still refuses checklist and checklistTicks by name', () => {
    expect(parseFlowDetails({ checklist: { custody: 'done' } })).toBeNull();
    expect(parseFlowDetails({ checklistTicks: {} })).toBeNull();
    expect(splitSyncedPatch({ checklist: {} })?.details).toHaveProperty('checklist');
  });

  it('refuses an unknown check key', () => {
    expect(parseFlowDetails({ checkNotAnItem: 'done' })).toBeNull();
  });

  it('accepts a full set of facts and details', () => {
    const full = toSyncedFields({ personName: 'Ann', checklist: { custody: 'done' } });
    const split = splitSyncedPatch(full);
    expect(parseFlowFacts(split?.facts)).not.toBeNull();
    expect(parseFlowDetails(split?.details)).not.toBeNull();
  });
});
