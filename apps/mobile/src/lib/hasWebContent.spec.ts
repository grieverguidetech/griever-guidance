import { describe, expect, it } from '@jest/globals';
import { hasWebContent } from './hasWebContent';

describe('hasWebContent', () => {
  const messageFlows = [
    ['announcement', 'announcementMessage'],
    ['service', 'serviceMessage'],
    ['aftercare', 'thanksMessage'],
  ] as const;

  describe.each(messageFlows)('%s reads %s', (category, key) => {
    it('is false when the message is missing', () => {
      expect(hasWebContent({}, category)).toBe(false);
      expect(hasWebContent({ [key]: undefined }, category)).toBe(false);
      expect(hasWebContent({ [key]: null }, category)).toBe(false);
    });

    it('is false when the message is blank', () => {
      expect(hasWebContent({ [key]: '' }, category)).toBe(false);
      expect(hasWebContent({ [key]: '  \n\t ' }, category)).toBe(false);
    });

    it('is true when the message has words', () => {
      expect(hasWebContent({ [key]: 'Come as you are.' }, category)).toBe(true);
    });

    it("ignores the other flows' messages and the obituary", () => {
      const others = { announcementMessage: 'a', serviceMessage: 's', thanksMessage: 't', obituaryText: 'o', obituaryUrl: 'https://x.example/o' };
      expect(hasWebContent({ ...others, [key]: '' }, category)).toBe(false);
    });
  });

  describe('obituary', () => {
    it('is false with no text and no link', () => {
      expect(hasWebContent({}, 'obituary')).toBe(false);
      expect(hasWebContent({ obituaryText: '', obituaryUrl: '' }, 'obituary')).toBe(false);
      expect(hasWebContent({ obituaryText: '   ', obituaryUrl: '  ' }, 'obituary')).toBe(false);
      expect(hasWebContent({ obituaryText: null, obituaryUrl: null }, 'obituary')).toBe(false);
    });

    it('is true with text, with a link, or both', () => {
      expect(hasWebContent({ obituaryText: 'Anna loved the garden.' }, 'obituary')).toBe(true);
      expect(hasWebContent({ obituaryUrl: 'https://legacy.com/anna' }, 'obituary')).toBe(true);
      expect(hasWebContent({ obituaryText: 'Text', obituaryUrl: 'https://legacy.com/anna' }, 'obituary')).toBe(true);
    });

    it('does not count the other flows messages', () => {
      expect(hasWebContent({ announcementMessage: 'a', serviceMessage: 's', thanksMessage: 't' }, 'obituary')).toBe(false);
    });
  });
});
