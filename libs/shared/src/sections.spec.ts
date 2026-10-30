import { describe, expect, it } from 'vitest';
import { SECTION_ORDER, defaultServiceMessage } from './index.js';

describe('SECTION_ORDER', () => {
  it('follows the real-world order (C10)', () => {
    expect(SECTION_ORDER).toEqual([
      'person',
      'announcement',
      'service',
      'obituary',
      'thanks',
    ]);
  });
});

describe('defaultServiceMessage', () => {
  const base = { personName: 'Margaret Hale', obituaryUrl: '' };

  it('uses every field', () => {
    const text = defaultServiceMessage({
      ...base,
      serviceDate: 'June 3, 2026',
      serviceTime: '2:00 PM',
      servicePlace: 'St. Mary Chapel',
      serviceAddress: '12 Elm Street',
      serviceNotes: 'Reception to follow.',
      obituaryUrl: 'https://example.com/obit',
    });
    expect(text).toContain(
      "Margaret Hale's service will be held June 3, 2026 at 2:00 PM, St. Mary Chapel, 12 Elm Street.",
    );
    expect(text).toContain('Reception to follow.');
    expect(text).toContain('https://example.com/obit');
    expect(text).not.toContain('!');
  });

  it('works with only a date', () => {
    const text = defaultServiceMessage({ ...base, serviceDate: 'June 3, 2026' });
    expect(text).toBe("Margaret Hale's service will be held June 3, 2026.");
  });

  it('uses the place alone when there is no address', () => {
    const text = defaultServiceMessage({ ...base, servicePlace: 'St. Mary Chapel' });
    expect(text).toBe("Margaret Hale's service will be held, St. Mary Chapel.");
  });

  it('uses the address alone when there is no place', () => {
    const text = defaultServiceMessage({ ...base, serviceAddress: '12 Elm Street' });
    expect(text).toContain(', 12 Elm Street.');
    expect(text).not.toContain(', ,');
  });

  it('falls back to "Our loved one" with no name', () => {
    const text = defaultServiceMessage({ personName: '', obituaryUrl: '' });
    expect(text.startsWith("Our loved one's service")).toBe(true);
    expect(text).not.toContain('!');
  });
});
