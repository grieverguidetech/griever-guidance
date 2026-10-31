import type { Session } from '@griever/hooks';
import { buildObituaryDraft, fill, screenCopy } from '@griever/copy';
import { announcePassing, defaultServiceEventsMessage, parseCompleteDate } from '@griever/shared';

const thanksCopy = screenCopy('cmsThanks');
const obituaryDraftCopy = screenCopy('obituaryDraft');

/** The copy keys the file needs. The headings live in libs/copy so the wording is in one place. */
export interface PlansCopy {
  fileTitle: string;
  fileUnnamed: string;
  fileDatesHeading: string;
  fileDateOfPassing: string;
  fileBirthDate: string;
  fileServiceHeading: string;
  fileServiceType: string;
  fileServiceDate: string;
  fileServiceTime: string;
  fileServicePlace: string;
  fileServiceAddress: string;
  fileServiceNotes: string;
  fileServiceOfficiant: string;
  fileVisitation: string;
  fileBurial: string;
  fileBurialPrivate: string;
  fileReception: string;
  fileAnnouncementHeading: string;
  fileServiceMessageHeading: string;
  fileObituaryHeading: string;
  fileThanksHeading: string;
}

/**
 * Only the fields that go in the file. Naming them keeps contacts, drafts, who was messaged,
 * the checklist and any message override out by construction (C3, C4).
 */
export type PlanPerson = Partial<
  Pick<
    Session,
    | 'personName'
    | 'obituaryUrl'
    | 'obituaryCity'
    | 'obituaryCareer'
    | 'obituarySurvivors'
    | 'obituaryNote'
    | 'dateOfPassing'
    | 'birthDate'
    | 'serviceType'
    | 'serviceDate'
    | 'serviceTime'
    | 'servicePlace'
    | 'serviceAddress'
    | 'serviceNotes'
    | 'serviceOfficiant'
    | 'visitationDate'
    | 'visitationTime'
    | 'visitationPlace'
    | 'burialDate'
    | 'burialTime'
    | 'burialPlace'
    | 'burialPrivate'
    | 'receptionDate'
    | 'receptionTime'
    | 'receptionPlace'
    | 'announcementMessage'
    | 'serviceMessage'
    | 'obituaryText'
    | 'thanksMessage'
  >
>;

// Birth dates go well before the default 2000-2100 range.
const ANY_YEAR = { minYear: 1000, maxYear: 9999 };

