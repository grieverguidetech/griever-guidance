import { announcementPrefill, summaryLine, thanksPrefill } from './messagePrefill';

describe('messagePrefill', () => {
  it('the announcement prefill fills in the name and the date', () => {
    const text = announcementPrefill({ personName: 'Margaret Hayes', dateOfPassing: '2026-05-29' });
    expect(text).toContain('Margaret Hayes');
    expect(text).not.toContain('our loved one');
    expect(text).toContain('2026');
  });

  it('with no name, both prefills use "our loved one"', () => {
    expect(announcementPrefill({ dateOfPassing: '2026-05-29' })).toContain('our loved one');
    expect(thanksPrefill({ personName: '   ' })).toContain('our loved one');
  });

  it('the thanks prefill fills in the name', () => {
    const text = thanksPrefill({ personName: 'Margaret Hayes' });
    expect(text).toContain('Margaret Hayes');
    expect(text).not.toContain('{deceasedName}');
  });

  it('pins the exact text the sections showed before the move', () => {
    expect(announcementPrefill({ personName: 'Margaret Hayes', dateOfPassing: '2026-05-29' })).toBe(
      "With much love, we're letting you know that Margaret Hayes passed away on 2026-05-29.",
    );
    expect(thanksPrefill({ personName: 'Margaret Hayes' })).toBe(
      'Thank you for your kindness and support after the passing of Margaret Hayes. Your presence and thoughtfulness have meant more than words can express.',
    );
  });

  describe('summaryLine', () => {
    it('returns the first non-empty line, trimmed', () => {
      expect(summaryLine('\n  Hello there.\nSecond')).toBe('Hello there.');
      expect(summaryLine('  \n ')).toBe('');
    });

    it('cuts at the last space within 80 characters (literal expected)', () => {
      const text = 'Thank you for your kindness and support after the passing of Margaret Hayes. Your presence matters.';
      expect(summaryLine(text)).toBe('Thank you for your kindness and support after the passing of Margaret Hayes…');
    });

    it('never ends mid-word', () => {
      const words = Array.from({ length: 40 }, (_, i) => `word${i}`);
      const text = words.join(' ');
      const out = summaryLine(text);
      expect(out.endsWith('…')).toBe(true);
      expect(out.length).toBeLessThanOrEqual(81);
      expect(words).toContain(out.slice(0, -1).split(' ').pop());
    });

    it('hard-cuts a line with no space', () => {
      expect(summaryLine('x'.repeat(200))).toBe(`${'x'.repeat(80)}…`);
    });
  });
});
