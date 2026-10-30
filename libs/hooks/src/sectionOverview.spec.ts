import { describe, expect, it } from 'vitest';
import { SECTION_ORDER } from '@griever/shared';
import { computeSections } from './sectionOverview';

describe('computeSections', () => {
  it('marks an empty session Not started with person next', () => {
    const result = computeSections({});
    expect(result.sections.map((s) => s.status)).toEqual(
      SECTION_ORDER.map(() => 'not_started'),
    );
    expect(result.next).toBe('person');
  });

  it('moves next to announcement when person is ready', () => {
    const result = computeSections({ sectionStatus: { person: 'ready' } });
    expect(result.next).toBe('announcement');
  });

  it('skips sections that are not available', () => {
    const result = computeSections(
      { sectionStatus: { person: 'ready' } },
      ['person', 'service'],
    );
    expect(result.next).toBe('service');
  });

  it('treats an in-progress section as next', () => {
    const result = computeSections({
      sectionStatus: { person: 'ready', announcement: 'in_progress' },
    });
    expect(result.next).toBe('announcement');
    expect(result.sections[1].status).toBe('in_progress');
  });

  it('returns null when all are ready', () => {
    const sectionStatus = Object.fromEntries(
      SECTION_ORDER.map((key) => [key, 'ready' as const]),
    );
    expect(computeSections({ sectionStatus }).next).toBeNull();
  });

  it('returns null when no available section is left', () => {
    expect(
      computeSections({ sectionStatus: { person: 'ready' } }, ['person']).next,
    ).toBeNull();
  });

  it('keeps the fixed order whatever the key order', () => {
    const result = computeSections({
      sectionStatus: { thanks: 'ready', person: 'ready', service: 'in_progress' },
    });
    expect(result.sections.map((s) => s.key)).toEqual([...SECTION_ORDER]);
  });
});
