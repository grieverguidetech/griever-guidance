import { buildObituaryDraft, obituaryShareText, screenCopy } from '@griever/copy';
import type { ObituaryDraftFields } from '@griever/copy';
import type { Session } from '@griever/hooks';

const draftCopy = screenCopy('obituaryDraft');

/** The fields the builder reads beyond the older ones, so a person with only these gets a draft. */
export const NEW_OBITUARY_KEYS = [
  'obituaryGivenName', 'obituaryMiddleName', 'obituarySurname', 'obituaryAge', 'obituaryState', 'obituaryDeathPlace',
  'obituaryFuneralHome', 'obituaryChurch', 'obituaryCemeteryLocation', 'obituaryBirthPlace', 'obituaryMotherName',
  'obituaryFatherName', 'obituaryHighSchool', 'obituaryGradYear', 'obituaryDegree', 'obituaryCollege', 'obituaryJobTitle',
  'obituaryCompany', 'obituaryJobYears', 'obituaryHobbies', 'obituaryAwards', 'obituaryOrganizations', 'obituaryPronoun',
  'obituarySurvivorList', 'obituaryPrecededList',
] as const satisfies readonly (keyof ObituaryDraftFields)[];

export type ObituaryTextSource = Pick<
  Session,
  'personName' | 'dateOfPassing' | 'birthDate' | 'obituaryText' | 'obituaryCity' | 'obituaryCareer' | 'obituarySurvivors' | 'obituaryNote'
> &
  Partial<
    Pick<
      Session,
      | (typeof NEW_OBITUARY_KEYS)[number]
      | 'obituaryMemorial'
      | 'servicePlace' | 'serviceDate' | 'serviceTime' | 'serviceOfficiant' | 'burialPlace' | 'burialPrivate' | 'visitationPlace' | 'visitationDate' | 'visitationTime'
    >
  >;

/** True when any detail the template reads, beyond the name, is filled in. Otherwise a draft is only brackets. */
function hasFields(s: ObituaryTextSource): boolean {
  return [
    s.dateOfPassing, s.birthDate, s.obituaryCity, s.obituaryCareer, s.obituarySurvivors, s.obituaryNote,
    s.servicePlace, s.serviceDate, s.serviceTime, s.serviceOfficiant, s.burialPlace,
    s.visitationPlace, s.visitationDate, s.visitationTime,
    ...NEW_OBITUARY_KEYS.map((key) => s[key]),
  ].some((v) => (v ?? '').trim() !== '');
}

/**
 * The obituary body: the hand-edited text when there is one, else the draft built from the fields
 * (the same function and copy as web). This is what the always-editable box holds. Empty when neither has content.
 */
export function obituaryTextFor(s: ObituaryTextSource): string {
  const edited = s.obituaryText?.trim() ?? '';
  if (edited !== '') {
    return edited;
  }
  if (s.obituaryText !== undefined || !hasFields(s)) {
    return '';
  }
  return buildObituaryDraft({ ...s, dateOfPassing: s.dateOfPassing ?? undefined }, draftCopy).trim();
}

/**
 * The full text to show, email, copy and share: the body, with the memorial as the last paragraph.
 * Empty when the body is empty, so a memorial alone (or a cleared text) is not sent as an obituary.
 */
export function obituaryShareTextFor(s: ObituaryTextSource): string {
  const body = obituaryTextFor(s);
  if (body === '') {
    return '';
  }
  return obituaryShareText(body, s.obituaryMemorial ?? '');
}
