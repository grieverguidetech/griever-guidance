import { describe, expect, it } from 'vitest';
import {
  defaultServiceEventsMessage,
  defaultServiceMessage,
} from './index.js';

const base = {
  personName: 'Margaret Hale',
  serviceDate: 'June 3, 2026',
  serviceTime: '2:00 PM',
  servicePlace: 'St. Mary Chapel',
  obituaryUrl: '',
};

describe('defaultServiceEventsMessage', () => {
  it('equals the main service message when no events are set', () => {
    expect(defaultServiceEventsMessage(base)).toBe(
      defaultServiceMessage(base),
    );
  });

  it('adds a visitation sentence after the service', () => {
    const text = defaultServiceEventsMessage({
      ...base,
      visitationDate: 'June 2, 2026',
      visitationTime: '6:00 PM',
      visitationPlace: 'Hale Funeral Home',
    });
    expect(text).toBe(
      `${defaultServiceMessage(base)} Visitation will be held at Hale Funeral Home on June 2, 2026 at 6:00 PM.`,
    );
  });

  it('adds a burial sentence with the parts that are set', () => {
    const text = defaultServiceEventsMessage({
      ...base,
      burialPlace: 'Oak Hill Cemetery',
      burialTime: '11:00 AM',
    });
    expect(text).toContain(
      'The burial will be held at Oak Hill Cemetery at 11:00 AM.',
    );
  });

  it('says the burial is private and ignores burial details', () => {
    const text = defaultServiceEventsMessage({
      ...base,
      burialPrivate: true,
      burialPlace: 'Oak Hill Cemetery',
    });
    expect(text).toContain('The burial will be private.');
    expect(text).not.toContain('Oak Hill');
  });

  it('adds a reception sentence', () => {
    const text = defaultServiceEventsMessage({
      ...base,
      receptionPlace: 'the parish hall',
    });
    expect(text).toContain('A reception will be held at the parish hall.');
  });

  it('handles a place without a date', () => {
    const text = defaultServiceEventsMessage({
      ...base,
      visitationPlace: 'Hale Funeral Home',
    });
    expect(text).toContain('Visitation will be held at Hale Funeral Home.');
  });

  it('keeps the events in order and the URL last, on its own paragraph', () => {
    const text = defaultServiceEventsMessage({
      ...base,
      obituaryUrl: 'https://example.com/obit',
      visitationPlace: 'A',
      burialPlace: 'B',
      receptionPlace: 'C',
    });
    const v = text.indexOf('Visitation');
    const b = text.indexOf('burial');
    const r = text.indexOf('reception');
    expect(v).toBeGreaterThan(text.indexOf('service will be held'));
    expect(b).toBeGreaterThan(v);
    expect(r).toBeGreaterThan(b);
    expect(text.endsWith('\n\nhttps://example.com/obit')).toBe(true);
  });

  it('leaves the officiant out of the message', () => {
    const text = defaultServiceEventsMessage({
      ...base,
      serviceOfficiant: 'Father Tom',
    });
    expect(text).not.toContain('Father Tom');
  });

  it('never uses an exclamation point', () => {
    const text = defaultServiceEventsMessage({
      ...base,
      obituaryUrl: 'https://example.com/obit',
      visitationPlace: 'A',
      burialPlace: 'B',
      receptionPlace: 'C',
    });
    expect(text).not.toContain('!');
  });
});
