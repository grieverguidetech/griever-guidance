import * as shared from './index.js';
import type { Template } from './types.js';

/**
 * C7: calm, plain copy. No exclamation points in any message a family sends, or in the
 * template names, descriptions, labels and placeholders they read while writing it.
 * Every exported template is checked (not only the four in `templates`), so a new one is
 * covered the moment it is exported.
 */
const allTemplates = Object.values(shared).filter(
  (value): value is Template =>
    typeof value === 'object' && value !== null && 'renderMessage' in value && 'fields' in value,
);

const SAMPLE = {
  deceasedName: 'Margaret Hayes',
  dateOfPassing: 'May 29, 2026',
  serviceDate: 'June 14, 2026',
  serviceTime: '2:00 PM',
  serviceLocation: "St. Mary's Church",
  eventDate: 'June 20, 2026',
  eventLocation: 'The family home',
  wakeTime: '6:00 PM',
  senderName: 'Peter',
  obituaryUrl: 'legacy.com/margaret',
  briefMessage: 'Thank you for being there.',
  personalNote: 'She loved you.',
  serviceNotes: 'Parking is behind the church.',
  floristName: 'Rose & Co',
  flowerDeliveryTarget: 'funeral home',
};

const VARIANTS: Record<string, string>[] = [
  {},
  { tone: 'plain', serviceDetailsKnown: 'yes' },
  { tone: 'softer', serviceDetailsKnown: 'yes' },
  { tone: 'plain', serviceDetailsKnown: 'no' },
  { tone: 'softer', serviceDetailsKnown: 'no' },
];

describe('template copy is calm (C7)', () => {
  it('finds the templates, so the checks below are not vacuous', () => {
    expect(allTemplates.length).toBeGreaterThanOrEqual(4);
  });

  it.each(allTemplates.map((t) => [t.id, t] as const))('%s: no "!" in what the family reads or sends', (_id, t) => {
    const shown = [t.name, t.description, ...t.fields.flatMap((f) => [f.label, f.placeholder])];
    const sent = VARIANTS.flatMap((variant) => [
      t.renderMessage({ ...SAMPLE, ...variant }),
      t.renderMessage(variant),
    ]);
    for (const text of [...shown, ...sent]) {
      expect(text, text).not.toContain('!');
    }
  });

  it('keeps the category labels free of "!"', () => {
    for (const label of Object.values(shared.categoryLabels)) expect(label).not.toContain('!');
  });
});
