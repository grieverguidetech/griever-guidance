import { describe, expect, it } from 'vitest';
import { composeMessage, estimateSmsSegments, SMS_SEGMENT_LENGTH } from './messageCompose.js';
import { templates } from './templates.js';

describe('estimateSmsSegments', () => {
  it('is 0 for an empty message', () => {
    expect(estimateSmsSegments('')).toBe(0);
  });

  it('is 1 right up to the segment boundary', () => {
    expect(estimateSmsSegments('a'.repeat(SMS_SEGMENT_LENGTH))).toBe(1);
  });

  it('is 2 one character past the boundary — shortens nothing, just counts', () => {
    expect(estimateSmsSegments('a'.repeat(SMS_SEGMENT_LENGTH + 1))).toBe(2);
  });
});

describe('composed message length (tasks/04-sending.md §6)', () => {
  // "The obituary URL is what usually pushes it over — shorten nothing, just
  // count and warn." This doesn't fail the suite (nothing here should be
  // trimmed) — it's a standing check so a future template edit that quietly
  // pushes every send into 2+ segments doesn't go unnoticed.
  const obituary = templates.find((t) => t.category === 'obituary');
  if (!obituary) throw new Error('obituary template missing — templates.ts changed shape');

  const longObituaryUrl = 'https://example.com/obituaries/dorothy-anne-sullivan-1945-2026-full-memorial-page';

  it('reports how many segments a realistic obituary share takes, without altering the text', () => {
    const message = composeMessage(obituary, {
      deceasedName: 'Dorothy Anne Sullivan',
      obituaryUrl: longObituaryUrl,
    });
    const segments = estimateSmsSegments(message);
    // eslint-disable-next-line no-console
    console.warn(
      `[messageCompose] obituary share is ${message.length} chars (~${segments} SMS segment${segments === 1 ? '' : 's'})`,
    );
    expect(message).toContain(longObituaryUrl);
    expect(segments).toBeGreaterThanOrEqual(1);
  });
});
