import { describe, expect, it } from '@jest/globals';
import { hasWebContent } from './hasWebContent';

describe('hasWebContent', () => {
  const messageFlows = [
    ['announcement', 'announcementMessage'],
    ['aftercare', 'thanksMessage'],
  ] as const;

  describe.each(messageFlows)('%s reads %s', (category, key) => {
    it('is false when the message is missing or blank', () => {
      expect(hasWebContent({}, category)).toBe(false);
      expect(hasWebContent({ [key]: undefined }, category)).toBe(false);
      expect(hasWebContent({ [key]: null }, category)).toBe(false);
      expect(hasWebContent({ [key]: '' }, category)).toBe(false);
      expect(hasWebContent({ [key]: '  \n\t ' }, category)).toBe(false);
    });

    it('is true when the message has words', () => {
      expect(hasWebContent({ [key]: 'Come as you are.' }, category)).toBe(true);
    });

    it("ignores the other flows' fields", () => {
      const others = { announcementMessage: 'a', serviceMessage: 's', serviceDate: 'June 1', thanksMessage: 't', obituaryText: 'o', obituaryUrl: 'https://x.example/o' };
      expect(hasWebContent({ ...others, [key]: '' }, category)).toBe(false);
    });
  });

  describe('service', () => {
    it('is false with nothing started', () => {
      expect(hasWebContent({}, 'service')).toBe(false);
      expect(hasWebContent({ serviceMessage: ' ', serviceType: '', serviceDate: '  ', servicePlace: null }, 'service')).toBe(false);
    });

    it.each(['serviceMessage', 'serviceType', 'serviceDate', 'servicePlace'])('is true with only %s', (key) => {
      expect(hasWebContent({ [key]: 'Something' }, 'service')).toBe(true);
    });
  });

  describe('obituary', () => {
    it('is false with nothing started', () => {
      expect(hasWebContent({}, 'obituary')).toBe(false);
      expect(hasWebContent({ obituaryText: '   ', obituaryUrl: '  ', obituaryPublisher: '', obituaryCity: '' }, 'obituary')).toBe(false);
      expect(hasWebContent({ obituaryText: null, obituaryUrl: null }, 'obituary')).toBe(false);
    });

    it.each(['obituaryText', 'obituaryUrl', 'obituaryPublisher', 'obituaryCity', 'obituaryCareer'])('is true with only %s', (key) => {
      expect(hasWebContent({ [key]: 'Something' }, 'obituary')).toBe(true);
    });

    it('does not count the other flows', () => {
      expect(hasWebContent({ announcementMessage: 'a', serviceMessage: 's', serviceDate: 'June 1', thanksMessage: 't' }, 'obituary')).toBe(false);
    });
  });
});
