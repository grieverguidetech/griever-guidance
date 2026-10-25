import { describe, expect, it } from 'vitest';
import { SAMPLE_PERSON_NAME, getIntroSamples } from './introSamples.js';
import { announcePassing, shareService, thankYouNote } from './templates.js';

describe('getIntroSamples', () => {
  const samples = getIntroSamples();

  it('returns announcement, service, thank-you in order', () => {
    expect(samples).toHaveLength(3);
    expect(samples[0].text).toBe(
      announcePassing.renderMessage({
        deceasedName: SAMPLE_PERSON_NAME,
        senderName: '[Your name]',
        serviceDetailsKnown: 'no',
      }),
    );
    expect(samples[1].text).toBe(
      shareService.renderMessage({
        deceasedName: SAMPLE_PERSON_NAME,
        serviceDate: '[day and date]',
        serviceTime: '[time]',
        serviceLocation: '[place]',
      }),
    );
    expect(samples[2].text).toBe(
      thankYouNote.renderMessage({
        senderName: '[Your name]',
        deceasedName: SAMPLE_PERSON_NAME,
      }),
    );
  });

  it('uses the sample name and "details will follow" wording', () => {
    for (const s of samples) expect(s.text).toContain(SAMPLE_PERSON_NAME);
    expect(samples[0].text).toContain('Details of the service will follow');
  });

  it('has titles and no exclamation marks (C7)', () => {
    for (const s of samples) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.title).not.toContain('!');
      expect(s.text).not.toContain('!');
    }
  });

  it('never shows an obituary link (C10)', () => {
    for (const s of samples) {
      expect(s.text).not.toContain('http');
      expect(s.text).not.toContain('www.');
      expect(s.text.toLowerCase()).not.toContain('obituary');
    }
  });
});
