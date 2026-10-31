import { screenCopy } from '@griever/copy';
import { buildPlansText, downloadPlans, plansFileName } from './exportPlans';
import type { PlanPerson } from './exportPlans';

const copy = screenCopy('account');

const full: PlanPerson = {
  personName: 'Anna Lee',
  dateOfPassing: '2026-05-29',
  birthDate: '1948-03-02',
  serviceType: 'Memorial service',
  serviceDate: '2026-06-06',
  serviceTime: '2:00 PM',
  servicePlace: 'Oak Hall',
  serviceAddress: '12 Elm Street',
  serviceNotes: 'Parking is behind the hall.',
  visitationDate: '2026-06-05',
  visitationTime: '6:00 PM',
  burialPlace: 'Hillside Cemetery',
  burialPrivate: true,
  announcementMessage: 'Anna passed away on May 29.',
  serviceMessage: 'The service is on June 6.',
  obituaryText: 'Anna loved her garden.\nShe is missed.',
  thanksMessage: 'Thank you for being with us.',
};

/** jsdom's Blob has no text(). */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

describe('buildPlansText', () => {
  it('writes a full person under plain headings', () => {
    const text = buildPlansText([full], copy);
    expect(text).toContain('Anna Lee\n========');
    expect(text).toContain('Date of passing: May 29, 2026');
    expect(text).toContain('Birth date: March 2, 1948');
    expect(text).toContain('Place: Oak Hall');
    expect(text).toContain('Visitation: June 5, 2026, 6:00 PM');
    expect(text).toContain('Burial: Private, Hillside Cemetery');
    for (const heading of ['Dates', 'Service details', 'Announcement', 'Service message', 'Obituary', 'Thank-you message']) {
      expect(text).toContain(`\n${heading}\n${'-'.repeat(heading.length)}\n`);
    }
    expect(text).toContain('Anna loved her garden.\nShe is missed.');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('leaves out empty parts and never writes undefined or null', () => {
    const cleared = { announcementMessage: '', serviceMessage: '', thanksMessage: '   ' };
    const text = buildPlansText([{ personName: 'Sam', obituaryText: '  A kind man. ', dateOfPassing: null, ...cleared }], copy);
    expect(text).toContain('Sam\n===');
    expect(text).toContain('Obituary\n--------\nA kind man.');
    for (const gone of ['Dates', 'Service details', 'Announcement', 'Service message', 'Thank-you message', 'undefined', 'null']) {
      expect(text).not.toContain(gone);
    }
  });

  it('leaves out an obituary the family cleared, even when the inputs are filled in', () => {
    const text = buildPlansText([{ personName: 'Sam', obituaryText: '', obituaryCity: 'Reno', obituaryCareer: 'a teacher' }], copy);
    expect(text).not.toContain('Obituary');
    expect(text).not.toContain('Reno');
  });

  it('writes the obituary the editor shows when the text was never edited', () => {
    const text = buildPlansText(
      [{ personName: 'Sam Reed', dateOfPassing: '2026-05-29', obituaryCity: 'Reno', obituaryCareer: 'a teacher' }],
      copy,
    );
    expect(text).toContain('Obituary\n--------\n');
    expect(text.split('Obituary\n--------\n')[1]).toContain('Sam Reed');
    expect(text).toContain('Reno');
    expect(text).toContain('teacher');
    expect(text).not.toContain('undefined');
  });

  it('writes the service message the editor shows when it was never edited', () => {
    const text = buildPlansText(
      [{ personName: 'Sam Reed', serviceDate: '2026-06-06', serviceTime: '2:00 PM', servicePlace: 'Oak Hall' }],
      copy,
    );
    const body = text.split('Service message\n---------------\n')[1];
    expect(body).toContain('Oak Hall');
    expect(body).toContain('2:00 PM');
  });

  it('writes the announcement and thank-you message that follow the name when never edited', () => {
    const text = buildPlansText([{ personName: 'Sam Reed' }], copy);
    expect(text).toContain('Announcement\n------------\n');
    expect(text).toContain('Thank-you message\n-----------------\n');
    expect(text.split('Announcement\n------------\n')[1]).toContain('Sam Reed');
    expect(text.split('Thank-you message\n-----------------\n')[1]).toContain('Sam Reed');
  });

  it('uses the "Not named yet" label and keeps text that is not a complete date as typed', () => {
    const text = buildPlansText([{ personName: ' ', dateOfPassing: 'last spring' }], copy);
    expect(text).toContain('Not named yet\n=============');
    expect(text).toContain('Date of passing: last spring');
  });

  it('lists every person, in the order given', () => {
    const text = buildPlansText([{ personName: 'Zed' }, { personName: 'Amy' }], copy);
    expect(text.indexOf('Zed')).toBeLessThan(text.indexOf('Amy'));
  });

  it('never includes contacts, drafts, who was messaged, the checklist or send state', () => {
    const session = {
      ...full,
      id: 'local-1',
      flowId: 'flow-secret',
      ownerId: 'user-secret',
      senderName: 'Sender Secret',
      drafts: { announcement: { messageOverride: 'OVERRIDE-SECRET', selectedContactIds: ['contact-secret'] } },
      recipientsNotified: { announcement: ['contact-secret'] },
      selectedContactIds: ['contact-secret'],
      messageOverride: 'OVERRIDE-SECRET',
      checklist: { 'item-secret': 'done' },
      contacts: [{ contactId: 'contact-secret', phone: '+16175550148' }],
    };
    const text = buildPlansText([session], copy);
    for (const secret of ['secret', 'SECRET', '5550148', 'flow', 'local-1']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('plansFileName', () => {
  it('uses the local date', () => {
    expect(plansFileName(new Date(2026, 9, 31, 23, 30))).toBe('grievers-guidance-plans-2026-10-31.txt');
    expect(plansFileName(new Date(2026, 0, 5))).toBe('grievers-guidance-plans-2026-01-05.txt');
  });
});

describe('downloadPlans', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('saves a UTF-8 text file through a temporary link and revokes the URL after a delay', async () => {
    vi.useFakeTimers();
    const create = vi.fn().mockReturnValue('blob:plans');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    let clicked: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = this;
    });

    downloadPlans('hello é', new Date(2026, 9, 31));

    const blob = create.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/plain;charset=utf-8');
    expect(clicked?.download).toBe('grievers-guidance-plans-2026-10-31.txt');
    expect(clicked?.getAttribute('href')).toBe('blob:plans');
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith('blob:plans');
    expect(document.querySelector('a[download]')).toBeNull();
    vi.useRealTimers();
    expect(await readBlob(blob)).toBe('hello é');
  });
});
