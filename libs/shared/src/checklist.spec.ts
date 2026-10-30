import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHECKLIST_PHASES } from './checklist.js';

const DEVICE_IDS = [
  'will-or-wishes',
  'pre-arranged-plans',
  'ssn-and-id',
  'life-insurance',
  'military-papers',
];

const allIds = CHECKLIST_PHASES.flatMap((phase) => [...phase.itemIds]);

describe('checklist model', () => {
  it('has 6 phases in order', () => {
    expect(CHECKLIST_PHASES.map((p) => p.key)).toEqual([
      'right-away',
      'first-days',
      'obituary',
      'planning-service',
      'first-weeks',
      'first-months',
    ]);
  });

  it('has 37 unique item ids', () => {
    expect(allIds).toHaveLength(37);
    expect(new Set(allIds).size).toBe(37);
  });

  it('does not reuse a device checklist id', () => {
    for (const id of DEVICE_IDS) {
      expect(allIds).not.toContain(id);
    }
  });

  it('lists each phase ids in order', () => {
    expect(CHECKLIST_PHASES.map((p) => [...p.itemIds])).toEqual([
      [
        'pronouncement',
        'custody',
        'find-wishes',
        'tell-close-family',
        'dependents-care',
        'secure-home',
      ],
      [
        'burial-or-cremation',
        'casket-or-urn',
        'set-service',
        'officiant',
        'death-certificates',
        'pallbearers',
        'viewing-clothing-photo',
      ],
      [
        'confirm-service-details',
        'write-obituary',
        'submit-obituary',
        'share-obituary',
      ],
      [
        'flowers-programs-music',
        'guest-book',
        'reception',
        'eulogy',
        'family-transport',
        'notify-community',
      ],
      [
        'notify-ssa',
        'notify-banks',
        'life-insurance-claims',
        'pension-retirement',
        'utilities-housing',
        'cancel-subscriptions',
        'forward-mail',
        'thank-you-notes',
      ],
      [
        'will-and-probate',
        'retitle-property',
        'online-accounts',
        'final-tax-return',
        'headstone',
        'follow-up-claims',
      ],
    ]);
  });

  it('matches the item keys in the copy file', () => {
    const copy = JSON.parse(
      readFileSync(
        new URL('../../copy/screens/cmsChecklist.json', import.meta.url),
        'utf8',
      ),
    ) as { items: Record<string, string> };
    expect([...allIds].sort()).toEqual(Object.keys(copy.items).sort());
  });
});
