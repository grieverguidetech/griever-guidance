import { describe, expect, it } from 'vitest';
import { plannedMessagePatch, sendPrefill } from './sendPrefill.js';

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
    ['aftercare', 'T'],
  ] as const)('%s uses its own section message', (category, expected) => {
    expect(sendPrefill({ ...planned, ...messages }, category).messageOverride).toBe(expected);
  });

  it('gives no message for the obituary, whose text is the publisher email', () => {
    expect(sendPrefill({ ...planned, ...messages }, 'obituary').messageOverride).toBeNull();
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

describe('plannedMessagePatch (#1077)', () => {
  const edit = { messageOverride: 'My own words.', messageFromWeb: false };
  const saved = { announcementMessage: 'From the web.', serviceMessage: 'S', thanksMessage: 'T' };

  it('saves a hand edit under the key of its moment', () => {
    expect(plannedMessagePatch('announcement', edit, saved)).toEqual({ announcementMessage: 'My own words.' });
    expect(plannedMessagePatch('service', edit, saved)).toEqual({ serviceMessage: 'My own words.' });
    expect(plannedMessagePatch('aftercare', edit, saved)).toEqual({ thanksMessage: 'My own words.' });
  });

  it('saves an edit when nothing was planned on the web', () => {
    expect(plannedMessagePatch('announcement', edit, {})).toEqual({ announcementMessage: 'My own words.' });
  });

  it('never saves the obituary link message or a missing moment', () => {
    expect(plannedMessagePatch('obituary', edit, saved)).toBeNull();
    expect(plannedMessagePatch(null, edit, saved)).toBeNull();
  });

  it('does not save the web\'s own wording', () => {
    expect(plannedMessagePatch('announcement', { messageOverride: 'From the web.', messageFromWeb: true }, saved)).toBeNull();
    expect(plannedMessagePatch('announcement', { messageOverride: 'Other', messageFromWeb: true }, saved)).toBeNull();
  });

  it('does not save when there is no edit (the suggested wording is back)', () => {
    expect(plannedMessagePatch('announcement', { messageOverride: null, messageFromWeb: false }, saved)).toBeNull();
  });

  it('does not save an edit equal to what is saved', () => {
    expect(plannedMessagePatch('announcement', { messageOverride: 'From the web.', messageFromWeb: false }, saved)).toBeNull();
  });

  it('does not save a blank edit, so clearing the box never empties the web wording', () => {
    expect(plannedMessagePatch('service', { messageOverride: '', messageFromWeb: false }, saved)).toBeNull();
    expect(plannedMessagePatch('service', { messageOverride: '  ', messageFromWeb: false }, saved)).toBeNull();
  });

  it('returns only the one planning key', () => {
    expect(Object.keys(plannedMessagePatch('service', edit, saved) ?? {})).toEqual(['serviceMessage']);
  });
});
