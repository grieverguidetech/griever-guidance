import { describe, expect, it } from 'vitest';
import { sendPrefill } from './sendPrefill.js';

const planned = {
  personName: 'Anna Rose',
  dateOfPassing: 'June 1, 2026',
  serviceDate: 'June 14, 2026',
  serviceTime: '2:00 PM',
  servicePlace: 'St. Mary Church',
  serviceAddress: '12 Main St',
  serviceNotes: 'Reception to follow',
};

describe('sendPrefill fields', () => {
  it('maps the planned details to template fields', () => {
    expect(sendPrefill(planned, 'service').fields).toEqual({
      deceasedName: 'Anna Rose',
      dateOfPassing: 'June 1, 2026',
      serviceDate: 'June 14, 2026',
      serviceTime: '2:00 PM',
      serviceLocation: 'St. Mary Church, 12 Main St',
      serviceNotes: 'Reception to follow',
    });
  });

  it('carries the sender name for the thank-you form', () => {
    expect(sendPrefill({ ...planned, senderName: 'The Hayes Family' }, 'aftercare').fields['senderName']).toBe('The Hayes Family');
  });

  it('joins place and address sensibly when one is missing', () => {
    expect(sendPrefill({ ...planned, serviceAddress: '' }, 'service').fields['serviceLocation']).toBe('St. Mary Church');
    expect(sendPrefill({ ...planned, servicePlace: undefined }, 'service').fields['serviceLocation']).toBe('12 Main St');
  });

  it('leaves out blank values', () => {
    const { fields } = sendPrefill({ personName: 'Anna', dateOfPassing: '  ', serviceDate: '' }, 'announcement');
    expect(fields).toEqual({ deceasedName: 'Anna' });
  });
});

describe('sendPrefill message', () => {
  const messages = {
    serviceMessage: 'S',
    announcementMessage: 'A',
    obituaryText: 'O',
    thanksMessage: 'T',
  };

  it.each([
    ['service', 'S'],
    ['announcement', 'A'],
    ['obituary', 'O'],
    ['aftercare', 'T'],
  ] as const)('%s uses its own section message', (category, expected) => {
    expect(sendPrefill({ ...planned, ...messages }, category).messageOverride).toBe(expected);
  });

  it('gives no override when the message is undefined or null', () => {
    expect(sendPrefill(planned, 'service').messageOverride).toBeNull();
    expect(
      sendPrefill({ ...planned, serviceMessage: null as unknown as undefined }, 'service').messageOverride,
    ).toBeNull();
  });

  it('keeps an empty message as empty', () => {
    expect(sendPrefill({ ...planned, serviceMessage: '' }, 'service').messageOverride).toBe('');
  });
});
