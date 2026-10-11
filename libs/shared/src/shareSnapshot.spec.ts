import { buildShareSnapshot, type ShareSessionDetails } from './index.js';

const checklist = [
  { label: 'Announce the passing', done: true },
  { label: 'Share the service', done: false },
  { label: 'Share the obituary', done: false },
  { label: 'Send thank-yous', done: false },
];

describe('buildShareSnapshot', () => {
  it('writes the exact snapshot, with the obituary in its real place', () => {
    const session: ShareSessionDetails = {
      personName: 'Margaret Hale',
      dateOfPassing: '2026-05-29',
      serviceDate: 'June 3, 2026',
      obituaryUrl: 'https://example.com/margaret',
      obituaryPublisher: 'The Waltham Register',
    };
    expect(buildShareSnapshot(session, checklist)).toEqual({
      title: 'Details for Margaret Hale',
      text: [
        'Details for Margaret Hale',
        '',
        'Name: Margaret Hale',
        'Date of passing: May 29, 2026',
        'Service: June 3, 2026',
        'Obituary: https://example.com/margaret (The Waltham Register)',
        '',
        'Checklist, in order:',
        '- Done: Announce the passing',
        '- Not yet: Share the service',
        '- Not yet: Share the obituary',
        '- Not yet: Send thank-yous',
        '',
        'This is a read-only copy. It has no contact information.',
      ].join('\n'),
    });
  });

  it('leaves out what is not known yet', () => {
    const { text } = buildShareSnapshot(
      { personName: 'Sam', dateOfPassing: null, obituaryUrl: '' },
      checklist,
    );
    expect(text).toContain('Name: Sam');
    expect(text).not.toMatch(/Date of passing|Service:|Obituary:/);
  });

  it('copes with no name', () => {
    const { title } = buildShareSnapshot(
      { personName: ' ', dateOfPassing: null, obituaryUrl: '' },
      [],
    );
    expect(title).toBe('Details');
  });

  it('never includes contacts, contact ids, phones, emails or message bodies', () => {
    const fullSession = {
      personName: 'Margaret Hale',
      dateOfPassing: null,
      obituaryUrl: '',
      senderName: 'Anna Reyes',
      recipientsNotified: { announcement: ['contact-id-123'] },
      draft: { messageBody: 'Dear Tom, with sorrow we share' },
      contacts: [{ contactId: 'contact-id-123', name: 'Tom Cole', phone: '+16175550148', email: 'tom@example.com' }],
    };
    const { text, title } = buildShareSnapshot(fullSession, checklist);
    for (const secret of [
      'contact-id-123',
      'Tom Cole',
      '6175550148',
      'tom@example.com',
      'Dear Tom',
      'Anna Reyes',
    ]) {
      expect(text).not.toContain(secret);
      expect(title).not.toContain(secret);
    }
  });

  it('has no exclamation points (C7)', () => {
    expect(buildShareSnapshot({ personName: 'A', dateOfPassing: null, obituaryUrl: '' }, checklist).text).not.toContain('!');
  });
});
