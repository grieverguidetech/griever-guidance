import { buildObituaryDraft, screenCopy } from '@griever/copy';
import type { Session } from '@griever/hooks';

const draftCopy = screenCopy('obituaryDraft');

export type ObituaryTextSource = Pick<
  Session,
  'personName' | 'dateOfPassing' | 'birthDate' | 'obituaryText' | 'obituaryCity' | 'obituaryCareer' | 'obituarySurvivors' | 'obituaryNote'
> &
  Partial<
    Pick<
      Session,
      'servicePlace' | 'serviceDate' | 'serviceTime' | 'serviceOfficiant' | 'burialPlace' | 'burialPrivate' | 'visitationPlace' | 'visitationDate' | 'visitationTime'
    >
  >;

/** True when any detail the template reads, beyond the name, is filled in. Otherwise a draft is only brackets. */
function hasFields(s: ObituaryTextSource): boolean {
  return [
    s.dateOfPassing, s.birthDate, s.obituaryCity, s.obituaryCareer, s.obituarySurvivors, s.obituaryNote,
    s.servicePlace, s.serviceDate, s.serviceTime, s.serviceOfficiant, s.burialPlace,
    s.visitationPlace, s.visitationDate, s.visitationTime,
  ].some((v) => (v ?? '').trim() !== '');
}

/**
 * The obituary text to send: the hand-edited text when there is one, else the draft built from the
 * fields (the same function and copy as web). Empty when neither has content.
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
