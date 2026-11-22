import { describe, expect, it } from '@jest/globals';
import { isMarkedReady } from './isMarkedReady';

const cases = [
  ['announcement', 'announcement'],
  ['service', 'service'],
  ['aftercare', 'thanks'],
  ['obituary', 'obituary'],
] as const;

describe('isMarkedReady (the web Ready status)', () => {
  describe.each(cases)('%s reads sectionStatus.%s', (category, key) => {
    it('is true only when the status is ready', () => {
      expect(isMarkedReady({ sectionStatus: { [key]: 'ready' } }, category)).toBe(true);
    });

    it('is false with no status, no sectionStatus or in_progress', () => {
      expect(isMarkedReady({}, category)).toBe(false);
      expect(isMarkedReady({ sectionStatus: {} }, category)).toBe(false);
      expect(isMarkedReady({ sectionStatus: { [key]: 'in_progress' } }, category)).toBe(false);
    });

    it('is false with edited text but no Ready status', () => {
      const text = { announcementMessage: 'a', serviceMessage: 's', serviceType: 'Funeral', serviceDate: 'June 1', servicePlace: 'Oak', thanksMessage: 't', obituaryText: 'o', obituaryUrl: 'https://x.example/o', obituaryPublisher: 'Times' };
      expect(isMarkedReady(text, category)).toBe(false);
    });

    it("ignores the other steps' status", () => {
      const others = Object.fromEntries(cases.filter(([, k]) => k !== key).map(([, k]) => [k, 'ready']));
      expect(isMarkedReady({ sectionStatus: others }, category)).toBe(false);
    });
  });
});