/** "May 29, 2026" when the date is complete; otherwise whatever was typed. */
function dateText(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  const date = parseCompleteDate(text, ANY_YEAR);
  if (!date) {
    return text;
  }
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

type Line = [label: string, value: string];

/** "Label: value" for each line that has a value. */
function labelled(lines: Line[]): string[] {
  return lines.filter(([, value]) => value !== '').map(([label, value]) => `${label}: ${value}`);
}

/** Joins the parts of one event ("May 29, 2026, 2:00 PM, Oak Hall") and leaves out the empty ones. */
function eventLine(label: string, parts: string[]): Line {
  return [label, parts.filter((part) => part !== '').join(', ')];
}

function section(heading: string, body: string[]): string[] {
  if (body.length === 0) {
    return [];
  }
  return [heading, '-'.repeat(heading.length), ...body, ''];
}

/**
 * The four messages follow the person's details until the family edits them (undefined), so the
 * same builders the editor sections use fill in an unedited one. A string is the family's wording;
 * '' means they cleared it and the part is left out.
 */
function messages(person: PlanPerson) {
  const name = person.personName ?? '';
  return {
    announcement:
      person.announcementMessage ??
      announcePassing.renderMessage({ deceasedName: name, dateOfPassing: person.dateOfPassing ?? '' }),
    service:
      person.serviceMessage ??
      defaultServiceEventsMessage({
        personName: name,
        serviceDate: person.serviceDate,
        obituaryUrl: person.obituaryUrl ?? '',
        serviceTime: person.serviceTime,
        servicePlace: person.servicePlace,
        serviceAddress: person.serviceAddress,
        serviceNotes: person.serviceNotes,
        visitationDate: person.visitationDate,
        visitationTime: person.visitationTime,
        visitationPlace: person.visitationPlace,
        burialDate: person.burialDate,
        burialTime: person.burialTime,
        burialPlace: person.burialPlace,
        burialPrivate: person.burialPrivate,
        receptionDate: person.receptionDate,
        receptionTime: person.receptionTime,
        receptionPlace: person.receptionPlace,
      }),
    obituary:
      person.obituaryText ??
      buildObituaryDraft(
        {
          fullName: name,
          dateOfBirth: person.birthDate,
          dateOfPassing: person.dateOfPassing ?? undefined,
          cityOfResidence: person.obituaryCity,
          career: person.obituaryCareer,
          survivors: person.obituarySurvivors,
          personalNote: person.obituaryNote,
        },
        obituaryDraftCopy,
      ),
    thanks: person.thanksMessage ?? fill(thanksCopy.template, { deceasedName: name.trim() || thanksCopy.nameFallback }),
  };
}

function personBlock(person: PlanPerson, copy: PlansCopy): string[] {
  const name = clean(person.personName) || copy.fileUnnamed;
  const dates = labelled([
    [copy.fileDateOfPassing, dateText(person.dateOfPassing)],
    [copy.fileBirthDate, dateText(person.birthDate)],
  ]);
  const service = labelled([
    [copy.fileServiceType, clean(person.serviceType)],
    [copy.fileServiceDate, dateText(person.serviceDate)],
    [copy.fileServiceTime, clean(person.serviceTime)],
    [copy.fileServicePlace, clean(person.servicePlace)],
    [copy.fileServiceAddress, clean(person.serviceAddress)],
    [copy.fileServiceOfficiant, clean(person.serviceOfficiant)],
    eventLine(copy.fileVisitation, [dateText(person.visitationDate), clean(person.visitationTime), clean(person.visitationPlace)]),
    eventLine(copy.fileBurial, [
      person.burialPrivate ? copy.fileBurialPrivate : '',
      dateText(person.burialDate),
      clean(person.burialTime),
      clean(person.burialPlace),
    ]),
    eventLine(copy.fileReception, [dateText(person.receptionDate), clean(person.receptionTime), clean(person.receptionPlace)]),
    [copy.fileServiceNotes, clean(person.serviceNotes)],
  ]);
  const text = (heading: string, value: string | undefined) => (clean(value) === '' ? [] : section(heading, [clean(value)]));
  const message = messages(person);
  return [
    name,
    '='.repeat(name.length),
    '',
    ...section(copy.fileDatesHeading, dates),
    ...section(copy.fileServiceHeading, service),
    ...text(copy.fileAnnouncementHeading, message.announcement),
    ...text(copy.fileServiceMessageHeading, message.service),
    ...text(copy.fileObituaryHeading, message.obituary),
    ...text(copy.fileThanksHeading, message.thanks),
  ];
}

/**
 * One plain-text document for every person given: the name, then only the parts that have something in them.
 * Pass the sessions the People screen lists. Pure: no storage, no network.
 */
export function buildPlansText(sessions: readonly PlanPerson[], copy: PlansCopy): string {
  const blocks = sessions.map((person) => personBlock(person, copy).join('\n').trimEnd());
  return `${[copy.fileTitle, ...blocks].join('\n\n\n')}\n`;
}

/** grievers-guidance-plans-2026-10-31.txt, from the local date. */
export function plansFileName(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `grievers-guidance-plans-${y}-${m}-${d}.txt`;
}

const REVOKE_DELAY_MS = 1000;

/** Saves the text as a file on this device. Nothing is sent anywhere. */
export function downloadPlans(text: string, now: Date = new Date()): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = plansFileName(now);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari can cancel the download if the URL is revoked at once.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
