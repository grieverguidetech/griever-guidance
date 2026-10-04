import {
  announcePassing,
  composeMessage,
  historyTagLabel,
  normalizeUrl,
  shareService,
  templates,
} from './index.js';

describe('announcePassing', () => {
  const base = { deceasedName: 'Margaret Hayes', dateOfPassing: 'May 29, 2026' };

  it('is sendable on name and date alone', () => {
    expect(announcePassing.renderMessage(base)).toBe(
      "With much love, we're letting you know that Margaret Hayes passed away on May 29, 2026.",
    );
  });

  it('falls back to "our loved one" rather than an empty name', () => {
    expect(announcePassing.renderMessage({})).toBe(
      "With much love, we're letting you know that our loved one passed away.",
    );
  });

  it('says details will follow when the service is not known yet', () => {
    const msg = announcePassing.renderMessage({ ...base, serviceDetailsKnown: 'no' });
    expect(msg).toContain('Details of the service will follow once we have them.');
  });

  it('includes the service when the griever has it', () => {
    const msg = announcePassing.renderMessage({
      ...base,
      serviceDetailsKnown: 'yes',
      serviceDate: 'June 14, 2026',
      serviceTime: '2:00 PM',
      serviceLocation: "St. Mary's Church",
    });
    expect(msg).toContain("The service will be held June 14, 2026, at 2:00 PM, St. Mary's Church.");
    expect(msg).not.toContain('will follow');
  });

  it('treats "yes" with no date or place as details still to follow', () => {
    const msg = announcePassing.renderMessage({ ...base, serviceDetailsKnown: 'yes' });
    expect(msg).toContain('will follow');
  });

  it('changes phrasing, not facts, in the softer tone', () => {
    const msg = announcePassing.renderMessage({ ...base, tone: 'softer', serviceDetailsKnown: 'no' });
    expect(msg).toMatch(/^It is with love and a heavy heart/);
    expect(msg).toContain('Margaret Hayes');
    expect(msg).toContain('May 29, 2026');
    expect(msg).toContain("We'll share details of the service as soon as we can.");
  });

  it('signs with the sender and appends a normalized obituary link', () => {
    const msg = announcePassing.renderMessage({ ...base, senderName: 'Peter', obituaryUrl: 'legacy.com/m' });
    expect(msg).toContain('— Peter');
    expect(msg.endsWith('\n\nhttps://legacy.com/m')).toBe(true);
  });
});

describe('shareService', () => {
  it('uses the right possessive for names ending in s', () => {
    expect(shareService.renderMessage({ deceasedName: 'James' })).toMatch(/^James' service/);
    expect(shareService.renderMessage({ deceasedName: 'Ann' })).toMatch(/^Ann's service/);
  });

  it('adds exactly one florist sentence when opted in', () => {
    const msg = shareService.renderMessage({
      deceasedName: 'Ann',
      serviceDate: 'June 14',
      floristName: 'Rose & Co',
      flowerDeliveryTarget: 'home',
    });
    expect(msg).toContain("If you'd like to send flowers, Rose & Co can deliver to the family's home.");
    expect(msg.match(/flowers/g)).toHaveLength(1);
  });
});

describe('copy rules (REQUIREMENTS C7)', () => {
  const everyField = {
    deceasedName: 'Margaret Hayes',
    dateOfPassing: 'May 29, 2026',
    personalNote: 'She was peaceful.',
    senderName: 'Peter',
    obituaryUrl: 'https://example.com/o',
    serviceDetailsKnown: 'yes',
    serviceDate: 'June 14, 2026',
    serviceTime: '2:00 PM',
    serviceLocation: "St. Mary's",
    serviceNotes: 'Reception to follow.',
    floristName: 'Rose & Co',
  };

  it.each(templates.map((t) => [t.id, t] as const))('%s never renders an exclamation point', (_id, t) => {
    expect(t.renderMessage(everyField)).not.toContain('!');
    expect(t.renderMessage({})).not.toContain('!');
  });
});

describe('composeMessage', () => {
  it('returns an empty string with no template', () => {
    expect(composeMessage(null, {})).toBe('');
    expect(composeMessage(undefined, {})).toBe('');
  });

  it('delegates to the template, so preview and send cannot drift', () => {
    const fields = { deceasedName: 'Ann' };
    expect(composeMessage(announcePassing, fields)).toBe(announcePassing.renderMessage(fields));
  });
});

describe('normalizeUrl', () => {
  it.each([
    [undefined, ''],
    ['   ', ''],
    ['example.com', 'https://example.com'],
    ['http://example.com', 'http://example.com'],
    ['HTTPS://Example.com', 'HTTPS://Example.com'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
});

describe('historyTagLabel', () => {
  it('labels aftercare as service details', () => {
    expect(historyTagLabel('announcement')).toBe('Announcement');
    expect(historyTagLabel('obituary')).toBe('Obituary');
    expect(historyTagLabel('aftercare')).toBe('Service details');
  });
});
